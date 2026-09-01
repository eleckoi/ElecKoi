package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentSessionEvent

/** Losslessly merges adjacent assistant fragments before the expensive timeline projection. */
internal class CharacterAssistantDeltaAccumulator(
    private val maxEvents: Int = DefaultMaxEvents,
    private val maxCharacters: Int = DefaultMaxCharacters,
) {
    private var pending: Pending? = null

    init {
        require(maxEvents > 0) { "流式文字批次事件数必须大于 0" }
        require(maxCharacters > 0) { "流式文字批次字符数必须大于 0" }
    }

    fun offer(event: AgentSessionEvent.AssistantDelta): List<AgentSessionEvent.AssistantDelta> =
        buildList {
            val current = pending
            if (current == null) {
                pending = Pending(event, StringBuilder(event.delta), 1)
            } else if (!current.template.canMergeWith(event)) {
                takePending()?.let(::add)
                pending = Pending(event, StringBuilder(event.delta), 1)
            } else {
                current.delta.append(event.delta)
                current.eventCount += 1
            }
            val buffered = pending
            if (
                buffered != null &&
                (buffered.eventCount >= maxEvents || buffered.delta.length >= maxCharacters)
            ) {
                takePending()?.let(::add)
            }
        }

    fun flush(): AgentSessionEvent.AssistantDelta? = takePending()

    fun hasPending(): Boolean = pending != null

    private fun takePending(): AgentSessionEvent.AssistantDelta? {
        val current = pending ?: return null
        pending = null
        return current.template.copy(delta = current.delta.toString())
    }

    private fun AgentSessionEvent.AssistantDelta.canMergeWith(
        next: AgentSessionEvent.AssistantDelta,
    ): Boolean = actionCalls.isEmpty() &&
        next.actionCalls.isEmpty() &&
        threadId == next.threadId &&
        turnId == next.turnId &&
        itemId == next.itemId &&
        step == next.step &&
        phase == next.phase &&
        phaseHeader == next.phaseHeader

    private data class Pending(
        val template: AgentSessionEvent.AssistantDelta,
        val delta: StringBuilder,
        var eventCount: Int,
    )

    private companion object {
        const val DefaultMaxEvents = 256
        const val DefaultMaxCharacters = 8 * 1024
    }
}
