package com.eleckoi.android.feature.settings.ui.remotedsh

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshConnectionState
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshSessionSummary
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshWorkspaceSummary
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AppSwitch
import com.eleckoi.android.foundation.design.components.ModelProviderIcon
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.modelconfig.ui.components.ModelActionButton
import com.eleckoi.android.feature.modelconfig.ui.components.ModelField
import com.eleckoi.android.feature.modelconfig.ui.components.ModelFieldGroup
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSectionHeader
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSectionNote
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSettingsHeader

@Composable
fun RemoteDshSettingsPage(
    appearance: AppearanceTheme,
    viewModel: RemoteDshSettingsViewModel,
    toolScopeId: String,
    onBack: () -> Unit,
    onOpenSession: (String) -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()
    var privateKeyVisible by remember { mutableStateOf(false) }
    var passphraseVisible by remember { mutableStateOf(false) }
    var createWorkspace by remember { mutableStateOf<RemoteDshWorkspaceSummary?>(null) }
    var renameSession by remember { mutableStateOf<RemoteDshSessionSummary?>(null) }
    var archiveSession by remember { mutableStateOf<RemoteDshSessionSummary?>(null) }

    LaunchedEffect(toolScopeId) { viewModel.bindToolScope(toolScopeId) }

    PinnedStatusScaffold(
        appearance = appearance,
        backgroundColor = appearance.mobileBg,
    ) {
        ModelSettingsHeader("远端 DSH", appearance, onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 18.dp, vertical = 16.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(appearance.mobileSurface)
                    .padding(horizontal = 14.dp, vertical = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ModelProviderIcon(
                    providerId = "deepseek",
                    initials = "D",
                    appearance = appearance,
                    modifier = Modifier.size(36.dp),
                )
                Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(
                        "电脑 DSH 连接",
                        color = appearance.mobileText,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "供角色工具调用，也可展开同步会话",
                        color = appearance.mobileMuted,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                    )
                }
                AppSwitch(
                    checked = state.enabled,
                    onCheckedChange = { viewModel.onIntent(RemoteDshSettingsIntent.SetEnabled(it)) },
                    appearance = appearance,
                )
            }
            ModelSectionNote(
                "这里管理所有角色共用的电脑连接。是否允许调用由每个角色工具页里的“远端 DSH”开关单独控制；下方电脑会话可点开同步查看。电脑需运行 dsh web，并可通过 Tailscale + SSH 访问。",
                appearance,
            )

            ModelSectionHeader("电脑连接", appearance, actions = {})
            ModelFieldGroup(appearance) {
                ModelField(
                    label = "电脑名称",
                    value = state.computerName,
                    placeholder = "例如：卧室电脑",
                    appearance = appearance,
                    scrollState = scrollState,
                    onChange = { viewModel.onIntent(RemoteDshSettingsIntent.SetComputerName(it)) },
                )
                ModelField(
                    label = "Tailscale 地址 / IP",
                    value = state.host,
                    placeholder = "desktop.example.ts.net",
                    appearance = appearance,
                    scrollState = scrollState,
                    onChange = { viewModel.onIntent(RemoteDshSettingsIntent.SetHost(it)) },
                )
                ModelField(
                    label = "SSH 端口",
                    value = state.sshPort,
                    placeholder = "22",
                    appearance = appearance,
                    keyboardType = KeyboardType.Number,
                    scrollState = scrollState,
                    onChange = { viewModel.onIntent(RemoteDshSettingsIntent.SetSshPort(it)) },
                )
                ModelField(
                    label = "SSH 用户名",
                    value = state.username,
                    placeholder = "电脑的登录用户名",
                    appearance = appearance,
                    scrollState = scrollState,
                    onChange = { viewModel.onIntent(RemoteDshSettingsIntent.SetUsername(it)) },
                )
                ModelField(
                    label = "SSH 主机 SHA-256 指纹",
                    value = state.hostKeySha256,
                    placeholder = "SHA256:...",
                    appearance = appearance,
                    scrollState = scrollState,
                    onChange = { viewModel.onIntent(RemoteDshSettingsIntent.SetHostKeySha256(it)) },
                )
                ModelField(
                    label = "DSH Web 端口",
                    value = state.remoteDshPort,
                    placeholder = "3080",
                    appearance = appearance,
                    keyboardType = KeyboardType.Number,
                    scrollState = scrollState,
                    onChange = { viewModel.onIntent(RemoteDshSettingsIntent.SetRemoteDshPort(it)) },
                )
            }
            ModelSectionNote(
                "SSH 指纹必须匹配才会连接，防止手机把私钥交给冒充的电脑。DSH Web 只需监听电脑本机 127.0.0.1。",
                appearance,
            )

            ModelSectionHeader("SSH 密钥", appearance, actions = {})
            ModelFieldGroup(appearance) {
                ModelField(
                    label = "私钥",
                    value = state.privateKeyDraft,
                    placeholder = if (state.privateKeyConfigured) "已安全保存；粘贴新私钥可替换" else "-----BEGIN OPENSSH PRIVATE KEY-----",
                    appearance = appearance,
                    scrollState = scrollState,
                    secureEntry = true,
                    secureEntryVisible = privateKeyVisible,
                    singleLine = !privateKeyVisible,
                    trailingIcon = AppIconPaths.Eye,
                    trailingContentDescription = if (privateKeyVisible) "隐藏私钥" else "显示私钥",
                    onTrailingClick = { privateKeyVisible = !privateKeyVisible },
                    onChange = { viewModel.onIntent(RemoteDshSettingsIntent.SetPrivateKey(it)) },
                )
                ModelField(
                    label = "私钥密码（可选）",
                    value = state.passphraseDraft,
                    placeholder = if (state.passphraseConfigured) "已安全保存；输入新密码可替换" else "未加密私钥可留空",
                    appearance = appearance,
                    scrollState = scrollState,
                    secureEntry = true,
                    secureEntryVisible = passphraseVisible,
                    trailingIcon = AppIconPaths.Eye,
                    trailingContentDescription = if (passphraseVisible) "隐藏私钥密码" else "显示私钥密码",
                    onTrailingClick = { passphraseVisible = !passphraseVisible },
                    onChange = { viewModel.onIntent(RemoteDshSettingsIntent.SetPassphrase(it)) },
                )
            }
            ModelSectionNote("私钥与密码使用 Android Keystore 加密保存，不会写入 DSH 配置。", appearance)

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (state.privateKeyConfigured) {
                    ModelActionButton(
                        text = "移除密钥",
                        icon = AppIconPaths.Trash,
                        appearance = appearance,
                        modifier = Modifier.weight(1f),
                    ) { viewModel.onIntent(RemoteDshSettingsIntent.ClearSecrets) }
                }
                ModelActionButton(
                    text = if (state.saving) "连接中" else if (state.enabled) "保存并连接" else "保存连接",
                    icon = AppIconPaths.Plug,
                    appearance = appearance,
                    modifier = Modifier.weight(1f),
                    primary = true,
                ) {
                    if (!state.saving) viewModel.onIntent(RemoteDshSettingsIntent.SaveAndConnect)
                }
            }

            ConnectionSummary(state, appearance, viewModel)

            if (state.enabled && state.connectionState is RemoteDshConnectionState.Connected) {
                RemoteDshCatalog(
                    state = state,
                    appearance = appearance,
                    onOpenSession = onOpenSession,
                    onBindSession = { viewModel.onIntent(RemoteDshSettingsIntent.BindSession(it)) },
                    onCreateSession = { createWorkspace = it },
                    onRenameSession = { renameSession = it },
                    onArchiveSession = { archiveSession = it },
                )
            }
            Spacer(Modifier.width(1.dp).padding(bottom = 20.dp))
        }
    }

    createWorkspace?.let { workspace ->
        SessionNameDialog(
            title = "在 ${workspace.title} 新建会话",
            initialValue = "ElecKoi 角色任务",
            confirmText = "新建并绑定",
            onDismiss = { createWorkspace = null },
            onConfirm = { title ->
                viewModel.onIntent(RemoteDshSettingsIntent.CreateSession(workspace.workspaceId, title))
                createWorkspace = null
            },
        )
    }
    renameSession?.let { session ->
        SessionNameDialog(
            title = "重命名电脑会话",
            initialValue = session.title,
            confirmText = "保存",
            onDismiss = { renameSession = null },
            onConfirm = { title ->
                viewModel.onIntent(RemoteDshSettingsIntent.RenameSession(session.sessionId, title))
                renameSession = null
            },
        )
    }
    archiveSession?.let { session ->
        AlertDialog(
            onDismissRequest = { archiveSession = null },
            title = { Text("移除“${session.title}”？") },
            text = { Text("会话会从 DSH 工作区列表隐藏，但电脑上的历史日志仍会保留。") },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.onIntent(RemoteDshSettingsIntent.ArchiveSession(session.sessionId))
                    archiveSession = null
                }) { Text("移除", color = ElecKoiDanger) }
            },
            dismissButton = {
                TextButton(onClick = { archiveSession = null }) { Text("取消") }
            },
        )
    }
}

@Composable
private fun ConnectionSummary(
    state: RemoteDshSettingsUiState,
    appearance: AppearanceTheme,
    viewModel: RemoteDshSettingsViewModel,
) {
    val status = when (val connection = state.connectionState) {
        RemoteDshConnectionState.Disabled -> if (state.enabled) "尚未连接" else "插件已关闭"
        RemoteDshConnectionState.Connecting -> "正在建立 SSH 隧道…"
        is RemoteDshConnectionState.Connected -> buildString {
            append("已连接 · DSH ")
            append(connection.host.version.ifBlank { "版本未知" })
            if (connection.host.cwd.isNotBlank()) append("\n${connection.host.cwd}")
        }
        is RemoteDshConnectionState.Failed -> "连接失败：${connection.message}"
    }
    val error = state.errorMessage
    Column(modifier = Modifier.padding(horizontal = 6.dp, vertical = 10.dp)) {
        Text(
            text = error.ifBlank { state.notice.ifBlank { status } },
            color = if (error.isNotBlank() || state.connectionState is RemoteDshConnectionState.Failed) {
                ElecKoiDanger
            } else {
                appearance.mobileMuted
            },
            fontSize = 12.sp,
            lineHeight = 18.sp,
        )
        if (state.connectionState is RemoteDshConnectionState.Connected) {
            Row(modifier = Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(
                    "刷新会话",
                    color = appearance.mobileBlue,
                    fontSize = 13.sp,
                    modifier = Modifier.noRippleClickable { viewModel.onIntent(RemoteDshSettingsIntent.Refresh) },
                )
                Text(
                    "断开",
                    color = appearance.mobileMuted,
                    fontSize = 13.sp,
                    modifier = Modifier.noRippleClickable { viewModel.onIntent(RemoteDshSettingsIntent.Disconnect) },
                )
            }
        }
    }
}

@Composable
private fun SessionNameDialog(
    title: String,
    initialValue: String,
    confirmText: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var value by remember(initialValue) { mutableStateOf(initialValue) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = { value = it.take(120) },
                label = { Text("会话名称") },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(onClick = { if (value.isNotBlank()) onConfirm(value.trim()) }) {
                Text(confirmText)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}
