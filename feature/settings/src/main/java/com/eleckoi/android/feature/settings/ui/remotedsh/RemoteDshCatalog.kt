package com.eleckoi.android.feature.settings.ui.remotedsh

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshSessionSummary
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshWorkspaceSummary
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.ModelProviderIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSectionHeader
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSectionNote

@Composable
internal fun RemoteDshCatalog(
    state: RemoteDshSettingsUiState,
    appearance: AppearanceTheme,
    onOpenSession: (String) -> Unit,
    onBindSession: (String) -> Unit,
    onCreateSession: (RemoteDshWorkspaceSummary) -> Unit,
    onRenameSession: (RemoteDshSessionSummary) -> Unit,
    onArchiveSession: (RemoteDshSessionSummary) -> Unit,
) {
    ModelSectionHeader("当前角色执行目标", appearance, actions = {})
    val binding = state.roleBinding
    if (binding == null) {
        ModelSectionNote("尚未绑定。请在一个电脑工作区中选择现有会话，或新建会话后绑定。未绑定时角色不能调用电脑 DSH。", appearance)
    } else {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(appearance.mobileSurface)
                .padding(14.dp),
        ) {
            Text(binding.sessionTitle, color = appearance.mobileText, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            Text(
                "${binding.workspaceTitle} · ${binding.workspacePath}",
                color = appearance.mobileMuted,
                fontSize = 11.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }

    ModelSectionHeader("电脑工作区与会话", appearance, actions = {})
    if (state.workspaces.isEmpty()) {
        ModelSectionNote("电脑 DSH 还没有工作区。请先在电脑 DSH 网页中添加项目目录，再回来刷新。", appearance)
    }
    val sessionById = remember(state.sessions) { state.sessions.associateBy(RemoteDshSessionSummary::sessionId) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        state.workspaces.forEach { workspace ->
            val workspaceSessions = workspace.sessionIds.mapNotNull(sessionById::get)
            RemoteDshWorkspaceSessionGroup(
                workspace = workspace,
                sessions = workspaceSessions,
                boundSessionId = binding?.sessionId,
                appearance = appearance,
                onOpenSession = onOpenSession,
                onBindSession = onBindSession,
                onCreateSession = { onCreateSession(workspace) },
                onRenameSession = onRenameSession,
                onArchiveSession = onArchiveSession,
            )
        }
    }

    val ungrouped = state.sessions.filter { it.workspaceId.isBlank() }
    if (ungrouped.isNotEmpty()) {
        ModelSectionHeader("未绑定工作区", appearance, actions = {})
        ModelSectionNote("这些是电脑 DSH 自己已有但未归入工作区的会话，只能同步查看；角色任务不会绑定到这里。", appearance)
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ungrouped.forEach { session ->
                RemoteDshSessionRow(
                    session = session,
                    bound = false,
                    canBind = false,
                    appearance = appearance,
                    onOpen = { onOpenSession(session.sessionId) },
                    onBind = {},
                    onRename = { onRenameSession(session) },
                    onArchive = { onArchiveSession(session) },
                )
            }
        }
    }
}

@Composable
private fun RemoteDshWorkspaceSessionGroup(
    workspace: RemoteDshWorkspaceSummary,
    sessions: List<RemoteDshSessionSummary>,
    boundSessionId: String?,
    appearance: AppearanceTheme,
    onOpenSession: (String) -> Unit,
    onBindSession: (String) -> Unit,
    onCreateSession: () -> Unit,
    onRenameSession: (RemoteDshSessionSummary) -> Unit,
    onArchiveSession: (RemoteDshSessionSummary) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(appearance.mobileSurface.copy(alpha = 0.55f))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(4.dp)) {
            Column(modifier = Modifier.weight(1f)) {
                Text(workspace.title, color = appearance.mobileText, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    workspace.path,
                    color = appearance.mobileMuted,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Text(
                "新建会话",
                color = appearance.mobileBlue,
                fontSize = 12.sp,
                modifier = Modifier.padding(8.dp).noRippleClickable(onClick = onCreateSession),
            )
        }
        if (sessions.isEmpty()) {
            Text("暂无会话", color = appearance.mobileMuted, fontSize = 12.sp, modifier = Modifier.padding(8.dp))
        }
        sessions.forEach { session ->
            RemoteDshSessionRow(
                session = session,
                bound = session.sessionId == boundSessionId,
                canBind = true,
                appearance = appearance,
                onOpen = { onOpenSession(session.sessionId) },
                onBind = { onBindSession(session.sessionId) },
                onRename = { onRenameSession(session) },
                onArchive = { onArchiveSession(session) },
            )
        }
    }
}

@Composable
private fun RemoteDshSessionRow(
    session: RemoteDshSessionSummary,
    bound: Boolean,
    canBind: Boolean,
    appearance: AppearanceTheme,
    onOpen: () -> Unit,
    onBind: () -> Unit,
    onRename: () -> Unit,
    onArchive: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(appearance.mobileSurface)
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            ModelProviderIcon("deepseek", "D", appearance, Modifier.size(30.dp))
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 11.dp, end = 8.dp)
                    .noRippleClickable(onClick = onOpen),
            ) {
                Text(
                    session.title,
                    color = appearance.mobileText,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    if (session.blank) "尚未开始" else if (session.running) "运行中" else "空闲",
                    color = if (session.running) appearance.mobileBlue else appearance.mobileMuted,
                    fontSize = 11.sp,
                )
            }
            Text(
                if (bound) "已绑定" else if (canBind) "绑定" else "查看",
                color = if (bound || canBind) appearance.mobileBlue else appearance.mobileMuted,
                fontSize = 12.sp,
                modifier = Modifier.padding(8.dp).noRippleClickable {
                    if (canBind && !bound) onBind() else onOpen()
                },
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 7.dp, start = 41.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                "打开同步对话",
                color = appearance.mobileMuted,
                fontSize = 11.sp,
                modifier = Modifier.noRippleClickable(onClick = onOpen),
            )
            Text(
                "重命名",
                color = appearance.mobileMuted,
                fontSize = 11.sp,
                modifier = Modifier.noRippleClickable(onClick = onRename),
            )
            Text(
                "移除",
                color = ElecKoiDanger,
                fontSize = 11.sp,
                modifier = Modifier.noRippleClickable(onClick = onArchive),
            )
        }
    }
}
