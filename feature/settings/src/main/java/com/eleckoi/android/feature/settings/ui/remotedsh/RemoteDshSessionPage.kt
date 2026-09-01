package com.eleckoi.android.feature.settings.ui.remotedsh

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.eleckoi.android.engine.agent.api.AgentPermissionMode
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshPermissionMode
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshPlugin
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.ModelProviderIcon
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.QuietBackButton
import com.eleckoi.android.feature.studio.ui.assistant.approval.CreationApprovalCard
import com.eleckoi.android.feature.conversation.composer.AgentPermissionModeControl
import com.eleckoi.android.feature.studio.ui.assistant.screen.conversation.CreationConversation

@Composable
fun RemoteDshSessionPage(
    sessionId: String,
    plugin: RemoteDshPlugin,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
) {
    val viewModel: RemoteDshSessionViewModel = viewModel(
        key = "remote-dsh:$sessionId",
        factory = RemoteDshSessionViewModel.factory(plugin, sessionId),
    )
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var draft by remember(sessionId) { mutableStateOf("") }

    PinnedStatusScaffold(
        appearance = appearance,
        backgroundColor = appearance.mobileBg,
    ) {
        RemoteSessionHeader(state, appearance, onBack)
        Box(modifier = Modifier.fillMaxSize()) {
            if (state.loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp).align(Alignment.Center),
                    color = appearance.mobileBlue,
                    strokeWidth = 2.dp,
                )
            } else {
                CreationConversation(
                    conversationId = "remote:$sessionId",
                    timeline = state.timeline,
                    historyHasMore = false,
                    historyPageLoading = false,
                    pendingSteerInputs = emptyList(),
                    isRunning = state.running,
                    currentWorkspacePaths = emptyList(),
                    canUndo = false,
                    isRestoring = false,
                    onUndo = {},
                    onLoadOlder = {},
                    appearance = appearance,
                    emptyPrompt = "给电脑上的 DSH 一个任务",
                    bottomContentPadding = if (state.approvals.isEmpty()) 112.dp else 250.dp,
                    showProcessedHeaders = false,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .imePadding()
                    .navigationBarsPadding()
                    .background(appearance.mobileBg.copy(alpha = 0.97f))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                state.approvals.firstOrNull()?.let { approval ->
                    CreationApprovalCard(
                        approval = approval,
                        pendingCount = state.approvals.size,
                        appearance = appearance,
                        onDecision = { decision -> viewModel.decideApproval(approval.requestId, decision) },
                    )
                }
                if (state.errorMessage.isNotBlank()) {
                    Text(
                        state.errorMessage,
                        color = ElecKoiDanger,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                }
                RemoteComposer(
                    draft = draft,
                    onDraftChange = { draft = it },
                    running = state.running,
                    sending = state.sending,
                    permissionMode = state.permissionMode,
                    appearance = appearance,
                    onPermissionChange = viewModel::setPermission,
                    onSend = {
                        val submitted = draft.trim()
                        if (submitted.isNotEmpty()) {
                            draft = ""
                            viewModel.send(submitted)
                        }
                    },
                    onStop = viewModel::cancel,
                )
            }
        }
    }
}

@Composable
private fun RemoteSessionHeader(
    state: RemoteDshSessionUiState,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        QuietBackButton(color = appearance.mobileText, onClick = onBack)
        ModelProviderIcon("deepseek", "D", appearance, Modifier.size(28.dp))
        Column(modifier = Modifier.weight(1f).padding(start = 9.dp)) {
            Text(
                state.title,
                color = appearance.mobileText,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                if (state.running) "电脑 DSH · 运行中" else "电脑 DSH · 已连接",
                color = if (state.running) appearance.mobileBlue else appearance.mobileMuted,
                fontSize = 10.5.sp,
            )
        }
    }
}

@Composable
private fun RemoteComposer(
    draft: String,
    onDraftChange: (String) -> Unit,
    running: Boolean,
    sending: Boolean,
    permissionMode: RemoteDshPermissionMode,
    appearance: AppearanceTheme,
    onPermissionChange: (RemoteDshPermissionMode) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(appearance.mobileSurface)
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        BasicTextField(
            value = draft,
            onValueChange = { onDraftChange(it.take(20_000)) },
            modifier = Modifier.fillMaxWidth().padding(horizontal = 3.dp, vertical = 4.dp),
            textStyle = TextStyle(color = appearance.mobileText, fontSize = 15.sp, lineHeight = 21.sp),
            cursorBrush = SolidColor(appearance.mobileBlue),
            maxLines = 6,
            decorationBox = { inner ->
                Box {
                    if (draft.isEmpty()) {
                        Text("给电脑上的 DSH 发送消息", color = appearance.mobileMuted, fontSize = 15.sp)
                    }
                    inner()
                }
            },
        )
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            AgentPermissionModeControl(
                permissionMode = permissionMode.toAgentMode(),
                onPermissionModeChange = { onPermissionChange(it.toRemoteMode()) },
                appearance = appearance,
                enabled = true,
                showLabel = true,
            )
            Box(modifier = Modifier.weight(1f))
            IconButton(
                onClick = if (running) onStop else onSend,
                enabled = running || (!sending && draft.isNotBlank()),
                modifier = Modifier.size(38.dp),
            ) {
                Icon(
                    if (running) Icons.Rounded.Stop else Icons.AutoMirrored.Rounded.Send,
                    contentDescription = if (running) "停止电脑 DSH" else "发送到电脑 DSH",
                    tint = if (running || (!sending && draft.isNotBlank())) appearance.mobileBlue else appearance.mobileMuted,
                )
            }
        }
    }
}

private fun RemoteDshPermissionMode.toAgentMode(): AgentPermissionMode = when (this) {
    RemoteDshPermissionMode.ReadOnly -> AgentPermissionMode.AskForApproval
    RemoteDshPermissionMode.WorkspaceWrite -> AgentPermissionMode.ApproveForMe
    RemoteDshPermissionMode.FullAccess -> AgentPermissionMode.FullAccess
}

private fun AgentPermissionMode.toRemoteMode(): RemoteDshPermissionMode = when (this) {
    AgentPermissionMode.AskForApproval -> RemoteDshPermissionMode.ReadOnly
    AgentPermissionMode.ApproveForMe -> RemoteDshPermissionMode.WorkspaceWrite
    AgentPermissionMode.FullAccess -> RemoteDshPermissionMode.FullAccess
}
