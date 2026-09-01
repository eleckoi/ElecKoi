package com.eleckoi.android.feature.chat.ui

import com.eleckoi.android.engine.generation.model.supportsImageInput
import com.eleckoi.android.feature.chat.api.ChatService
import com.eleckoi.android.feature.chat.data.MaxChatInputImages
import com.eleckoi.android.feature.chat.data.MaxChatInputMessageImageBytes
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Prepares and owns temporary composer images; generation consumes only committed state. */
internal class ChatInputImageController(
    private val scope: CoroutineScope,
    private val chatService: ChatService,
    private val state: () -> ChatUiState,
    private val updateState: ((ChatUiState) -> ChatUiState) -> Unit,
) {
    fun add(uriValues: List<String>) {
        val snapshot = state()
        if (snapshot.isSending || snapshot.isPreparingInputImages || uriValues.isEmpty()) return
        val draft = snapshot.draft
        if (draft?.selectedModelConfig?.supportsImageInput(draft.selectedModel) != true) {
            updateState { it.copy(errorMessage = "请先在当前模型设置中开启图片输入") }
            return
        }
        val remaining = (MaxChatInputImages - snapshot.inputImages.size).coerceAtLeast(0)
        if (remaining == 0) {
            updateState { it.copy(errorMessage = "每条消息最多发送 $MaxChatInputImages 张图片") }
            return
        }
        updateState { it.copy(isPreparingInputImages = true, moreToolsOpen = false) }
        scope.launch {
            val prepared = try {
                withContext(Dispatchers.IO) {
                    chatService.prepareInputImages(uriValues.take(remaining))
                }
            } catch (error: Throwable) {
                updateState {
                    it.copy(
                        isPreparingInputImages = false,
                        errorMessage = error.message ?: "读取图片失败",
                    )
                }
                return@launch
            }
            val combined = state().inputImages + prepared
            if (combined.sumOf { it.bytes } > MaxChatInputMessageImageBytes) {
                withContext(Dispatchers.IO) { prepared.forEach(chatService::discardInputImage) }
                updateState {
                    it.copy(
                        isPreparingInputImages = false,
                        errorMessage = "每条消息的图片总大小不能超过 20 MiB",
                    )
                }
            } else {
                updateState {
                    it.copy(
                        inputImages = combined,
                        isPreparingInputImages = false,
                        errorMessage = "",
                    )
                }
            }
        }
    }

    fun remove(imageId: String) {
        val image = state().inputImages.firstOrNull { it.id == imageId } ?: return
        updateState {
            it.copy(inputImages = it.inputImages.filterNot { item -> item.id == imageId })
        }
        scope.launch(Dispatchers.IO) { chatService.discardInputImage(image) }
    }
}
