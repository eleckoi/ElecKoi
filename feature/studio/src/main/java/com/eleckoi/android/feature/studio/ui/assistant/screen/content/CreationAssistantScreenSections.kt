package com.eleckoi.android.feature.studio.ui.assistant.screen.content

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeState
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.QuietBackButton
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantIntent
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import com.eleckoi.android.feature.studio.ui.assistant.runtime.RuntimeBootstrapScreen
import com.eleckoi.android.feature.studio.ui.assistant.workspace.drawer.CreationWorkspaceDrawer

@Composable
internal fun CreationAssistantWorkspaceDrawer(
    state: AiCreationAssistantUiState,
    appearance: AppearanceTheme,
    onIntent: (AiCreationAssistantIntent) -> Unit,
    onUnavailable: (String) -> Unit,
) {
    CreationWorkspaceDrawer(
        workspaces = state.workspaces,
        pinnedWorkspaceIds = state.pinnedWorkspaceIds,
        workspaceExpansionOverrides = state.workspaceExpansionOverrides,
        activeWorkspaceId = state.workspace?.id,
        activeConversationId = state.conversation?.id,
        appearance = appearance,
        onOpenConversation = { workspaceId, conversationId ->
            onIntent(AiCreationAssistantIntent.SelectConversation(workspaceId, conversationId))
        },
        onCreateWorkspace = {
            onIntent(AiCreationAssistantIntent.CreateWorkspace(it))
        },
        onCreateConversation = {
            onIntent(AiCreationAssistantIntent.CreateConversation(it))
        },
        onRenameWorkspace = { id, name ->
            onIntent(AiCreationAssistantIntent.RenameWorkspace(id, name))
        },
        onRenameConversation = { workspaceId, conversationId, title ->
            onIntent(
                AiCreationAssistantIntent.RenameConversation(workspaceId, conversationId, title),
            )
        },
        onDeleteWorkspace = {
            onIntent(AiCreationAssistantIntent.DeleteWorkspace(it))
        },
        onDeleteConversation = { workspaceId, conversationId ->
            onIntent(AiCreationAssistantIntent.DeleteConversation(workspaceId, conversationId))
        },
        onTogglePinnedWorkspace = {
            onIntent(AiCreationAssistantIntent.TogglePinnedWorkspace(it))
        },
        onToggleWorkspaceExpanded = {
            onIntent(AiCreationAssistantIntent.ToggleWorkspaceExpanded(it))
        },
        onUnavailable = onUnavailable,
    )
}

@Composable
internal fun CreationAssistantRuntimeBootstrap(
    state: AiCreationAssistantUiState,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onIntent: (AiCreationAssistantIntent) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .background(appearance.mobileSurface)
                .padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            QuietBackButton(
                color = appearance.mobileText.copy(alpha = 0.84f),
                onClick = onBack,
                modifier = Modifier.size(48.dp),
            )
        }
        RuntimeBootstrapScreen(
            runtimeState = state.runtimeState,
            installationState = state.runtimeInstallationState,
            appearance = appearance,
            onRetry = {
                val intent = when {
                    state.runtimeState is LocalRuntimeState.Failed -> {
                        AiCreationAssistantIntent.RefreshRuntime
                    }
                    state.runtimeCapabilities?.health == LocalRuntimeHealth.NeedsRepair -> {
                        AiCreationAssistantIntent.RepairRuntime
                    }
                    else -> AiCreationAssistantIntent.InstallRuntime
                }
                onIntent(intent)
            },
            modifier = Modifier.weight(1f),
        )
    }
}
