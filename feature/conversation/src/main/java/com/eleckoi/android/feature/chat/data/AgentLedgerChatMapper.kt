package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.eleckoi.conversation.LedgerMessage
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.roleplay.actions.reconcileGenerateImageActionState

internal fun ChatMessage.toLedgerMessage(): LedgerMessage = LedgerMessage(
    id = id,
    role = role.storageValue(),
    content = content,
    reasoningContent = reasoningContent,
    provider = provider,
    model = model,
    createdAt = createdAt,
    pending = pending,
    variableStateJson = variableStateJson,
    toolCallsJson = toolCallsJsonString(toolCalls),
    imageAttachmentsJson = imageAttachmentsJsonString(imageAttachments),
    inputImageAttachmentsJson = inputImageAttachmentsJsonString(inputImageAttachments),
    modelHistoryItems = modelHistoryItems,
    runtimeThreadId = runtimeThreadId,
    runtimeTurnId = runtimeTurnId,
    turnStartedAtMillis = turnStartedAtMillis,
    turnCompletedAtMillis = turnCompletedAtMillis,
)

internal fun LedgerMessage.toChatMessage(): ChatMessage {
    val images = imageAttachmentsFromJsonString(imageAttachmentsJson)
    return ChatMessage(
        id = id,
        role = role.toMessageRole(),
        content = content,
        reasoningContent = reasoningContent,
        provider = provider,
        model = model,
        createdAt = createdAt,
        pending = pending,
        variableStateJson = variableStateJson,
        toolCalls = reconcileGenerateImageActionState(
            toolCalls = toolCallsFromJsonString(toolCallsJson),
            imageAttachments = images,
            completedAtMillis = turnCompletedAtMillis ?: 0L,
        ),
        imageAttachments = images,
        inputImageAttachments = inputImageAttachmentsFromJsonString(inputImageAttachmentsJson),
        modelHistoryItems = modelHistoryItems,
        runtimeThreadId = runtimeThreadId,
        runtimeTurnId = runtimeTurnId,
        turnStartedAtMillis = turnStartedAtMillis,
        turnCompletedAtMillis = turnCompletedAtMillis,
    )
}

private fun MessageRole.storageValue(): String = when (this) {
    MessageRole.User -> "user"
    MessageRole.Assistant -> "assistant"
    MessageRole.System -> "system"
}

private fun String.toMessageRole(): MessageRole = when (this) {
    "user" -> MessageRole.User
    "system" -> MessageRole.System
    else -> MessageRole.Assistant
}
