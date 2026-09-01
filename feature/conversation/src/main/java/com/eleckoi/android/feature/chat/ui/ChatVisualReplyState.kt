package com.eleckoi.android.feature.chat.ui

internal data class ChatVisualReplyKey(
    val messageId: String,
    val generation: Int,
)

internal enum class ChatVisualReplyPhase {
    Process,
    FinalAnswer,
}

/**
 * A pre-draw anchor belongs to a visible phase boundary, while measured height following remains
 * owned by [replyKey] for the whole generation. Separating them prevents the final hand-off from
 * resetting the live height owner.
 */
internal data class ChatVisualReplyPhaseAnchor(
    val replyKey: ChatVisualReplyKey,
    val phase: ChatVisualReplyPhase,
)

internal fun ChatVisualReplyKey.phaseAnchor(finalAnswerVisible: Boolean): ChatVisualReplyPhaseAnchor =
    ChatVisualReplyPhaseAnchor(
        replyKey = this,
        phase = if (finalAnswerVisible) {
            ChatVisualReplyPhase.FinalAnswer
        } else {
            ChatVisualReplyPhase.Process
        },
    )

internal data class ChatVisualReplyState(
    private val generationsByMessageId: Map<String, Int> = emptyMap(),
    val activeKey: ChatVisualReplyKey? = null,
    val visuallyComplete: Boolean = true,
) {
    val isCompleting: Boolean
        get() = activeKey != null && !visuallyComplete

    fun begin(key: ChatVisualReplyKey): ChatVisualReplyState {
        if (activeKey == key) return this
        return copy(
            generationsByMessageId = generationsByMessageId + (key.messageId to key.generation),
            activeKey = key,
            visuallyComplete = false,
        )
    }

    fun complete(key: ChatVisualReplyKey): ChatVisualReplyState {
        if (key != activeKey || visuallyComplete) return this
        return copy(visuallyComplete = true)
    }

    fun cancel(): ChatVisualReplyState {
        if (!isCompleting) return this
        return copy(visuallyComplete = true)
    }

    fun generationFor(messageId: String?): Int {
        return messageId?.let(generationsByMessageId::get) ?: 0
    }

    fun showStopButton(providerActive: Boolean): Boolean {
        return providerActive || isCompleting
    }
}

internal fun generationVisualReplyKey(
    presentation: ChatGenerationPresentation?,
    sessionId: String,
    latestAssistantMessageId: String?,
): ChatVisualReplyKey? {
    val generation = presentation ?: return null
    val messageId = latestAssistantMessageId ?: return null
    if (
        generation.sessionId != sessionId ||
        generation.assistantMessageId != messageId
    ) {
        return null
    }
    return ChatVisualReplyKey(
        messageId = messageId,
        generation = generation.generation,
    )
}
