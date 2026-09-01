package com.eleckoi.android.feature.studio.ui.assistant.session

import com.eleckoi.android.engine.agent.api.AgentPermissionMode
import com.eleckoi.android.engine.agent.api.AgentSession
import com.eleckoi.android.engine.agent.api.AgentSessionState
import com.eleckoi.android.feature.studio.api.CreatorAssistantService
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Serializes permission changes across the live Agent session and durable workspace state. */
internal class CreationPermissionModeCoordinator(
    private val creatorService: CreatorAssistantService,
    private val uiState: MutableStateFlow<AiCreationAssistantUiState>,
    private val scope: CoroutineScope,
    private val activeSession: () -> AgentSession?,
    private val activeSessionWorkspaceId: () -> String?,
    private val activeSessionConversationId: () -> String?,
) {
    private val updateMutex = Mutex()

    fun update(value: AgentPermissionMode) {
        val snapshot = uiState.value
        val workspaceId = snapshot.workspace?.id ?: return
        val conversationId = snapshot.conversation?.id ?: return
        if (snapshot.permissionMode == value) return
        val persistedBefore = snapshot.workspace.permissionMode
        val targetSession = activeSession()
            ?.takeIf { activeSessionWorkspaceId() == workspaceId }
            ?.takeIf { activeSessionConversationId() == conversationId }
        uiState.update { it.copy(permissionMode = value, errorMessage = "") }

        scope.launch {
            updateMutex.withLock {
                var sessionUpdated = false
                runCatching {
                    if (targetSession != null && activeSession() === targetSession) {
                        val applicableState = targetSession.state.first { state ->
                            state is AgentSessionState.Ready ||
                                state is AgentSessionState.Running ||
                                state is AgentSessionState.Stopped ||
                                state is AgentSessionState.Failed
                        }
                        if (
                            activeSession() === targetSession &&
                            (applicableState is AgentSessionState.Ready ||
                                applicableState is AgentSessionState.Running)
                        ) {
                            targetSession.updatePermissionMode(value)
                            sessionUpdated = true
                        }
                    }
                    creatorService.saveCreatorWorkspacePermissionMode(
                        workspaceId = workspaceId,
                        permissionMode = value,
                    )
                }.onSuccess { updated ->
                    uiState.update { state ->
                        val isCurrentWorkspace = state.workspace?.id == workspaceId
                        state.copy(
                            workspaces = state.workspaces.map { workspace ->
                                if (workspace.id == updated.id) updated else workspace
                            },
                            workspace = if (state.workspace?.id == updated.id) {
                                updated
                            } else {
                                state.workspace
                            },
                            conversation = if (isCurrentWorkspace) {
                                updated.conversations.firstOrNull { it.id == state.conversation?.id }
                                    ?: state.conversation
                            } else {
                                state.conversation
                            },
                            notice = if (isCurrentWorkspace && state.permissionMode == value) {
                                if (state.isRunning) {
                                    "工作区权限已更新，后续操作立即生效"
                                } else {
                                    "工作区权限已更新"
                                }
                            } else {
                                state.notice
                            },
                        )
                    }
                }.onFailure { error ->
                    if (sessionUpdated && targetSession != null && activeSession() === targetSession) {
                        runCatching { targetSession.updatePermissionMode(persistedBefore) }
                    }
                    uiState.update { state ->
                        if (
                            state.workspace?.id != workspaceId ||
                            state.permissionMode != value
                        ) {
                            state
                        } else {
                            state.copy(
                                permissionMode = persistedBefore,
                                errorMessage = error.creationAssistantMessage("切换工作区权限失败"),
                            )
                        }
                    }
                }
            }
        }
    }
}
