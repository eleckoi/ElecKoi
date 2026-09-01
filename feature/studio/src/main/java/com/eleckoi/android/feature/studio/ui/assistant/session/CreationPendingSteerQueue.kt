package com.eleckoi.android.feature.studio.ui.assistant.session

import com.eleckoi.android.engine.agent.api.AgentSession
import com.eleckoi.android.engine.agent.api.AgentSessionState
import com.eleckoi.android.engine.agent.api.AgentTurnSteerUnavailableException
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import com.eleckoi.android.feature.conversation.timeline.model.CreationPendingSteerInput
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

internal class CreationPendingSteerQueue(
    private val scope: CoroutineScope,
    private val state: () -> AiCreationAssistantUiState,
    private val updateState: ((AiCreationAssistantUiState) -> AiCreationAssistantUiState) -> Unit,
    private val activeSession: () -> AgentSession?,
    private val submitCurrentInput: () -> Unit,
) {
    private val pending = ArrayDeque<CreationPendingSteerInput>()
    private var drainJob: Job? = null

    fun enqueue(prompt: String) {
        val input = CreationPendingSteerInput(text = prompt)
        pending.addLast(input)
        updateState {
            it.copy(
                input = "",
                pendingSteerInputs = it.pendingSteerInputs + input,
                notice = "",
                errorMessage = "",
            )
        }
        drain()
    }

    fun drain() {
        if (drainJob?.isActive == true || pending.isEmpty()) return
        val session = activeSession() ?: return
        if (session.state.value !is AgentSessionState.Running) return
        drainJob = scope.launch {
            try {
                while (pending.isNotEmpty() && activeSession() === session) {
                    if (session.state.value !is AgentSessionState.Running) break
                    val next = pending.first()
                    try {
                        val handle = session.steer(next.text)
                        if (pending.firstOrNull()?.id == next.id) pending.removeFirst()
                        updateState { current ->
                            current.copy(
                                pendingSteerInputs = current.pendingSteerInputs.map { preview ->
                                    if (preview.id == next.id) {
                                        preview.copy(clientUserMessageId = handle.clientUserMessageId)
                                    } else {
                                        preview
                                    }
                                },
                                notice = "",
                            )
                        }
                    } catch (_: AgentTurnSteerUnavailableException) {
                        break
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Throwable) {
                        if (pending.firstOrNull()?.id == next.id) pending.removeFirst()
                        updateState { current ->
                            current.copy(
                                input = if (current.input.isBlank()) next.text else current.input,
                                pendingSteerInputs = current.pendingSteerInputs.filterNot {
                                    it.id == next.id
                                },
                                errorMessage = error.creationAssistantMessage("补充当前任务失败"),
                            )
                        }
                        break
                    }
                }
            } finally {
                drainJob = null
            }
        }
    }

    fun submitNextIfIdle() {
        if (state().isRunning || pending.isEmpty()) return
        val next = pending.removeFirst()
        updateState {
            it.copy(
                input = next.text,
                pendingSteerInputs = it.pendingSteerInputs.filterNot { preview ->
                    preview.id == next.id
                },
                notice = "",
            )
        }
        submitCurrentInput()
    }

    fun contains(id: String): Boolean = pending.any { it.id == id }

    fun isEmpty(): Boolean = pending.isEmpty()

    fun clear(cancelDrain: Boolean = false) {
        if (cancelDrain) {
            drainJob?.cancel()
            drainJob = null
        }
        pending.clear()
    }
}

/** Consumes the front pending-steer compare key for text-only input. */
internal fun List<CreationPendingSteerInput>.withoutCommittedSteer(
    clientUserMessageId: String?,
    text: String,
): List<CreationPendingSteerInput> {
    val next = firstOrNull() ?: return this
    val clientIdMatches = clientUserMessageId
        ?.takeIf(String::isNotBlank)
        ?.let { it == next.clientUserMessageId }
        ?: false
    if (!clientIdMatches && next.text != text) return this
    return drop(1)
}
