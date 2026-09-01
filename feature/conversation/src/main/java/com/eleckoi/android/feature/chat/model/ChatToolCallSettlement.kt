package com.eleckoi.android.feature.chat.model

import com.eleckoi.android.feature.chat.model.content.ToolCallState

/** Settles visible tool cards when the enclosing agent turn never commits. */
fun List<ChatToolCallRecord>.settleAbortedToolCalls(reason: String): List<ChatToolCallRecord> = map { call ->
    when {
        call.state == ToolCallState.Succeeded && call.rollbackOnAbort -> call.copy(
            result = listOf(call.result, "本轮未完成，暂存修改已回滚：$reason")
                .filter(String::isNotBlank)
                .joinToString("\n"),
            state = ToolCallState.Failed,
        )

        call.state == ToolCallState.Pending || call.state == ToolCallState.Running -> call.copy(
            result = call.result.ifBlank { reason },
            state = ToolCallState.Failed,
        )

        else -> call
    }
}

/**
 * Converts a crash checkpoint or interrupted live reply into a durable terminal message.
 *
 * A pending reply is persisted while streaming so process death does not discard visible work.
 * Every abort path must therefore clear all liveness-bearing fields together; otherwise Room can
 * restore a reply that looks active even though no generation owns it anymore.
 */
fun ChatMessage.settleAbortedGeneration(
    reason: String,
    completedAtMillis: Long,
): ChatMessage {
    val hasLiveToolCalls = toolCalls.any { call ->
        call.state == ToolCallState.Pending || call.state == ToolCallState.Running
    }
    val hasLiveImages = imageAttachments.any { image ->
        image.status == ChatImageStatus.Generating
    }
    // The model reply can be terminal while its one-way image action is still running. Stopping
    // that turn must therefore settle action/image liveness even after `pending` became false.
    if (!pending && !hasLiveToolCalls && !hasLiveImages) return this
    return copy(
        pending = false,
        toolCalls = toolCalls.settleAbortedToolCalls(reason),
        imageAttachments = imageAttachments.map { image ->
            if (image.status == ChatImageStatus.Generating) {
                image.copy(status = ChatImageStatus.Failed, errorMessage = reason)
            } else {
                image
            }
        },
        turnCompletedAtMillis = turnCompletedAtMillis ?: completedAtMillis,
    )
}

/** True while any part of this visible reply still belongs to the active generation lease. */
fun ChatMessage.hasLiveGenerationState(): Boolean =
    pending ||
        toolCalls.any { call ->
            call.state == ToolCallState.Pending || call.state == ToolCallState.Running
        } ||
        imageAttachments.any { image -> image.status == ChatImageStatus.Generating }
