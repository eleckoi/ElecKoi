package com.eleckoi.android.engine.agent.diagnostics

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentRequestDiagnosticsTest {
    @Test
    fun explicitCaptureSwitchOverridesReleaseDefault() {
        AgentRequestDiagnostics.configureCaptureDefault(false)
        AgentRequestDiagnostics.setCaptureEnabled(true)
        assertTrue(AgentRequestDiagnostics.captureEnabled.value)

        AgentRequestDiagnostics.setCaptureEnabled(false)
        assertEquals(false, AgentRequestDiagnostics.captureEnabled.value)
    }

    @Test
    fun groupsEveryProviderRequestUnderOneTurnAndPreservesBothBodies() {
        val workspaceId = "request-capture-workspace"
        val conversationId = "request-capture-conversation"
        AgentRequestDiagnostics.clear(workspaceId, conversationId)

        val captureId = AgentRequestDiagnostics.beginTurn(
            workspaceId = workspaceId,
            conversationId = conversationId,
            userMessage = "检查请求",
        )
        AgentRequestDiagnostics.recordHarnessRequest(captureId, "request-1", """{"input":"one"}""")
        AgentRequestDiagnostics.recordProviderRequest(captureId, "request-1", """{"messages":["one"]}""")
        AgentRequestDiagnostics.recordHarnessRequest(captureId, "request-2", """{"input":"two"}""")
        AgentRequestDiagnostics.recordProviderRequest(captureId, "request-2", """{"messages":["two"]}""")
        AgentRequestDiagnostics.bindRuntimeTurn(captureId, "turn-real")
        AgentRequestDiagnostics.endTurn(captureId)

        val turn = AgentRequestDiagnostics.turns.value.single {
            it.workspaceId == workspaceId && it.conversationId == conversationId
        }
        assertEquals("检查请求", turn.userMessage)
        assertEquals("turn-real", turn.runtimeTurnId)
        assertEquals(listOf(1, 2), turn.requests.map { it.index })
        assertEquals("""{"input":"one"}""", turn.requests.first().harnessRequestBody)
        assertEquals("""{"messages":["one"]}""", turn.requests.first().providerRequestBody)
        assertTrue(turn.completedAtMillis > 0L)

        AgentRequestDiagnostics.clear(workspaceId, conversationId)
    }

    @Test
    fun requestsFromTheNextTurnCannotJoinThePreviousTurn() {
        val workspaceId = "request-isolation-workspace"
        val conversationId = "request-isolation-conversation"
        AgentRequestDiagnostics.clear(workspaceId, conversationId)

        val first = AgentRequestDiagnostics.beginTurn(
            workspaceId = workspaceId,
            conversationId = conversationId,
            userMessage = "first",
        )
        AgentRequestDiagnostics.recordHarnessRequest(first, "request-a", """{"turn":1}""")
        AgentRequestDiagnostics.endTurn(first)
        val second = AgentRequestDiagnostics.beginTurn(
            workspaceId = workspaceId,
            conversationId = conversationId,
            userMessage = "second",
        )
        AgentRequestDiagnostics.recordHarnessRequest(second, "request-b", """{"turn":2}""")

        val turns = AgentRequestDiagnostics.turns.value.filter {
            it.workspaceId == workspaceId && it.conversationId == conversationId
        }
        assertEquals(2, turns.size)
        assertEquals(listOf("request-a"), turns[0].requests.map { it.requestId })
        assertEquals(listOf("request-b"), turns[1].requests.map { it.requestId })

        AgentRequestDiagnostics.clear(workspaceId, conversationId)
    }

    @Test
    fun auxiliaryImageRequestsJoinTheMatchingCompletedTurnWithVisibleLabels() {
        val workspaceId = "image-capture-workspace"
        val conversationId = "image-capture-conversation"
        AgentRequestDiagnostics.clear(workspaceId, conversationId)
        val captureId = AgentRequestDiagnostics.beginTurn(
            workspaceId = workspaceId,
            conversationId = conversationId,
            userMessage = "画这一轮",
        )
        AgentRequestDiagnostics.bindRuntimeTurn(captureId, "turn-image")
        AgentRequestDiagnostics.endTurn(captureId)

        AgentRequestDiagnostics.recordAuxiliaryRequest(
            workspaceId = workspaceId,
            conversationId = conversationId,
            runtimeTurnId = "turn-image",
            label = "NovelAI 生图",
            logicalRequestBody = """{"final_prompt":"character tags, scene tags"}""",
            providerRequestBody = """{"action":"generate"}""",
        )

        val request = AgentRequestDiagnostics.turns.value.single {
            it.workspaceId == workspaceId && it.conversationId == conversationId
        }.requests.single()
        assertEquals("NovelAI 生图", request.label)
        assertEquals("""{"final_prompt":"character tags, scene tags"}""", request.harnessRequestBody)
        assertEquals("""{"action":"generate"}""", request.providerRequestBody)
        AgentRequestDiagnostics.clear(workspaceId, conversationId)
    }

    @Test
    fun capturedBodiesAreTruncatedAndOldRequestsAreEvictedWithinTheGlobalBudget() {
        val workspaceId = "request-budget-workspace"
        val conversationId = "request-budget-conversation"
        AgentRequestDiagnostics.clear(workspaceId, conversationId)
        val captureId = AgentRequestDiagnostics.beginTurn(
            workspaceId = workspaceId,
            conversationId = conversationId,
            userMessage = "u".repeat(100_000),
        )

        repeat(5) { index ->
            val requestId = "large-request-$index"
            AgentRequestDiagnostics.recordHarnessRequest(
                captureId = captureId,
                requestId = requestId,
                requestBody = "$index".repeat(600_000),
            )
            AgentRequestDiagnostics.recordProviderRequest(
                captureId = captureId,
                requestId = requestId,
                requestBody = "$index".repeat(600_000),
            )
        }

        val turn = AgentRequestDiagnostics.turns.value.single {
            it.workspaceId == workspaceId && it.conversationId == conversationId
        }
        val capturedChars = turn.userMessage.length.toLong() + turn.requests.sumOf { request ->
            request.harnessRequestBody.length.toLong() + request.providerRequestBody.length.toLong()
        }
        assertTrue(turn.userMessage.length <= 64_000)
        assertTrue(turn.requests.all { request ->
            request.harnessRequestBody.length <= 512_000 &&
                request.providerRequestBody.length <= 512_000
        })
        assertTrue(capturedChars <= 2_000_000L)
        assertEquals("large-request-4", turn.requests.last().requestId)

        AgentRequestDiagnostics.clear(workspaceId, conversationId)
    }
}
