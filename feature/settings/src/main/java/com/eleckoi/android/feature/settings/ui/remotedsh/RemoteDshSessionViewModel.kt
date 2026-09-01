package com.eleckoi.android.feature.settings.ui.remotedsh

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.eleckoi.android.engine.agent.api.AgentApprovalDecision
import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import com.eleckoi.android.engine.agent.api.AgentWorkStatus
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshPermissionMode
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshPlugin
import com.eleckoi.android.feature.studio.ui.assistant.CreationApprovalRequest
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.CreationAgentTimelineReducer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal data class RemoteDshSessionUiState(
    val sessionId: String,
    val title: String,
    val cwd: String,
    val timeline: List<CreationTimelineItem> = emptyList(),
    val approvals: List<CreationApprovalRequest> = emptyList(),
    val running: Boolean = false,
    val loading: Boolean = true,
    val sending: Boolean = false,
    val permissionMode: RemoteDshPermissionMode = RemoteDshPermissionMode.WorkspaceWrite,
    val errorMessage: String = "",
)

class RemoteDshSessionViewModel(
    private val plugin: RemoteDshPlugin,
    private val sessionId: String,
) : ViewModel() {
    private val pendingLiveEvents = mutableListOf<AgentSessionEvent>()
    private val initialSummary = plugin.sessions.value.firstOrNull { it.sessionId == sessionId }
    private val _uiState = MutableStateFlow(
        RemoteDshSessionUiState(
            sessionId = sessionId,
            title = initialSummary?.title ?: sessionId.take(12),
            cwd = initialSummary?.cwd.orEmpty(),
            running = initialSummary?.running == true,
            permissionMode = initialSummary?.agentPreset.toPermissionMode(),
        ),
    )
    internal val uiState: StateFlow<RemoteDshSessionUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            plugin.sessions.collect { sessions ->
                val summary = sessions.firstOrNull { it.sessionId == sessionId } ?: return@collect
                _uiState.update {
                    it.copy(
                        title = summary.title,
                        cwd = summary.cwd,
                        running = summary.running,
                        permissionMode = summary.agentPreset.toPermissionMode(),
                    )
                }
            }
        }
        viewModelScope.launch {
            plugin.events.collect { remote ->
                if (remote.sessionId != sessionId) return@collect
                if (_uiState.value.loading) {
                    pendingLiveEvents += remote.event
                } else {
                    applyEvent(remote.event)
                }
            }
        }
        loadHistory()
    }

    internal fun send(text: String) {
        if (text.isBlank() || _uiState.value.sending) return
        viewModelScope.launch {
            _uiState.update { it.copy(sending = true, errorMessage = "") }
            runCatching {
                withContext(Dispatchers.IO) {
                    plugin.prompt(sessionId, text.trim(), steer = _uiState.value.running)
                }
            }.onSuccess {
                _uiState.update { it.copy(sending = false) }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(sending = false, errorMessage = error.message ?: "发送失败")
                }
            }
        }
    }

    internal fun cancel() {
        viewModelScope.launch {
            runCatching { withContext(Dispatchers.IO) { plugin.cancel(sessionId) } }
                .onFailure { error ->
                    _uiState.update { it.copy(errorMessage = error.message ?: "停止失败") }
                }
        }
    }

    internal fun setPermission(mode: RemoteDshPermissionMode) {
        viewModelScope.launch {
            runCatching { withContext(Dispatchers.IO) { plugin.setPermission(sessionId, mode) } }
                .onSuccess { _uiState.update { it.copy(permissionMode = mode, errorMessage = "") } }
                .onFailure { error ->
                    _uiState.update { it.copy(errorMessage = error.message ?: "权限切换失败") }
                }
        }
    }

    internal fun decideApproval(requestId: Long, decision: AgentApprovalDecision) {
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { plugin.respondToApproval(requestId, decision) }
            }.onFailure { error ->
                _uiState.update { it.copy(errorMessage = error.message ?: "审批失败") }
            }
        }
    }

    private fun loadHistory() {
        viewModelScope.launch {
            runCatching { withContext(Dispatchers.IO) { plugin.loadHistory(sessionId) } }
                .onSuccess { events ->
                    var timeline = emptyList<CreationTimelineItem>()
                    events.forEach { remote ->
                        timeline = reduceTimeline(timeline, remote.event)
                    }
                    _uiState.update { it.copy(timeline = timeline, loading = false, errorMessage = "") }
                    flushPendingLiveEvents()
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(loading = false, errorMessage = error.message ?: "读取电脑 DSH 历史失败")
                    }
                    flushPendingLiveEvents()
                }
        }
    }

    private fun flushPendingLiveEvents() {
        val buffered = pendingLiveEvents.toList()
        pendingLiveEvents.clear()
        buffered.forEach(::applyEvent)
    }

    private fun applyEvent(event: AgentSessionEvent) {
        when (event) {
            is AgentSessionEvent.ApprovalRequested -> _uiState.update {
                if (it.approvals.any { row -> row.requestId == event.requestId }) it else it.copy(
                    approvals = it.approvals + CreationApprovalRequest(
                        requestId = event.requestId,
                        kind = event.kind,
                        threadId = event.threadId,
                        turnId = event.turnId,
                        itemId = event.itemId,
                        title = event.title,
                        detail = event.detail,
                        availableDecisions = event.availableDecisions,
                        rawCommand = event.rawCommand,
                        commandActions = event.commandActions,
                    ),
                )
            }
            is AgentSessionEvent.ApprovalResolved -> _uiState.update {
                it.copy(approvals = it.approvals.filterNot { row -> row.requestId == event.requestId })
            }
            else -> _uiState.update { it.copy(timeline = reduceTimeline(it.timeline, event)) }
        }
    }

    companion object {
        fun factory(plugin: RemoteDshPlugin, sessionId: String): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    RemoteDshSessionViewModel(plugin, sessionId) as T
            }
    }
}

private fun reduceTimeline(
    timeline: List<CreationTimelineItem>,
    event: AgentSessionEvent,
): List<CreationTimelineItem> = when (event) {
    is AgentSessionEvent.TurnCompleted -> CreationAgentTimelineReducer.finishTurn(
        timeline = timeline,
        status = event.status,
        turnId = event.turnId,
        completedAtMillis = event.completedAtMillis.takeIf { it > 0L } ?: System.currentTimeMillis(),
    )
    else -> CreationAgentTimelineReducer.apply(timeline, event)
}

private fun String?.toPermissionMode(): RemoteDshPermissionMode = when (this) {
    "read-only", "ask-for-approval" -> RemoteDshPermissionMode.ReadOnly
    "danger-full-access", "full-access" -> RemoteDshPermissionMode.FullAccess
    else -> RemoteDshPermissionMode.WorkspaceWrite
}
