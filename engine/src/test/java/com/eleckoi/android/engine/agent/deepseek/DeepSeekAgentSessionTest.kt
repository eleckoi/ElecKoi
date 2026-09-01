package com.eleckoi.android.engine.agent.deepseek

import com.eleckoi.android.engine.agent.api.AgentHarnessId
import com.eleckoi.android.engine.agent.api.AgentSessionOptions
import com.eleckoi.android.engine.agent.api.AgentSessionState
import com.eleckoi.android.engine.agent.api.AgentThreadStart
import com.eleckoi.android.engine.agent.deepseek.protocol.DeepSeekHarnessJsonRpcClient
import com.eleckoi.android.engine.agent.deepseek.protocol.DeepSeekHarnessTransport
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DeepSeekAgentSessionTest {
    @Test
    fun `session identity is stable per workspace and conversation and isolated across chats`() = runBlocking {
        val backend = DeepSeekAgentSessionFactory(
            DeepSeekSessionBackendFactory { _, scope ->
                PreparedDeepSeekBackend(
                    model = "route",
                    maxTokens = null,
                    client = DeepSeekHarnessJsonRpcClient(RespondingTransport(), scope),
                    release = {},
                    bindSessionRoute = {},
                    beginTurnWindow = { _, _, _ -> "" },
                    bindTurnWindow = { _, _ -> },
                    endTurnWindow = {},
                )
            },
        )

        suspend fun id(workspace: String, conversation: String): String {
            val session = backend.create(
                AgentSessionOptions(
                    harness = AgentHarnessId.DeepSeek,
                    workspaceId = workspace,
                    conversationId = conversation,
                ),
            )
            session.start()
            return (session.state.value as AgentSessionState.Ready).threadId.also {
                session.shutdown()
            }
        }

        assertEquals(id("workspace-a", "chat-a"), id("workspace-a", "chat-a"))
        assertNotEquals(id("workspace-a", "chat-a"), id("workspace-a", "chat-b"))
        assertNotEquals(id("workspace-a", "chat-a"), id("workspace-b", "chat-a"))
    }

    @Test
    fun `binds DeepSeek session route before starting Harness transport`() = runBlocking {
        var boundSessionId: String? = null
        val transport = BindingAwareTransport { boundSessionId }
        val backendFactory = DeepSeekSessionBackendFactory { _, scope ->
            PreparedDeepSeekBackend(
                model = "deepseek-test",
                maxTokens = 4_096,
                client = DeepSeekHarnessJsonRpcClient(transport, scope),
                release = {},
                bindSessionRoute = { sessionId -> boundSessionId = sessionId },
                beginTurnWindow = { _, _, _ -> "" },
                bindTurnWindow = { _, _ -> },
                endTurnWindow = {},
            )
        }
        val session = DeepSeekAgentSessionFactory(backendFactory).create(
            AgentSessionOptions(
                harness = AgentHarnessId.DeepSeek,
                workspaceId = "workspace-route-binding",
                conversationId = "conversation-route-binding",
            ),
        )

        session.start()

        val ready = session.state.value as AgentSessionState.Ready
        assertEquals(ready.threadId, boundSessionId)
        assertTrue(transport.routeWasBoundBeforeStart)
        session.shutdown()
    }

    @Test
    fun `deletes obsolete native branches before binding a fresh replacement`() = runBlocking {
        val lifecycle = mutableListOf<String>()
        val transport = RespondingTransport()
        val backendFactory = DeepSeekSessionBackendFactory { _, scope ->
            PreparedDeepSeekBackend(
                model = "deepseek-test",
                maxTokens = null,
                client = DeepSeekHarnessJsonRpcClient(transport, scope),
                release = {},
                discardSessionFiles = { sessionIds ->
                    lifecycle += "discard:${sessionIds.sorted().joinToString()}"
                },
                bindSessionRoute = { lifecycle += "bind:$it" },
                beginTurnWindow = { _, _, _ -> "" },
                bindTurnWindow = { _, _ -> },
                endTurnWindow = {},
            )
        }
        val session = DeepSeekAgentSessionFactory(backendFactory).create(
            AgentSessionOptions(
                workspaceId = "workspace-replace",
                conversationId = "conversation-replace",
                threadStart = AgentThreadStart.Fresh,
                discardThreadIds = setOf("eleckoi-obsolete"),
            ),
        )

        session.start()

        assertEquals("discard:eleckoi-obsolete", lifecycle.first())
        assertTrue(lifecycle[1].startsWith("bind:eleckoi-"))
        session.shutdown()
    }

    private class BindingAwareTransport(
        private val boundSessionId: () -> String?,
    ) : DeepSeekHarnessTransport {
        private val lines = Channel<String>(Channel.BUFFERED)
        override val incomingLines: Flow<String> = lines.receiveAsFlow()
        var routeWasBoundBeforeStart = false
            private set

        override suspend fun start() {
            routeWasBoundBeforeStart = !boundSessionId().isNullOrBlank()
            check(routeWasBoundBeforeStart) { "DeepSeek route was not bound before transport start" }
        }

        override suspend fun sendLine(line: String) {
            val request = ProtocolJson.parseToJsonElement(line).jsonObject
            val id = request.getValue("id").jsonPrimitive.content
            when (request.getValue("method").jsonPrimitive.content) {
                "initialize" -> lines.send(
                    """{"jsonrpc":"2.0","id":$id,"result":{"serverInfo":{"name":"deepseek-harness-sdk-runtime","version":"test"}}}""",
                )
                "session/set_permission" -> {
                    val preset = request.getValue("params").jsonObject.getValue("preset").jsonPrimitive.content
                    lines.send("""{"jsonrpc":"2.0","id":$id,"result":{"preset":"$preset"}}""")
                }
                "shutdown" -> lines.send("""{"jsonrpc":"2.0","id":$id,"result":{}}""")
            }
        }

        override suspend fun stop() {
            lines.close()
        }
    }

    private class RespondingTransport : DeepSeekHarnessTransport {
        private val lines = Channel<String>(Channel.BUFFERED)
        override val incomingLines: Flow<String> = lines.receiveAsFlow()
        override suspend fun start() = Unit
        override suspend fun sendLine(line: String) {
            val request = ProtocolJson.parseToJsonElement(line).jsonObject
            val id = request.getValue("id").jsonPrimitive.content
            when (request.getValue("method").jsonPrimitive.content) {
                "initialize" -> lines.send(
                    """{"jsonrpc":"2.0","id":$id,"result":{"serverInfo":{"name":"deepseek-harness-sdk-runtime","version":"test"}}}""",
                )
                "session/set_permission" -> {
                    val preset = request.getValue("params").jsonObject.getValue("preset").jsonPrimitive.content
                    lines.send("""{"jsonrpc":"2.0","id":$id,"result":{"preset":"$preset"}}""")
                }
                "shutdown" -> lines.send("""{"jsonrpc":"2.0","id":$id,"result":{}}""")
            }
        }
        override suspend fun stop() {
            lines.close()
        }
    }

    private companion object {
        val ProtocolJson = Json { ignoreUnknownKeys = false }
    }
}
