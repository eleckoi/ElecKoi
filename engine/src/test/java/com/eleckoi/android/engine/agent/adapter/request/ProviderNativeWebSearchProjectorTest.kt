package com.eleckoi.android.engine.agent.adapter.request

import com.eleckoi.android.engine.agent.adapter.ProviderWireFormat
import com.eleckoi.android.engine.agent.api.AgentNativeWebSearchBridgeTool
import com.eleckoi.android.engine.agent.api.AgentWebSearchTool
import com.eleckoi.android.engine.generation.model.ModelApiFormat
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.foundation.serialization.ElecKoiJson
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

class ProviderNativeWebSearchProjectorTest {
    @Test
    fun `enabled native bridge reaches official DeepSeek as callable web search`() {
        val request = json(
            """
            {
              "tools":[
                {"type":"function","name":"$AgentNativeWebSearchBridgeTool","parameters":{"type":"object"}}
              ],
              "tool_choice":"auto"
            }
            """.trimIndent(),
        )

        val projected = ProviderNativeWebSearchProjector.project(
            request = request,
            format = ProviderWireFormat.Responses,
            modelConfig = officialDeepSeek(),
        )
        val tools = projected["tools"] as JsonArray

        assertEquals(1, tools.size)
        assertEquals("web_search", tools.single().jsonObject.string("type"))
        assertEquals("auto", (projected["tool_choice"] as JsonPrimitive).content)
        assertFalse(tools.any { it.jsonObject.string("name") == AgentNativeWebSearchBridgeTool })
    }

    @Test
    fun `official DeepSeek Responses replaces Android searches with one native server tool`() {
        val request = json(
            """
            {
              "model":"wire",
              "tools":[
                {"type":"function","name":"read_file","parameters":{"type":"object"}},
                {"type":"function","name":"$AgentWebSearchTool","parameters":{"type":"object"}},
                {"type":"function","name":"$AgentNativeWebSearchBridgeTool","parameters":{"type":"object"}},
                {"type":"web_search_2025_08_26"}
              ],
              "tool_choice":{"type":"function","name":"$AgentWebSearchTool"}
            }
            """.trimIndent(),
        )

        val projected = ProviderNativeWebSearchProjector.project(
            request = request,
            format = ProviderWireFormat.Responses,
            modelConfig = officialDeepSeek(),
        )
        val tools = projected["tools"] as JsonArray

        assertEquals(2, tools.size)
        assertEquals("read_file", tools[0].jsonObject.string("name"))
        assertEquals("web_search", tools[1].jsonObject.string("type"))
        assertFalse(tools.any { it.jsonObject.string("name") in setOf(AgentWebSearchTool, AgentNativeWebSearchBridgeTool) })
        assertEquals("web_search", projected["tool_choice"]!!.jsonObject.string("type"))
    }

    @Test
    fun `relay Responses removes bridge marker and keeps Tavily function`() {
        val request = json(
            """
            {
              "tools":[
                {"type":"function","name":"$AgentWebSearchTool","parameters":{"type":"object"}},
                {"type":"function","name":"$AgentNativeWebSearchBridgeTool","parameters":{"type":"object"}}
              ]
            }
            """.trimIndent(),
        )

        val projected = ProviderNativeWebSearchProjector.project(
            request = request,
            format = ProviderWireFormat.Responses,
            modelConfig = ModelConfig(
                provider = "custom",
                baseUrl = "https://relay.example/v1",
                model = "deepseek-v4-flash",
                apiFormat = ModelApiFormat.Responses,
            ),
        )
        val tools = projected["tools"] as JsonArray

        assertEquals(listOf(AgentWebSearchTool), tools.map { it.jsonObject.string("name") })
        assertFalse(tools.any { it.jsonObject.string("type") == "web_search" })
    }

    @Test
    fun `Tavily only mode stays external on official DeepSeek Responses`() {
        val request = json(
            """
            {
              "tools":[
                {"type":"function","name":"$AgentWebSearchTool","parameters":{"type":"object"}}
              ]
            }
            """.trimIndent(),
        )

        val projected = ProviderNativeWebSearchProjector.project(
            request = request,
            format = ProviderWireFormat.Responses,
            modelConfig = officialDeepSeek(),
        )
        val tools = projected["tools"] as JsonArray

        assertEquals(listOf(AgentWebSearchTool), tools.map { it.jsonObject.string("name") })
        assertFalse(tools.any { it.jsonObject.string("type") == "web_search" })
    }

    @Test
    fun `removing the only bridge tool also removes an orphaned automatic choice`() {
        val request = json(
            """
            {
              "tools":[
                {"type":"function","name":"$AgentNativeWebSearchBridgeTool","parameters":{"type":"object"}}
              ],
              "tool_choice":"auto"
            }
            """.trimIndent(),
        )

        val projected = ProviderNativeWebSearchProjector.project(
            request = request,
            format = ProviderWireFormat.Responses,
            modelConfig = ModelConfig(
                provider = "custom",
                baseUrl = "https://relay.example/v1",
                model = "model",
            ),
        )

        assertFalse("tools" in projected)
        assertFalse("tool_choice" in projected)
    }

    @Test
    fun `non Responses serializers never leak the internal bridge marker`() {
        val chat = json(
            """
            {
              "tools":[
                {"type":"function","function":{"name":"weather","parameters":{"type":"object"}}},
                {"type":"function","function":{"name":"$AgentNativeWebSearchBridgeTool","parameters":{"type":"object"}}}
              ],
              "tool_choice":{"type":"function","function":{"name":"$AgentNativeWebSearchBridgeTool"}}
            }
            """.trimIndent(),
        )
        val anthropic = json(
            """
            {
              "tools":[
                {"name":"weather","input_schema":{"type":"object"}},
                {"name":"$AgentNativeWebSearchBridgeTool","input_schema":{"type":"object"}}
              ]
            }
            """.trimIndent(),
        )

        val projectedChat = ProviderNativeWebSearchProjector.project(
            chat,
            ProviderWireFormat.ChatCompletions,
            officialDeepSeek(),
        )
        val projectedAnthropic = ProviderNativeWebSearchProjector.project(
            anthropic,
            ProviderWireFormat.AnthropicMessages,
            officialDeepSeek(),
        )

        assertEquals(
            listOf("weather"),
            (projectedChat["tools"] as JsonArray).map {
                (it.jsonObject["function"] as JsonObject).string("name")
            },
        )
        assertFalse("tool_choice" in projectedChat)
        assertEquals(
            listOf("weather"),
            (projectedAnthropic["tools"] as JsonArray).map { it.jsonObject.string("name") },
        )
    }

    @Test
    fun `large repeated projection stays idempotent and keeps exactly one native search`() {
        val request = buildJsonObject {
            put("tools", buildJsonArray {
                repeat(500) { index ->
                    add(buildJsonObject {
                        put("type", "function")
                        put("name", "tool_$index")
                        put("parameters", buildJsonObject { put("type", "object") })
                    })
                }
                add(buildJsonObject {
                    put("type", "function")
                    put("name", AgentNativeWebSearchBridgeTool)
                })
            })
        }

        var projected = request
        repeat(100) {
            projected = ProviderNativeWebSearchProjector.project(
                projected,
                ProviderWireFormat.Responses,
                officialDeepSeek(),
            )
        }
        val tools = projected["tools"] as JsonArray

        assertEquals(501, tools.size)
        assertEquals(1, tools.count { it.jsonObject.string("type") == "web_search" })
        assertTrue(tools.none { it.jsonObject.string("name") == AgentNativeWebSearchBridgeTool })
    }

    private fun officialDeepSeek() = ModelConfig(
        provider = "deepseek",
        baseUrl = "",
        model = "deepseek-v4-flash",
        apiFormat = ModelApiFormat.Responses,
    )

    private fun json(value: String): JsonObject =
        ElecKoiJson.parseToJsonElement(value).jsonObject

    private fun JsonObject.string(name: String): String? =
        (get(name) as? JsonPrimitive)?.contentOrNull
}
