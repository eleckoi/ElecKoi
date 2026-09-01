package com.eleckoi.android.engine.agent.eleckoi.conversation

import com.eleckoi.android.foundation.storage.room.agent.entity.AgentContentPartEntity
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RoomConversationLedgerTest {
    @Test
    fun `user and assistant become one branch turn with one selected response`() {
        val entries = ledgerEntries(
            conversationId = "chat-1",
            messages = listOf(
                LedgerMessage(id = "user-1", role = "user", content = "你好"),
                LedgerMessage(
                    id = "assistant-1",
                    role = "assistant",
                    content = "你好呀",
                    reasoningContent = "简短回应",
                    toolCallsJson = "[{\"name\":\"clock\"}]",
                    runtimeTurnId = "runtime-turn-1",
                ),
            ),
        )

        assertEquals(1, entries.size)
        assertEquals("user", entries.single().turn.kind)
        assertNotNull(entries.single().response)
        assertEquals(
            listOf("user_text", "assistant_text", "reasoning", "tool_calls"),
            entries.single().parts.map { it.kind },
        )
    }

    @Test
    fun `regenerated reply keeps one turn and overwrites the same response identity`() {
        fun entry(runtimeTurnId: String, answer: String) = ledgerEntries(
            conversationId = "chat-1",
            messages = listOf(
                LedgerMessage(id = "user-1", role = "user", content = "你好"),
                LedgerMessage(
                    id = "assistant-1",
                    role = "assistant",
                    content = answer,
                    runtimeTurnId = runtimeTurnId,
                ),
            ),
        ).single()

        val first = entry("runtime-turn-1", "版本一")
        val second = entry("runtime-turn-2", "版本二")

        assertEquals(first.turn.id, second.turn.id)
        assertEquals(first.response?.id, second.response?.id)
    }

    @Test
    fun `editing user text preserves stable turn identity`() {
        fun turn(text: String) = ledgerEntries(
            conversationId = "chat-1",
            messages = listOf(LedgerMessage(id = "user-1", role = "user", content = text)),
        ).single().turn

        assertEquals(turn("原问题").id, turn("修改后的问题").id)
    }

    @Test
    fun `room history preserves roles and excludes the current prompt`() {
        val history = roomConversationHistory(
            messages = listOf(
                LedgerMessage(id = "opening", role = "assistant", content = "欢迎"),
                LedgerMessage(id = "user-1", role = "user", content = "上一问"),
                LedgerMessage(id = "assistant-1", role = "assistant", content = "上一答"),
                LedgerMessage(id = "user-2", role = "user", content = "本轮问题"),
            ),
            currentUserMessageId = "user-2",
        )

        assertEquals(
            listOf("assistant", "user", "assistant"),
            history.map { item ->
                Json.parseToJsonElement(item.responseItemJson)
                    .jsonObject.getValue("role").jsonPrimitive.content
            },
        )
        assertEquals(
            listOf("欢迎", "上一问", "上一答"),
            history.map { item ->
                Json.parseToJsonElement(item.responseItemJson)
                    .jsonObject.getValue("content").jsonArray.single().jsonObject
                    .getValue("text").jsonPrimitive.content
            },
        )
    }

    @Test
    fun `display cache chunks and restores a multi megabyte tool result`() {
        val toolCalls = """[{"name":"large-result","result":"${"工".repeat(800_000)}"}]"""
        val messages = listOf(
            LedgerMessage(
                id = "assistant-1",
                role = "assistant",
                content = "工具执行完成",
                toolCallsJson = toolCalls,
            ),
        )

        val chunks = encodeDisplayCacheChunks(messages)

        assertTrue(chunks.size > 1)
        assertTrue(
            chunks.all { chunk ->
                chunk.toByteArray(Charsets.UTF_8).size <= CursorWindowChunkCharacters * 4
            },
        )
        assertEquals(messages, decodeDisplayCacheChunks(chunks))
    }

    @Test
    fun `content part chunks preserve emoji boundaries and exact payload`() {
        val text = "a".repeat(CursorWindowChunkCharacters - 1) + "😀" + "尾".repeat(100)
        val payload = "p".repeat(CursorWindowChunkCharacters * 2 + 7)
        val part = AgentContentPartEntity(
            conversationId = "chat-1",
            ownerType = "response",
            ownerId = "response-1",
            partIndex = 3,
            kind = "tool_calls",
            text = text,
            payloadJson = payload,
        )

        val chunks = listOf(part).toStorageChunks()

        assertTrue(chunks.size > 1)
        assertEquals(part, chunks.mergeStorageChunks().single())
    }

    @Test
    fun `recovery checkpoint clears cold cache without publishing a paging revision`() {
        val plan = ledgerMutationPublicationPlan(rebuildDisplayCache = false)

        assertEquals(false, plan.advanceConversationRevision)
        assertEquals(false, plan.rebuildDisplayCache)
        assertEquals(true, plan.clearDisplayCache)
    }

    @Test
    fun `terminal mutation advances revision and rebuilds the cold cache`() {
        val plan = ledgerMutationPublicationPlan(rebuildDisplayCache = true)

        assertEquals(true, plan.advanceConversationRevision)
        assertEquals(true, plan.rebuildDisplayCache)
        assertEquals(false, plan.clearDisplayCache)
    }
}
