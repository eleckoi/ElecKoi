package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import com.eleckoi.android.engine.agent.api.AgentTokenUsage
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.engine.agent.api.AgentWorkStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatTurnMetricsCollectorTest {
    @Test
    fun `keeps native timing and explicit cache accounting separate`() {
        val collector = ChatTurnMetricsCollector()
        collector.accept(AgentSessionEvent.StepStarted("thread", "turn", step = 1, startedAtMillis = 100))
        collector.accept(
            AgentSessionEvent.AssistantDelta(
                threadId = "thread",
                turnId = "turn",
                itemId = "assistant-turn-1",
                delta = "首个 token",
                step = 1,
                observedAtMillis = 150,
            ),
        )
        collector.accept(
            AgentSessionEvent.WorkItemCompleted(
                threadId = "thread",
                turnId = "turn",
                itemId = "assistant-turn-1",
                type = AgentWorkItemType.AssistantMessage,
                status = AgentWorkStatus.Completed,
                completedAtMillis = 350,
                step = 1,
            ),
        )
        collector.accept(
            AgentSessionEvent.TokenUsageUpdated(
                threadId = "thread",
                turnId = "turn",
                step = 1,
                total = usage(input = 10, cacheRead = 90, output = 20, cacheReported = true),
                last = usage(input = 10, cacheRead = 90, output = 20, cacheReported = true),
                modelContextWindow = 128_000L,
            ),
        )
        collector.accept(
            AgentSessionEvent.WorkItemStarted(
                threadId = "thread",
                turnId = "turn",
                itemId = "tool-1",
                type = AgentWorkItemType.Tool,
                label = "查询",
                startedAtMillis = 360,
            ),
        )
        collector.accept(
            AgentSessionEvent.WorkItemCompleted(
                threadId = "thread",
                turnId = "turn",
                itemId = "tool-1",
                type = AgentWorkItemType.Tool,
                status = AgentWorkStatus.Completed,
                completedAtMillis = 460,
            ),
        )
        collector.accept(AgentSessionEvent.StepCompleted("thread", "turn", step = 1, completedAtMillis = 470))

        val metrics = collector.snapshot()
        assertEquals(1, metrics.turns)
        assertEquals(1, metrics.steps)
        assertEquals(250L, metrics.llmDurationMillis)
        assertEquals(100L, metrics.toolDurationMillis)
        assertEquals(50L, metrics.firstTokenDelayMillis)
        assertEquals(200L, metrics.decodeDurationMillis)
        assertEquals(20L, metrics.decodeOutputTokens)
        assertEquals(90, metrics.cacheHitPercent)
        assertEquals(100L, collector.contextWindowUsage()?.latestTokens)
        assertEquals(120L, collector.contextWindowUsage()?.totalTokens)
        assertEquals(128_000L, collector.contextWindowUsage()?.modelContextWindow)
    }

    @Test
    fun `native DSH projection replaces stale request pressure after compaction`() {
        val collector = ChatTurnMetricsCollector()
        collector.accept(
            AgentSessionEvent.TokenUsageUpdated(
                threadId = "thread",
                turnId = "turn",
                step = 1,
                total = usage(input = 5_000, cacheRead = 22_000, output = 400, cacheReported = true),
                last = usage(input = 5_000, cacheRead = 22_000, output = 400, cacheReported = true),
                modelContextWindow = 1_000_000L,
            ),
        )

        collector.accept(
            AgentSessionEvent.ContextWindowUpdated(
                threadId = "thread",
                turnId = "turn",
                pressureTokens = 27_000L,
                projectedTokens = 5_100L,
                modelContextWindow = 1_000_000L,
            ),
        )

        assertEquals(5_100L, collector.contextWindowUsage()?.latestTokens)
        assertEquals(27_400L, collector.contextWindowUsage()?.totalTokens)
        assertEquals(1_000_000L, collector.contextWindowUsage()?.modelContextWindow)
    }

    @Test
    fun `does not invent a cache percentage when the provider omitted cache usage`() {
        val collector = ChatTurnMetricsCollector()
        collector.accept(AgentSessionEvent.StepStarted("thread", "turn", step = 1, startedAtMillis = 100))
        collector.accept(
            AgentSessionEvent.TokenUsageUpdated(
                threadId = "thread",
                turnId = "turn",
                step = 1,
                total = usage(input = 10, cacheRead = 0, output = 2, cacheReported = false),
                last = usage(input = 10, cacheRead = 0, output = 2, cacheReported = false),
                modelContextWindow = null,
            ),
        )
        collector.accept(AgentSessionEvent.StepCompleted("thread", "turn", step = 1, completedAtMillis = 200))

        assertEquals(null, collector.snapshot().cacheHitPercent)
        assertTrue(collector.snapshot().billedInputTokens > 0L)
    }

    private fun usage(
        input: Long,
        cacheRead: Long,
        output: Long,
        cacheReported: Boolean,
    ) = AgentTokenUsage(
        totalTokens = input + cacheRead + output,
        inputTokens = input,
        cacheReadTokens = cacheRead,
        cacheWriteTokens = 0,
        cacheUsageReported = cacheReported,
        outputTokens = output,
        reasoningOutputTokens = 0,
    )
}
