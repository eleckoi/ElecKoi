package com.eleckoi.android.engine.agent.deepseek.protocol

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeepSeekHarnessJsonRpcClientTest {
    @Test
    fun `performs official handshake prompt and shutdown contract`() = runBlocking {
        val transport = RespondingTransport()
        val client = DeepSeekHarnessJsonRpcClient(transport, this)

        client.start("/workspace", "eleckoi", "test-model", 4096)
        assertEquals(
            DeepSeekPermissionPreset.ApproveForMe,
            client.setPermission(
                sessionId = "session-1",
                cwd = "/workspace/characters/one/剧情小说/project",
                preset = DeepSeekPermissionPreset.ApproveForMe,
            ),
        )
        val messageId = client.prompt(
            sessionId = "session-1",
            text = "hello",
            mode = DeepSeekPromptMode.Steer,
            cwd = "/workspace/characters/one/剧情小说/project",
        )
        assertTrue(client.cancel("session-1"))
        assertTrue(client.resolveApproval(7L, DeepSeekApprovalOutcome.AllowedOnce))
        client.shutdown()

        assertEquals("message-1", messageId)
        assertTrue(transport.stopped)
        assertEquals(
            listOf(
                "initialize",
                "session/set_permission",
                "session/prompt",
                "session/cancel",
                "session/resolve_approval",
                "shutdown",
            ),
            transport.requests.map { it.method },
        )
        val initialize = transport.requests.first().params
        assertEquals("/workspace", initialize["cwd"]?.jsonPrimitive?.content)
        assertEquals("eleckoi", initialize["provider"]?.jsonPrimitive?.content)
        assertEquals("test-model", initialize["model"]?.jsonPrimitive?.content)
        assertEquals("4096", initialize["maxTokens"]?.jsonPrimitive?.content)
        assertEquals("approve-for-me", transport.requests[1].params["preset"]?.jsonPrimitive?.content)
        assertEquals("steer", transport.requests[2].params["mode"]?.jsonPrimitive?.content)
        assertEquals(
            "/workspace/characters/one/剧情小说/project",
            transport.requests[2].params["cwd"]?.jsonPrimitive?.content,
        )
    }

    private data class Request(val method: String, val params: JsonObject)

    private class RespondingTransport : DeepSeekHarnessTransport {
        private val lines = Channel<String>(Channel.UNLIMITED)
        val requests = mutableListOf<Request>()
        var stopped = false
        override val incomingLines: Flow<String> = lines.receiveAsFlow()

        override suspend fun start() = Unit

        override suspend fun sendLine(line: String) {
            val request = Json.parseToJsonElement(line).jsonObject
            val id = requireNotNull(request["id"])
            val method = requireNotNull(request["method"]?.jsonPrimitive?.content)
            val params = request["params"] as? JsonObject ?: JsonObject(emptyMap())
            requests += Request(method, params)
            val result = when (method) {
                "initialize" -> buildJsonObject {
                    put("serverInfo", buildJsonObject {
                        put("name", "deepseek-harness-sdk-runtime")
                        put("version", "test")
                    })
                }
                "session/prompt" -> buildJsonObject { put("messageId", "message-1") }
                "session/cancel" -> buildJsonObject { put("accepted", true) }
                "session/set_permission" -> buildJsonObject { put("preset", "approve-for-me") }
                "session/resolve_approval" -> buildJsonObject { put("accepted", true) }
                "shutdown" -> buildJsonObject { }
                else -> error("Unexpected method: $method")
            }
            lines.send(
                buildJsonObject {
                    put("jsonrpc", "2.0")
                    put("id", id)
                    put("result", result)
                }.toString(),
            )
        }

        override suspend fun stop() {
            stopped = true
            lines.close()
        }
    }
}
