package com.eleckoi.android.engine.agent.adapter

import com.eleckoi.android.engine.generation.model.ModelConfig
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AdapterProviderRouteTest {
    @Test
    fun `compaction directive is scoped to compaction requests`() {
        val route = AdapterProviderRoute(
            ownerToken = "owner",
            modelConfig = ModelConfig(apiKey = "key", model = "model"),
            historyCompactionInstructions = "角色摘要模板",
            captureProviderRequests = false,
        )
        val request = buildJsonObject {
            put("input", buildJsonArray {
                add(message("assistant", "旧剧情"))
                add(message("user", "DSH 默认摘要指令"))
            })
        }

        val ordinary = route.projectLegacyProbeRequest(request, isCompactionRequest = false)
        val compacting = route.projectLegacyProbeRequest(request, isCompactionRequest = true)

        assertEquals("DSH 默认摘要指令", ordinary.lastMessageText())
        assertTrue(compacting.lastMessageText().endsWith("角色摘要模板"))
    }

    @Test
    fun `DSH compaction removes interactive tools before pi-ai serialization`() {
        val route = AdapterProviderRoute(
            ownerToken = "owner",
            modelConfig = ModelConfig(apiKey = "key", model = "model"),
            historyCompactionInstructions = "角色摘要模板",
            captureProviderRequests = false,
        )
        val request = buildJsonObject {
            put("provider", "eleckoi-bridge")
            put("model", "model")
            put("purpose", "compaction")
            put("messages", buildJsonArray {
                add(dshMessage("assistant", "旧剧情"))
                add(dshMessage("user", "DSH 默认摘要指令"))
            })
            put("tools", buildJsonArray {
                add(buildJsonObject {
                    put("name", "dangerous_tool")
                    put("description", "must not survive compaction")
                    put("parameters", buildJsonObject { put("type", "object") })
                })
            })
            put("toolChoice", "auto")
        }

        val projected = route.projectDshRequest(request, requestIndex = 1, isCompactionRequest = true)

        assertTrue("tools" !in projected)
        assertTrue("toolChoice" !in projected)
        assertTrue(projected.dshLastMessageText().endsWith("角色摘要模板"))
        assertTrue((projected["system"] as JsonPrimitive).content.contains("内部历史压缩"))
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

    private fun dshMessage(role: String, text: String): JsonObject = buildJsonObject {
        put("id", "message-$role")
        put("role", role)
        put("content", buildJsonArray {
            add(buildJsonObject {
                put("type", "text")
                put("text", text)
            })
        })
        put("source", buildJsonObject { put("kind", "plugin") })
    }

    private fun JsonObject.lastMessageText(): String =
        (((get("input") as JsonArray).last().jsonObject["content"] as JsonArray)
            .first().jsonObject["text"] as JsonPrimitive).contentOrNull.orEmpty()

    private fun JsonObject.dshLastMessageText(): String =
        (((get("messages") as JsonArray).last().jsonObject["content"] as JsonArray)
            .first().jsonObject["text"] as JsonPrimitive).contentOrNull.orEmpty()
}
