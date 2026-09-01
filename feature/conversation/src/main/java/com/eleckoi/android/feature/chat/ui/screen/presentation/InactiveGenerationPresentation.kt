package com.eleckoi.android.feature.chat.ui.screen

import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ImmutableAppendedList
import com.eleckoi.android.feature.chat.model.hasLiveGenerationState
import com.eleckoi.android.feature.chat.model.settleAbortedGeneration

internal fun settleInactiveGenerationForPresentation(
    message: ChatMessage,
    generationOwnsMessage: Boolean,
    observedAtMillis: Long,
): ChatMessage {
    if (generationOwnsMessage || !message.hasLiveGenerationState()) return message
    return message.settleAbortedGeneration(
        reason = "生成已停止",
        completedAtMillis = observedAtMillis,
    )
}

/** Settles stale durable checkpoints for non-LazyColumn surfaces such as roleplay Web. */
internal fun settleInactiveGenerationsForPresentation(
    messages: List<ChatMessage>,
    conversationId: String,
    generationRunning: Boolean,
    generationSessionId: String?,
    generationMessageId: String?,
    observedAtMillis: Long,
): List<ChatMessage> {
    val generationOwnsConversation = generationRunning && generationSessionId == conversationId
    var changed: MutableList<ChatMessage>? = null
    messages.forEachIndexed { index, message ->
        val presented = settleInactiveGenerationForPresentation(
            message = message,
            generationOwnsMessage = generationOwnsConversation && generationMessageId == message.id,
            observedAtMillis = observedAtMillis,
        )
        if (presented !== message) {
            val mutable = changed ?: messages.toMutableList().also { changed = it }
            mutable[index] = presented
        }
    }
    return changed ?: messages
}

/** Reuses stale-generation settlement for a stable history prefix during a live roleplay turn. */
internal class InactiveGenerationPresentationCache(
    private val maxStableLists: Int = 4,
) {
    private data class Ownership(
        val conversationId: String,
        val generationRunning: Boolean,
        val generationSessionId: String?,
        val generationMessageId: String?,
    )

    private data class Entry(
        val source: List<ChatMessage>,
        val ownership: Ownership,
        val projected: List<ChatMessage>,
    )

    private val stableLists = ArrayDeque<Entry>()

    init {
        require(maxStableLists > 0) { "生成展示缓存容量必须大于 0" }
    }

    fun project(
        messages: List<ChatMessage>,
        conversationId: String,
        generationRunning: Boolean,
        generationSessionId: String?,
        generationMessageId: String?,
        observedAtMillis: Long,
    ): List<ChatMessage> {
        val ownership = Ownership(
            conversationId,
            generationRunning,
            generationSessionId,
            generationMessageId,
        )
        @Suppress("UNCHECKED_CAST")
        val appended = messages as? ImmutableAppendedList<ChatMessage>
        if (appended == null) return projectStable(messages, ownership, observedAtMillis)
        val prefix = projectStable(appended.prefix, ownership, observedAtMillis)
        val generationOwnsConversation = generationRunning && generationSessionId == conversationId
        val tail = settleInactiveGenerationForPresentation(
            message = appended.tail,
            generationOwnsMessage = generationOwnsConversation && generationMessageId == appended.tail.id,
            observedAtMillis = observedAtMillis,
        )
        return ImmutableAppendedList(prefix, tail)
    }

    private fun projectStable(
        messages: List<ChatMessage>,
        ownership: Ownership,
        observedAtMillis: Long,
    ): List<ChatMessage> {
        val iterator = stableLists.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (entry.source === messages && entry.ownership == ownership) {
                iterator.remove()
                stableLists.addLast(entry)
                return entry.projected
            }
        }
        val projected = settleInactiveGenerationsForPresentation(
            messages = messages,
            conversationId = ownership.conversationId,
            generationRunning = ownership.generationRunning,
            generationSessionId = ownership.generationSessionId,
            generationMessageId = ownership.generationMessageId,
            observedAtMillis = observedAtMillis,
        )
        stableLists.addLast(Entry(messages, ownership, projected))
        while (stableLists.size > maxStableLists) stableLists.removeFirst()
        return projected
    }
}
