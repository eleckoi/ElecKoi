package com.eleckoi.android.feature.chat.roleplay.actions

import com.eleckoi.android.foundation.diagnostics.CrashDiagnostics
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.engine.generation.image.ImageGenerationRequestCapture
import com.eleckoi.android.engine.generation.image.ReplyImageGenerator
import com.eleckoi.android.engine.generation.image.SceneImagePrompt
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.storyImageCountRange
import com.eleckoi.android.feature.chat.model.ChatImageAttachment
import com.eleckoi.android.feature.chat.model.ChatImageStatus
import com.eleckoi.android.feature.chat.model.ChatToolCallRecord
import com.eleckoi.android.feature.chat.model.content.ToolCallState
import com.eleckoi.android.feature.chat.data.ImageGenerationAttemptStore
import java.util.UUID
import java.util.concurrent.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

internal data class RoleplayActionReceipt(
    val label: String,
    val failure: String,
    val failed: Boolean,
)

/** Owns the one-way generate_image action lifecycle for a single roleplay turn. */
internal class RoleplayImageActionController(
    private val imageConfig: ModelConfig?,
    private val scope: CoroutineScope,
    private val generator: ReplyImageGenerator,
    private val sessionId: String,
    private val messageId: String,
    private val parentAttemptId: String,
    private val generationAttempts: ImageGenerationAttemptStore,
    private val characterImagePrompt: String,
    private val onRequestCapture: (turnId: String, capture: ImageGenerationRequestCapture) -> Unit,
) {
    @Volatile
    private var cancelled = false
    private var failure: String = ""
    private var generations: List<Deferred<ChatImageAttachment>>? = null
    private var pendingAttachments: List<ChatImageAttachment> = emptyList()
    private val generationSlots = Semaphore(1)
    private val completions = Channel<ChatImageAttachment>(Channel.UNLIMITED)

    fun accept(
        name: String,
        turnId: String,
        argumentsJson: String,
    ): RoleplayActionReceipt {
        if (name != GenerateImageActionName) {
            val error = "不支持的动作：$name"
            return RoleplayActionReceipt(label = name, failure = error, failed = true)
        }
        val error = when {
            cancelled -> "本轮生成已停止"
            imageConfig == null -> "当前没有启用配图配置"
            generations != null -> "本轮只允许一次 generate_image"
            else -> runCatching {
                parseGenerateImageAction(argumentsJson)
            }.fold(
                onSuccess = { prompts ->
                    val allowed = imageConfig.imageSettings.storyImageCountRange()
                    if (prompts.size !in allowed) {
                        "本轮需要 ${allowed.countDescription()}，模型输出了 ${prompts.size} 张"
                    } else if (prompts.map { it.frameIndex } != (1..prompts.size).toList()) {
                        "分镜 id 必须从 1 开始连续排列，并且不能重复"
                    } else {
                        pendingAttachments = prompts.map { prompt ->
                            val attachmentId = newAttachmentId(prompt.frameIndex)
                            val attemptId = generationAttempts.beginImageAttempt(
                                conversationId = sessionId,
                                attachmentId = attachmentId,
                                outputMessageId = messageId,
                                parentAttemptId = parentAttemptId,
                            )
                            ChatImageAttachment(
                                id = attachmentId,
                                generationAttemptId = attemptId,
                                prompt = prompt.prompt,
                                negativePrompt = prompt.negativePrompt,
                                frameIndex = prompt.frameIndex,
                                frameCount = prompts.size,
                                imageWidth = imageConfig.imageSettings.width,
                                imageHeight = imageConfig.imageSettings.height,
                            )
                        }
                        generations = prompts.zip(pendingAttachments).map { (prompt, attachment) ->
                            startGeneration(
                                activeConfig = imageConfig,
                                prompt = prompt,
                                attachment = attachment,
                                turnId = turnId,
                            )
                        }
                        ""
                    }
                },
                onFailure = { cause ->
                    cause.message.orEmpty().ifBlank { "generate_image 参数无效" }
                },
            )
        }
        if (error.isNotBlank()) failure = error
        return RoleplayActionReceipt(
            label = "生成配图",
            failure = error,
            failed = error.isNotBlank(),
        )
    }

    /** ACTION_CALL is the complete one-way command; generation starts without waiting for text. */
    private fun startGeneration(
        activeConfig: ModelConfig,
        prompt: SceneImagePrompt,
        attachment: ChatImageAttachment,
        turnId: String,
    ): Deferred<ChatImageAttachment> = scope.async(Dispatchers.IO) {
        val completed = try {
            val localPath: String? = generationSlots.withPermit {
                if (!generationAttempts.markImageRunning(attachment.generationAttemptId)) {
                    null
                } else {
                    CrashDiagnostics.memoryBreadcrumb(
                        event = "image_generation_started",
                        fields = mapOf(
                            "frame" to attachment.frameIndex,
                            "count" to attachment.frameCount,
                            "width" to attachment.imageWidth,
                            "height" to attachment.imageHeight,
                        ),
                    )
                    generator.generate(
                        imageConfig = activeConfig,
                        sessionId = sessionId,
                        imageId = attachment.id,
                        characterImagePrompt = characterImagePrompt,
                        scenePrompt = prompt,
                        onRequestCapture = { capture -> onRequestCapture(turnId, capture) },
                    )
                }
            }
            if (localPath == null) {
                attachment.copy(
                    status = ChatImageStatus.Failed,
                    errorMessage = "图片生成已被新的尝试替代",
                )
            } else {
                val ready = attachment.copy(
                    localPath = localPath,
                    status = ChatImageStatus.Ready,
                )
                if (
                    generationAttempts.markImageSucceeded(
                        attemptId = attachment.generationAttemptId,
                        outputPath = ready.localPath,
                    )
                ) {
                    CrashDiagnostics.memoryBreadcrumb(
                        event = "image_generation_succeeded",
                        fields = mapOf("frame" to attachment.frameIndex),
                    )
                    ready
                } else {
                    generator.deleteGeneratedFiles(listOf(localPath))
                    attachment.copy(
                        status = ChatImageStatus.Failed,
                        errorMessage = "图片生成已被新的尝试替代",
                    )
                }
            }
        } catch (error: CancellationException) {
            generationAttempts.markImageCancelled(
                attemptId = attachment.generationAttemptId,
                reason = "图片生成已停止",
            )
            throw error
        } catch (error: Throwable) {
            CrashDiagnostics.memoryBreadcrumb(
                event = "image_generation_failed",
                fields = mapOf(
                    "frame" to attachment.frameIndex,
                    "type" to error.javaClass.name,
                ),
            )
            val failed = attachment.copy(
                status = ChatImageStatus.Failed,
                errorMessage = error.message
                    ?.replace(Regex("\\s+"), " ")
                    ?.trim()
                    ?.take(180)
                    .orEmpty()
                    .ifBlank { "图片生成失败" },
            )
            generationAttempts.markImageFailed(attachment.generationAttemptId, failed.errorMessage)
            failed
        }
        completions.send(completed)
        completed
    }

    fun generatingAttachments(): List<ChatImageAttachment> = pendingAttachments

    fun cancel() {
        cancelled = true
        generations.orEmpty().forEach { generation -> generation.cancel() }
        completions.close(CancellationException("本轮生成已停止"))
    }

    fun attachmentsForCompletedReply(hasText: Boolean): List<ChatImageAttachment> {
        if (imageConfig == null || !hasText) return emptyList()
        return if (generations != null) {
            pendingAttachments
        } else {
            listOf(
                ChatImageAttachment(
                    id = newAttachmentId(1),
                    status = ChatImageStatus.Failed,
                    errorMessage = failure.ifBlank { "模型未输出 generate_image 动作" },
                    imageWidth = imageConfig.imageSettings.width,
                    imageHeight = imageConfig.imageSettings.height,
                ),
            )
        }
    }

    suspend fun collectCompletionUpdates(
        onUpdate: suspend (List<ChatImageAttachment>) -> Unit,
    ): List<ChatImageAttachment> {
        val active = generations ?: return emptyList()
        var current = pendingAttachments
        repeat(active.size) {
            val completed = completions.receive()
            current = current.map { attachment ->
                if (attachment.id == completed.id) completed else attachment
            }
            onUpdate(current)
        }
        active.awaitAll()
        return current
    }

    private fun newAttachmentId(frameIndex: Int): String =
        "reply-image-$messageId-$frameIndex-${UUID.randomUUID()}"
}

private fun IntRange.countDescription(): String = if (first == last) {
    "恰好 $first 张"
} else {
    "$first 到 $last 张"
}

/** Keeps the visible Action lifecycle consistent with the terminal image attachment. */
internal fun reconcileGenerateImageActionState(
    toolCalls: List<ChatToolCallRecord>,
    imageAttachments: List<ChatImageAttachment>,
    completedAtMillis: Long,
): List<ChatToolCallRecord> {
    if (imageAttachments.isEmpty() || imageAttachments.any { it.status == ChatImageStatus.Generating }) {
        return toolCalls
    }
    val failedImages = imageAttachments.filter { it.status == ChatImageStatus.Failed }
    val terminalState = if (failedImages.isEmpty()) ToolCallState.Succeeded else ToolCallState.Failed
    return toolCalls.map { call ->
        if (
            call.workItemType == AgentWorkItemType.Action &&
            call.toolName == GenerateImageActionName &&
            call.state in setOf(ToolCallState.Pending, ToolCallState.Running)
        ) {
            call.copy(
                result = failedImages.joinToString("；") { it.errorMessage }.take(360),
                state = terminalState,
                completedAtMillis = completedAtMillis.takeIf { it > 0L } ?: System.currentTimeMillis(),
            )
        } else {
            call
        }
    }
}
