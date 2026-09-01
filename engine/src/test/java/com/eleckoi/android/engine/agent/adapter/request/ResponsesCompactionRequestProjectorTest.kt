package com.eleckoi.android.engine.agent.adapter.request

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ResponsesCompactionRequestProjectorTest {
    @Test
    fun `replaces only the final DSH compaction instruction`() {
        val selectedHistory = message("assistant", "需要压缩的剧情")
        val request = buildJsonObject {
            put("model", "route")
            put("instructions", "角色扮演协议要求输出 <FINAL>")
            put("max_output_tokens", 8192)
            put("reasoning", buildJsonObject { put("effort", "high") })
            put("text", buildJsonObject { put("format", "json") })
            put("tools", buildJsonArray {
                add(buildJsonObject {
                    put("type", "function")
                    put("name", "search")
                })
            })
            put("tool_choice", "auto")
            put("input", buildJsonArray {
                add(message("user", "较早消息"))
                add(selectedHistory)
                add(message("user", "DSH coding-oriented default"))
            })
        }

        val projected = ResponsesCompactionRequestProjector.project(
            request = request,
            instructions = "  角色扮演专用摘要模板  ",
        )
        val input = projected["input"] as JsonArray

        assertEquals("较早消息", input[0].jsonObject.text())
        assertEquals(selectedHistory, input[1])
        assertTrue(input[2].jsonObject.text().endsWith("角色扮演专用摘要模板"))
        assertTrue(projected["instructions"].toString().contains("只返回非空的纯文本摘要正文"))
        assertEquals("8192", (projected["max_output_tokens"] as JsonPrimitive).content)
        assertFalse("tools" in projected)
        assertFalse("tool_choice" in projected)
        assertFalse("reasoning" in projected)
        assertFalse("text" in projected)
    }

    @Test
    fun `recognizes the bundled Pi AI native compaction directive only at the request tail`() {
        val nativeInstruction =
            "You are now acting as a compaction engine for this AI coding assistant. Condense the conversation ABOVE."
        val compacting = requestOf(
            message("user", "较早消息"),
            message("user", nativeInstruction),
        )
        val ordinary = requestOf(
            message("user", "You are now acting as an ordinary roleplay assistant."),
        )

        assertTrue(ResponsesCompactionRequestProjector.isNativeCompactionRequest(compacting))
        assertFalse(ResponsesCompactionRequestProjector.isNativeCompactionRequest(ordinary))
    }

    private fun requestOf(vararg messages: JsonObject): JsonObject = buildJsonObject {
        put("input", JsonArray(messages.toList()))
    }

    private fun message(role: String, text: String): JsonObject = buildJsonObject {
        put("type", "message")
        put("role", role)
        put("content", buildJsonArray {
            add(buildJsonObject {
                put("type", if (role == "assistant") "output_text" else "input_text")
                put("text", text)
            })
        })
    }

    private fun JsonObject.text(): String = ((get("content") as JsonArray).first().jsonObject["text"] as JsonPrimitive)
        .contentOrNull
        .orEmpty()
}
