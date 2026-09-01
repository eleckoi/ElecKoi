package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CharacterAssistantDeltaAccumulatorTest {
    @Test
    fun adjacentFragmentsMergeLosslessly() {
        val accumulator = CharacterAssistantDeltaAccumulator()

        assertEquals(emptyList<AgentSessionEvent>(), accumulator.offer(delta("你")))
        assertEquals(emptyList<AgentSessionEvent>(), accumulator.offer(delta("好")))

        assertEquals("你好", accumulator.flush()?.delta)
        assertNull(accumulator.flush())
    }

    @Test
    fun phaseBoundaryFlushesThePreviousTextBeforeBufferingTheNextPhase() {
        val accumulator = CharacterAssistantDeltaAccumulator()
        accumulator.offer(delta("过程", phase = AgentMessagePhase.Commentary))

        val flushed = accumulator.offer(delta("答案", phase = AgentMessagePhase.FinalAnswer))

        assertEquals(listOf("过程"), flushed.map { it.delta })
        assertEquals("答案", accumulator.flush()?.delta)
    }

    @Test
    fun boundedBatchFlushesWithoutDroppingTheLatestFragment() {
        val accumulator = CharacterAssistantDeltaAccumulator(maxEvents = 2)

        accumulator.offer(delta("a"))
        val flushed = accumulator.offer(delta("b"))

        assertEquals(listOf("ab"), flushed.map { it.delta })
        assertNull(accumulator.flush())
    }

    private fun delta(
        text: String,
        phase: AgentMessagePhase? = null,
    ) = AgentSessionEvent.AssistantDelta(
        threadId = "thread",
        turnId = "turn",
        itemId = "item",
        delta = text,
        phase = phase,
    )
}
