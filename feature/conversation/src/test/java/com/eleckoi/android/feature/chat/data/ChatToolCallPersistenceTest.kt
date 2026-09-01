package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.model.ChatToolCallRecord
import com.eleckoi.android.feature.chat.model.ChatImageAttachment
import com.eleckoi.android.feature.chat.model.ChatImageStatus
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.model.settleAbortedGeneration
import com.eleckoi.android.feature.chat.model.content.ToolCallState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ChatToolCallPersistenceTest {
    @Test
    fun `tool call records round trip through stable json`() {
        val calls = listOf(
            ChatToolCallRecord(
                callId = "call-1",
                name = "eleckoi_apply_variable_patch",
                arguments = "{\"operations\":[]}",
                result = "ok",
                state = ToolCallState.Succeeded,
                delegatedModel = "deepseek-v4-flash",
                rollbackOnAbort = true,
            ),
            ChatToolCallRecord(
                callId = "action-1",
                name = "生成配图",
                arguments = """{"prompt":"1girl, rain"}""",
                result = "",
                state = ToolCallState.Succeeded,
                workItemType = AgentWorkItemType.Action,
                toolName = "generate_image",
            ),
        )

        val restored = toolCallsFromJsonString(toolCallsJsonString(calls))

        assertEquals(calls, restored)
    }

    @Test
    fun `corrupt legacy tool json fails closed to an empty trace`() {
        assertEquals(emptyList<ChatToolCallRecord>(), toolCallsFromJsonString("not-json"))
    }

    @Test
    fun `interrupted checkpoint clears every liveness-bearing field`() {
        val message = ChatMessage(
            id = "assistant-1",
            role = MessageRole.Assistant,
            content = "",
            pending = true,
            toolCalls = listOf(
                ChatToolCallRecord(
                    callId = "reasoning-1",
                    name = "处理思路",
                    state = ToolCallState.Running,
                    narrative = true,
                ),
            ),
            imageAttachments = listOf(ChatImageAttachment(id = "image-1")),
        )

        val settled = message.settleAbortedGeneration(
            reason = "生成已停止",
            completedAtMillis = 1234L,
        )

        assertFalse(settled.pending)
        assertEquals(ToolCallState.Failed, settled.toolCalls.single().state)
        assertEquals("生成已停止", settled.toolCalls.single().result)
        assertEquals(ChatImageStatus.Failed, settled.imageAttachments.single().status)
        assertEquals("生成已停止", settled.imageAttachments.single().errorMessage)
        assertEquals(1234L, settled.turnCompletedAtMillis)
    }

    @Test
    fun `stopping after final text still settles one-way image work`() {
        val message = ChatMessage(
            id = "assistant-with-image",
            role = MessageRole.Assistant,
            content = "正文已经完成",
            pending = false,
            toolCalls = listOf(
                ChatToolCallRecord(
                    callId = "image-action",
                    name = "生成配图",
                    state = ToolCallState.Running,
                    workItemType = AgentWorkItemType.Action,
                    toolName = "generate_image",
                ),
            ),
            imageAttachments = listOf(
                ChatImageAttachment(
                    id = "image-1",
                    status = ChatImageStatus.Generating,
                ),
            ),
        )

        val settled = message.settleAbortedGeneration(
            reason = "生成已停止",
            completedAtMillis = 5678L,
        )

        assertFalse(settled.pending)
        assertEquals(ToolCallState.Failed, settled.toolCalls.single().state)
        assertEquals(ChatImageStatus.Failed, settled.imageAttachments.single().status)
        assertEquals("生成已停止", settled.imageAttachments.single().errorMessage)
        assertEquals(5678L, settled.turnCompletedAtMillis)
    }
}
