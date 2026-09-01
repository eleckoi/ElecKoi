package com.eleckoi.android.engine.agent.diagnostics

import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Exact request bodies captured at the Android Agent provider bridge.
 *
 * This is deliberately process-local and bounded by both turn count and total captured bytes.
 * Persisting these bodies would duplicate the complete conversation history once for every tool
 * continuation request.
 */
data class AgentProviderRequestCapture(
    val id: String,
    val requestId: String,
    val index: Int,
    val capturedAtMillis: Long,
    val harnessRequestBody: String,
    val providerRequestBody: String = "",
    val label: String = "",
)

data class AgentTurnRequestCapture(
    val id: String,
    val workspaceId: String,
    val conversationId: String,
    val runtimeTurnId: String = "",
    val userMessage: String,
    val startedAtMillis: Long,
    val completedAtMillis: Long = 0L,
    val requests: List<AgentProviderRequestCapture> = emptyList(),
)

object AgentRequestDiagnostics {
    private const val MaxCapturedTurns = 12
    private const val MaxCapturedBodyChars = 512_000
    private const val MaxCapturedUserMessageChars = 64_000
    private const val MaxTotalCapturedChars = 2_000_000

    private val _turns = MutableStateFlow<List<AgentTurnRequestCapture>>(emptyList())
    val turns: StateFlow<List<AgentTurnRequestCapture>> = _turns.asStateFlow()

    private val _captureEnabled = MutableStateFlow(false)
    val captureEnabled: StateFlow<Boolean> = _captureEnabled.asStateFlow()

    /**
     * Applies the build default before the user has made an explicit choice. Release builds pass
     * false; debuggable builds may opt in by default. Request bodies remain process-local.
     */
    @Synchronized
    fun configureCaptureDefault(enabled: Boolean) {
        if (!capturePreferenceSet) _captureEnabled.value = enabled
    }

    @Synchronized
    fun setCaptureEnabled(enabled: Boolean) {
        capturePreferenceSet = true
        _captureEnabled.value = enabled
    }

    private var capturePreferenceSet = false

    @Synchronized
    fun beginTurn(
        workspaceId: String,
        conversationId: String,
        userMessage: String,
    ): String {
        val id = UUID.randomUUID().toString()
        val turn = AgentTurnRequestCapture(
            id = id,
            workspaceId = workspaceId,
            conversationId = conversationId,
            userMessage = userMessage.bounded(MaxCapturedUserMessageChars),
            startedAtMillis = System.currentTimeMillis(),
        )
        publish(_turns.value + turn)
        return id
    }

    @Synchronized
    fun bindRuntimeTurn(captureId: String, runtimeTurnId: String) {
        if (captureId.isBlank() || runtimeTurnId.isBlank()) return
        updateTurn(captureId) { turn ->
            if (turn.runtimeTurnId == runtimeTurnId) turn else turn.copy(runtimeTurnId = runtimeTurnId)
        }
    }

    @Synchronized
    fun recordHarnessRequest(
        captureId: String,
        requestId: String,
        requestBody: String,
    ) {
        if (captureId.isBlank()) return
        updateTurn(captureId) { turn ->
            if (turn.requests.any { it.requestId == requestId }) return@updateTurn turn
            turn.copy(
                requests = turn.requests + AgentProviderRequestCapture(
                    id = UUID.randomUUID().toString(),
                    requestId = requestId,
                    index = turn.requests.size + 1,
                    capturedAtMillis = System.currentTimeMillis(),
                    harnessRequestBody = requestBody.bounded(MaxCapturedBodyChars),
                ),
            )
        }
    }

    @Synchronized
    fun recordProviderRequest(
        captureId: String,
        requestId: String,
        requestBody: String,
    ) {
        if (captureId.isBlank()) return
        updateTurn(captureId) { turn ->
            turn.copy(
                requests = turn.requests.map { request ->
                    if (request.requestId == requestId) {
                        request.copy(providerRequestBody = requestBody.bounded(MaxCapturedBodyChars))
                    } else {
                        request
                    }
                },
            )
        }
    }

    /** Adds supporting model work (for example prompt compilation and image generation) to the
     * same visible roleplay turn as the reply that triggered it. */
    @Synchronized
    fun recordAuxiliaryRequest(
        workspaceId: String,
        conversationId: String,
        runtimeTurnId: String,
        label: String,
        logicalRequestBody: String,
        providerRequestBody: String,
    ) {
        val turn = _turns.value.lastOrNull { capture ->
            capture.workspaceId == workspaceId &&
                capture.conversationId == conversationId &&
                (runtimeTurnId.isBlank() || capture.runtimeTurnId == runtimeTurnId)
        } ?: return
        val requestId = "aux-${UUID.randomUUID()}"
        updateTurn(turn.id) { current ->
            current.copy(
                requests = current.requests + AgentProviderRequestCapture(
                    id = UUID.randomUUID().toString(),
                    requestId = requestId,
                    index = current.requests.size + 1,
                    capturedAtMillis = System.currentTimeMillis(),
                    harnessRequestBody = logicalRequestBody.bounded(MaxCapturedBodyChars),
                    providerRequestBody = providerRequestBody.bounded(MaxCapturedBodyChars),
                    label = label.trim(),
                ),
            )
        }
    }

    @Synchronized
    fun endTurn(captureId: String) {
        if (captureId.isBlank()) return
        updateTurn(captureId) { turn ->
            if (turn.completedAtMillis > 0L) turn else turn.copy(
                completedAtMillis = System.currentTimeMillis(),
            )
        }
    }

    @Synchronized
    fun clear(workspaceId: String, conversationId: String) {
        publish(_turns.value.filterNot { turn ->
            turn.workspaceId == workspaceId && turn.conversationId == conversationId
        })
    }

    private fun updateTurn(
        captureId: String,
        transform: (AgentTurnRequestCapture) -> AgentTurnRequestCapture,
    ) {
        publish(_turns.value.map { turn ->
            if (turn.id == captureId) transform(turn) else turn
        })
    }

    private fun publish(source: List<AgentTurnRequestCapture>) {
        val bounded = source.takeLast(MaxCapturedTurns).toMutableList()
        while (bounded.capturedChars() > MaxTotalCapturedChars) {
            val turnIndex = bounded.indexOfFirst { turn -> turn.requests.isNotEmpty() }
            if (turnIndex >= 0) {
                val turn = bounded[turnIndex]
                bounded[turnIndex] = turn.copy(requests = turn.requests.drop(1))
            } else if (bounded.size > 1) {
                bounded.removeAt(0)
            } else {
                break
            }
        }
        _turns.value = bounded
    }

    private fun List<AgentTurnRequestCapture>.capturedChars(): Long = sumOf { turn ->
        turn.userMessage.length.toLong() + turn.requests.sumOf { request ->
            request.harnessRequestBody.length.toLong() +
                request.providerRequestBody.length.toLong()
        }
    }

    private fun String.bounded(maxChars: Int): String {
        if (length <= maxChars) return this
        val suffix = "\n…请求体已截断…"
        return take((maxChars - suffix.length).coerceAtLeast(0)) + suffix
    }
}
