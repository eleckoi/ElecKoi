package com.eleckoi.android.feature.studio.ui.assistant.runtime

import com.eleckoi.android.engine.agent.api.AgentWorkStatus
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeCapabilities
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeState
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationEvent
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationState
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import com.eleckoi.android.feature.conversation.timeline.CreationAgentTimelineReducer

internal fun LocalRuntimeState.creationCapabilitiesOrNull(): LocalRuntimeCapabilities? = when (this) {
    is LocalRuntimeState.Ready -> capabilities
    is LocalRuntimeState.Running -> capabilities
    else -> null
}

internal fun AiCreationAssistantUiState.withRuntimeState(
    runtimeState: LocalRuntimeState,
): AiCreationAssistantUiState {
    if (runtimeState !is LocalRuntimeState.Failed || !isRunning) {
        return copy(runtimeState = runtimeState)
    }
    return copy(
        runtimeState = runtimeState,
        timeline = CreationAgentTimelineReducer.finishTurn(timeline, AgentWorkStatus.Failed),
        isRunning = false,
        pendingApprovals = emptyList(),
        errorMessage = runtimeState.message.ifBlank { "本地创作环境连接中断" },
    )
}

internal fun AiCreationAssistantUiState.withCompletedRuntimeInstallation(
    event: RuntimeInstallationEvent.Completed,
): AiCreationAssistantUiState = copy(
    runtimeState = when (val current = runtimeState) {
        is LocalRuntimeState.Running -> current.copy(capabilities = event.capabilities)
        else -> LocalRuntimeState.Ready(event.capabilities)
    },
    runtimeInstallationState = RuntimeInstallationState.Idle,
)
