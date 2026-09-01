package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CharacterAgentTimelineProjectionTest {
    @Test
    fun `streaming phase marker scan grows with deltas rather than accumulated response`() {
        val projector = AssistantPhaseMarkerProjector()
        var text = ""
        repeat(1_000) { index ->
            val delta = when (index) {
                200 -> "<COMM"
                201 -> "ENTARY>\n"
                800 -> "<FI"
                801 -> "NAL>\n"
                else -> "abcdefgh"
            }
            projector.recordAppend("assistant-item", delta)
            text += delta
            projector.split(
                CreationTimelineItem(
                    id = "assistant-item",
                    kind = CreationTimelineKind.Assistant,
                    text = text,
                    running = true,
                    workItemType = AgentWorkItemType.AssistantMessage,
                ),
            )
        }

        assertEquals(true, projector.scannedCharacters < text.length * 5L)
        val segments = projector.split(
            CreationTimelineItem(
                id = "assistant-item",
                kind = CreationTimelineKind.Assistant,
                text = text,
                running = true,
                workItemType = AgentWorkItemType.AssistantMessage,
            ),
        )
        assertEquals(
            listOf(AgentMessagePhase.Commentary, AgentMessagePhase.FinalAnswer),
            segments.filter { it.phaseHeader != null }.map { it.phaseHeader },
        )
    }

    @Test
    fun `role shell preserves request boundary as a process record`() {
        val message = ChatMessage(
            id = "assistant",
            role = MessageRole.Assistant,
            content = "",
            pending = true,
        ).withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "request-turn-3",
                    kind = CreationTimelineKind.Tool,
                    text = "请求 3",
                    running = true,
                    workItemType = AgentWorkItemType.Request,
                    turnId = "turn",
                    createdAtMillis = 30L,
                ),
            ),
            turnRunning = true,
        )

        val request = message.toolCalls.single()
        assertEquals("请求 3", request.name)
        assertEquals(AgentWorkItemType.Request, request.workItemType)
        assertEquals(30L, request.startedAtMillis)
    }

    @Test
    fun `one way action preserves arguments without fabricating a result`() {
        val message = ChatMessage(
            id = "assistant",
            role = MessageRole.Assistant,
            content = "",
            pending = true,
        ).withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "action",
                    kind = CreationTimelineKind.Tool,
                    text = "生成配图",
                    detail = "",
                    toolArguments = """{"prompt":"1girl, rain"}""",
                    workItemType = AgentWorkItemType.Action,
                    toolName = "generate_image",
                    running = true,
                    turnId = "turn",
                ),
            ),
            turnRunning = true,
        )

        val action = message.toolCalls.single()
        assertEquals(AgentWorkItemType.Action, action.workItemType)
        assertEquals("""{"prompt":"1girl, rain"}""", action.arguments)
        assertEquals("", action.result)
    }

    @Test
    fun `role shell preserves creator timeline order while final reply stays outside process`() {
        val message = ChatMessage(
            id = "assistant",
            role = MessageRole.Assistant,
            content = "",
            pending = true,
        ).withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "user",
                    kind = CreationTimelineKind.User,
                    text = "查一下",
                    turnId = "turn",
                    createdAtMillis = 10L,
                ),
                CreationTimelineItem(
                    id = "commentary",
                    kind = CreationTimelineKind.Assistant,
                    text = "我先搜索",
                    workItemType = AgentWorkItemType.AssistantMessage,
                    turnId = "turn",
                    messagePhase = AgentMessagePhase.Commentary,
                    phaseHeader = AgentMessagePhase.Commentary,
                    createdAtMillis = 11L,
                    completedAtMillis = 12L,
                ),
                CreationTimelineItem(
                    id = "tool",
                    kind = CreationTimelineKind.Tool,
                    text = "搜索网页",
                    detail = "搜索完成",
                    toolArguments = """{"query":"天气"}""",
                    workItemType = AgentWorkItemType.Tool,
                    turnId = "turn",
                    createdAtMillis = 12L,
                    completedAtMillis = 13L,
                ),
                CreationTimelineItem(
                    id = "final",
                    kind = CreationTimelineKind.Assistant,
                    text = "最终答案",
                    running = true,
                    workItemType = AgentWorkItemType.AssistantMessage,
                    turnId = "turn",
                    messagePhase = AgentMessagePhase.FinalAnswer,
                    phaseHeader = AgentMessagePhase.FinalAnswer,
                    createdAtMillis = 13L,
                ),
            ),
            turnRunning = true,
        )

        assertEquals("最终答案", message.content)
        val visibleProcessCalls = message.toolCalls.withoutFinalProtocolBoundary()
        assertEquals(
            listOf(
                "我先搜索",
                "搜索完成",
            ),
            visibleProcessCalls.map { it.result },
        )
        assertEquals(
            listOf(AgentMessagePhase.Commentary, null),
            visibleProcessCalls.map { it.phaseHeader },
        )
        assertEquals(
            listOf("", """{"query":"天气"}"""),
            visibleProcessCalls.map { it.arguments },
        )
        assertEquals(listOf(true, false), visibleProcessCalls.map { it.narrative })
        assertEquals(1, message.toolCalls.count { it.isFinalProtocolBoundary() })
        assertEquals(10L, message.turnStartedAtMillis)
        assertNull(message.turnCompletedAtMillis)
    }

    @Test
    fun `interrupted turn keeps assistant text already shown during streaming`() {
        val runningTimeline = listOf(
            CreationTimelineItem(
                id = "user",
                kind = CreationTimelineKind.User,
                text = "持续输出",
                turnId = "turn",
                createdAtMillis = 10L,
            ),
            CreationTimelineItem(
                id = "answer",
                kind = CreationTimelineKind.Assistant,
                text = "已经生成的部分正文",
                running = true,
                workItemType = AgentWorkItemType.AssistantMessage,
                turnId = "turn",
                messagePhase = AgentMessagePhase.FinalAnswer,
                phaseHeader = AgentMessagePhase.FinalAnswer,
                createdAtMillis = 11L,
            ),
        )
        val visible = ChatMessage(
            id = "assistant",
            role = MessageRole.Assistant,
            content = "",
            pending = true,
        ).withCreationAgentTimeline(
            timeline = runningTimeline,
            turnRunning = true,
        )

        val interrupted = visible.withCreationAgentTimeline(
            timeline = runningTimeline.map { item ->
                item.copy(
                    running = false,
                    failed = item.kind == CreationTimelineKind.User,
                    completedAtMillis = 20L,
                )
            },
            turnRunning = false,
        )

        assertEquals("已经生成的部分正文", interrupted.content)
        assertEquals(
            emptyList<String>(),
            interrupted.toolCalls.withoutFinalProtocolBoundary().map { it.result },
        )
        assertEquals(1, interrupted.toolCalls.count { it.isFinalProtocolBoundary() })
        assertEquals(20L, interrupted.turnCompletedAtMillis)
    }

    @Test
    fun `assistant content remains process text until a final boundary is observed`() {
        val provisional = ChatMessage(
            id = "assistant",
            role = MessageRole.Assistant,
            content = "",
            pending = true,
        ).withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "user",
                    kind = CreationTimelineKind.User,
                    text = "查看规则",
                    turnId = "turn",
                    createdAtMillis = 10L,
                ),
                CreationTimelineItem(
                    id = "round-message",
                    kind = CreationTimelineKind.Assistant,
                    text = "让我找找看我的运行规则文件在哪里",
                    running = true,
                    workItemType = AgentWorkItemType.AssistantMessage,
                    turnId = "turn",
                    messagePhase = AgentMessagePhase.FinalAnswer,
                    createdAtMillis = 11L,
                ),
            ),
            turnRunning = true,
        )
        assertEquals("", provisional.content)
        assertEquals(
            listOf("让我找找看我的运行规则文件在哪里"),
            provisional.toolCalls.map { it.result },
        )

        val closedWithoutHeader = provisional.withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "user",
                    kind = CreationTimelineKind.User,
                    text = "查看规则",
                    turnId = "turn",
                    createdAtMillis = 10L,
                ),
                CreationTimelineItem(
                    id = "round-message",
                    kind = CreationTimelineKind.Assistant,
                    text = "让我找找看我的运行规则文件在哪里",
                    running = false,
                    workItemType = AgentWorkItemType.AssistantMessage,
                    turnId = "turn",
                    messagePhase = AgentMessagePhase.FinalAnswer,
                    createdAtMillis = 11L,
                    completedAtMillis = 12L,
                ),
            ),
            // The enclosing turn still has commit/cleanup work left to do.
            turnRunning = true,
        )

        assertEquals("", closedWithoutHeader.content)
        assertEquals(
            listOf("让我找找看我的运行规则文件在哪里"),
            closedWithoutHeader.toolCalls.map { it.result },
        )
        assertNull(closedWithoutHeader.turnCompletedAtMillis)

        val settledWithoutHeader = closedWithoutHeader.withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "user",
                    kind = CreationTimelineKind.User,
                    text = "查看规则",
                    turnId = "turn",
                    createdAtMillis = 10L,
                ),
                CreationTimelineItem(
                    id = "round-message",
                    kind = CreationTimelineKind.Assistant,
                    text = "让我找找看我的运行规则文件在哪里",
                    running = false,
                    workItemType = AgentWorkItemType.AssistantMessage,
                    turnId = "turn",
                    messagePhase = AgentMessagePhase.FinalAnswer,
                    createdAtMillis = 11L,
                    completedAtMillis = 12L,
                ),
            ),
            turnRunning = false,
        )

        assertEquals(
            "让我找找看我的运行规则文件在哪里",
            settledWithoutHeader.content,
        )
        assertEquals(emptyList<String>(), settledWithoutHeader.toolCalls.map { it.result })

        val reclassified = provisional.withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "user",
                    kind = CreationTimelineKind.User,
                    text = "查看规则",
                    turnId = "turn",
                    createdAtMillis = 10L,
                ),
                CreationTimelineItem(
                    id = "round-message",
                    kind = CreationTimelineKind.Assistant,
                    text = "让我找找看我的运行规则文件在哪里",
                    workItemType = AgentWorkItemType.AssistantMessage,
                    turnId = "turn",
                    messagePhase = AgentMessagePhase.Commentary,
                    createdAtMillis = 11L,
                    completedAtMillis = 12L,
                ),
                CreationTimelineItem(
                    id = "tool",
                    kind = CreationTimelineKind.Tool,
                    text = "正在运行命令",
                    running = true,
                    workItemType = AgentWorkItemType.Command,
                    turnId = "turn",
                    createdAtMillis = 12L,
                ),
            ),
            turnRunning = true,
        )

        assertEquals("", reclassified.content)
        assertEquals(
            listOf("让我找找看我的运行规则文件在哪里", ""),
            reclassified.toolCalls.map { it.result },
        )
    }

    @Test
    fun `mid response final marker splits commentary from the real final answer`() {
        val message = ChatMessage(
            id = "assistant",
            role = MessageRole.Assistant,
            content = "",
            pending = true,
        ).withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "user",
                    kind = CreationTimelineKind.User,
                    text = "你好",
                    turnId = "turn",
                ),
                CreationTimelineItem(
                    id = "mixed-response",
                    kind = CreationTimelineKind.Assistant,
                    text = "设定已经读取。\n<FINAL>\n就在你开口\n</FINAL>",
                    running = true,
                    workItemType = AgentWorkItemType.AssistantMessage,
                    turnId = "turn",
                    messagePhase = AgentMessagePhase.Commentary,
                    phaseHeader = AgentMessagePhase.Commentary,
                ),
            ),
            turnRunning = true,
        )

        assertEquals("就在你开口", message.content)
        val visibleProcessCalls = message.toolCalls.withoutFinalProtocolBoundary()
        assertEquals(listOf("设定已经读取。"), visibleProcessCalls.map { it.result })
        assertEquals(listOf(AgentMessagePhase.Commentary), visibleProcessCalls.map { it.phaseHeader })
        assertEquals(1, message.toolCalls.count { it.isFinalProtocolBoundary() })
    }

    @Test
    fun `final marker without body never promotes the preceding stage text`() {
        val message = ChatMessage(
            id = "assistant",
            role = MessageRole.Assistant,
            content = "",
            pending = true,
        ).withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "user",
                    kind = CreationTimelineKind.User,
                    text = "你好",
                    turnId = "turn",
                ),
                CreationTimelineItem(
                    id = "mixed-response",
                    kind = CreationTimelineKind.Assistant,
                    text = "设定已经读取。\n<FINAL>\n",
                    running = true,
                    workItemType = AgentWorkItemType.AssistantMessage,
                    turnId = "turn",
                    // Reproduces the transport's inferred phase in the marker-arrival frame.
                    messagePhase = AgentMessagePhase.FinalAnswer,
                ),
            ),
            turnRunning = true,
        )

        assertEquals("", message.content)
        val visibleProcessCalls = message.toolCalls.withoutFinalProtocolBoundary()
        assertEquals(listOf("设定已经读取。"), visibleProcessCalls.map { it.result })
        assertEquals(listOf<AgentMessagePhase?>(null), visibleProcessCalls.map { it.phaseHeader })
        assertEquals(1, message.toolCalls.count { it.isFinalProtocolBoundary() })
    }

    @Test
    fun `assistant content without a final boundary remains visible process content`() {
        val message = ChatMessage(
            id = "assistant",
            role = MessageRole.Assistant,
            content = "",
            pending = true,
        ).withCreationAgentTimeline(
            timeline = listOf(
                CreationTimelineItem(
                    id = "user",
                    kind = CreationTimelineKind.User,
                    text = "随便来一个",
                    turnId = "turn",
                ),
                CreationTimelineItem(
                    id = "reasoning",
                    kind = CreationTimelineKind.Tool,
                    text = "",
                    detail = "让我构思正文和图片",
                    workItemType = AgentWorkItemType.Reasoning,
                    turnId = "turn",
                ),
                CreationTimelineItem(
                    id = "control-payload",
                    kind = CreationTimelineKind.Assistant,
                    text = "<ACTION_CALL name=\"generate_image\">\n{}\n</ACTION_CALL>",
                    workItemType = AgentWorkItemType.AssistantMessage,
                    messagePhase = AgentMessagePhase.FinalAnswer,
                    turnId = "turn",
                ),
            ),
            turnRunning = true,
        )

        assertEquals("", message.content)
        assertEquals(2, message.toolCalls.size)
        assertEquals(
            listOf(AgentWorkItemType.Reasoning, AgentWorkItemType.AssistantMessage),
            message.toolCalls.map { it.workItemType },
        )
        assertEquals(
            listOf(
                "让我构思正文和图片",
                "<ACTION_CALL name=\"generate_image\">\n{}\n</ACTION_CALL>",
            ),
            message.toolCalls.map { it.result },
        )
    }
}

private fun List<com.eleckoi.android.feature.chat.model.ChatToolCallRecord>.withoutFinalProtocolBoundary() =
    filterNot { it.isFinalProtocolBoundary() }

private fun com.eleckoi.android.feature.chat.model.ChatToolCallRecord.isFinalProtocolBoundary(): Boolean =
    narrative &&
        phaseHeader == AgentMessagePhase.FinalAnswer &&
        result == "<FINAL>"
