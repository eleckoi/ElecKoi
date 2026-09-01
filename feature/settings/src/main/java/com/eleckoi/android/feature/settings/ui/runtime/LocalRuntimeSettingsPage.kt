package com.eleckoi.android.feature.settings.ui.runtime

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.ElecKoiSuccess
import com.eleckoi.android.foundation.design.PhosphorRegular
import com.eleckoi.android.foundation.design.components.FilledSvgIcon
import com.eleckoi.android.feature.settings.ui.personalization.components.CompactSettingsScaffold
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsSection
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationProgress
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationStage
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationState

@Composable
fun LocalRuntimeSettingsPage(
    appearance: AppearanceTheme,
    viewModel: LocalRuntimeSettingsViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var confirmUninstall by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.onIntent(LocalRuntimeSettingsIntent.Connect) }
    LaunchedEffect(state.notice, state.errorMessage) {
        val message = state.errorMessage.ifBlank { state.notice }
        if (message.isNotBlank()) {
            snackbar.showSnackbar(message)
            viewModel.onIntent(LocalRuntimeSettingsIntent.DismissMessage)
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        CompactSettingsScaffold(
            title = "本地创作环境",
            appearance = appearance,
            onBack = onBack,
            scrollable = false,
        ) {
            SettingsSection(label = "运行状态", appearance = appearance) {
                RuntimeHealthContent(state, appearance)
            }
            SettingsSection(label = "环境组件", appearance = appearance) {
                RuntimeComponentsContent(appearance)
            }
            SettingsSection(label = "维护", appearance = appearance) {
                RuntimeMaintenanceActions(
                    state = state,
                    appearance = appearance,
                    onInstall = { viewModel.onIntent(LocalRuntimeSettingsIntent.Install) },
                    onUpdate = { viewModel.onIntent(LocalRuntimeSettingsIntent.Update) },
                    onRepair = { viewModel.onIntent(LocalRuntimeSettingsIntent.Repair) },
                    onRefresh = { viewModel.onIntent(LocalRuntimeSettingsIntent.Refresh) },
                    onUninstall = { confirmUninstall = true },
                    onCancel = { viewModel.onIntent(LocalRuntimeSettingsIntent.CancelMaintenance) },
                )
            }
        }
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(16.dp)
                .navigationBarsPadding(),
        )
    }

    if (confirmUninstall) {
        AlertDialog(
            onDismissRequest = { confirmUninstall = false },
            title = { Text("卸载本地创作环境") },
            text = { Text("将删除 Ubuntu 和已安装的 Agent Harness；不会删除工作区、聊天记录或 Harness 会话状态。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmUninstall = false
                        viewModel.onIntent(LocalRuntimeSettingsIntent.Uninstall)
                    },
                ) { Text("卸载", color = ElecKoiDanger) }
            },
            dismissButton = { TextButton(onClick = { confirmUninstall = false }) { Text("取消") } },
            containerColor = appearance.mobileSurface,
            titleContentColor = appearance.mobileText,
            textContentColor = appearance.mobileMuted,
        )
    }
}

@Composable
private fun RuntimeHealthContent(state: LocalRuntimeSettingsUiState, appearance: AppearanceTheme) {
    val capabilities = state.capabilities
    val installing = state.maintenanceState as? RuntimeInstallationState.Installing
    val healthy = capabilities?.health == LocalRuntimeHealth.Healthy ||
        capabilities?.health == LocalRuntimeHealth.UpdateAvailable
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            FilledSvgIcon(
                paths = listOf(if (healthy) PhosphorRegular.CheckCircle else PhosphorRegular.XCircle),
                color = if (healthy) ElecKoiSuccess else appearance.mobileMuted,
                iconSize = 23.dp,
                viewportSize = 256f,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    installing?.let { progressLabel(it.progress) }
                        ?: capabilities?.health?.title
                        ?: "正在连接本地运行时",
                    color = appearance.mobileText,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 16.sp,
                )
                Text(
                    (state.maintenanceState as? RuntimeInstallationState.Failed)?.message
                        ?: capabilities?.healthMessage
                        ?: "等待健康检查",
                    color = appearance.mobileMuted,
                    fontSize = 12.sp,
                    lineHeight = 18.sp,
                )
            }
            if (installing != null || capabilities?.health == LocalRuntimeHealth.Checking) {
                CircularProgressIndicator(
                    modifier = Modifier.size(22.dp),
                    strokeWidth = 2.dp,
                    color = appearance.mobileBlue,
                )
            }
        }
        capabilities?.installedRuntimeVersion?.let { version ->
            Text("已安装：$version", color = appearance.mobileMuted, fontSize = 11.sp)
        }
        capabilities?.availableRuntimeVersion?.let { version ->
            Text("目录版本：$version", color = appearance.mobileMuted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun RuntimeComponentsContent(appearance: AppearanceTheme) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            FilledSvgIcon(
                paths = listOf(PhosphorRegular.Cpu),
                color = appearance.mobileBlue,
                iconSize = 22.dp,
                viewportSize = 256f,
            )
            Text("运行时组件", color = appearance.mobileText, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        }
        Text(
            "Ubuntu 24.04 · DeepSeek Harness · Git · curl · ripgrep",
            color = appearance.mobileMuted,
            fontSize = 12.sp,
            lineHeight = 19.sp,
        )
        Text(
            "首次安装需要较大下载，并至少预留约 1.5 GiB 空间。",
            color = appearance.mobileMuted,
            fontSize = 11.sp,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(ElecKoiDanger.copy(alpha = 0.08f), MaterialTheme.shapes.small)
                .padding(10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            FilledSvgIcon(
                paths = listOf(PhosphorRegular.XCircle),
                color = ElecKoiDanger,
                iconSize = 17.dp,
                viewportSize = 256f,
            )
            Text(
                "开发预览：PRoot 用于兼容与故障隔离，不是安全沙盒。请只让 Agent 操作你信任的工作区。",
                color = ElecKoiDanger,
                fontSize = 11.sp,
                lineHeight = 17.sp,
            )
        }
    }
}

@Composable
private fun RuntimeMaintenanceActions(
    state: LocalRuntimeSettingsUiState,
    appearance: AppearanceTheme,
    onInstall: () -> Unit,
    onUpdate: () -> Unit,
    onRepair: () -> Unit,
    onRefresh: () -> Unit,
    onUninstall: () -> Unit,
    onCancel: () -> Unit,
) {
    val installing = state.maintenanceState is RuntimeInstallationState.Installing
    val health = state.capabilities?.health
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        when {
            installing -> Button(
                onClick = onCancel,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = appearance.mobileMuted.copy(alpha = 0.18f), contentColor = appearance.mobileText),
            ) { Text("取消维护") }
            health == LocalRuntimeHealth.NotInstalled -> PrimaryRuntimeButton("安装到本机", appearance, onInstall)
            health == LocalRuntimeHealth.UpdateAvailable -> PrimaryRuntimeButton("更新本地环境", appearance, onUpdate)
            health == LocalRuntimeHealth.NeedsRepair -> PrimaryRuntimeButton("修复本地环境", appearance, onRepair)
            health == LocalRuntimeHealth.Checking -> PrimaryRuntimeButton("重新检测", appearance, onRefresh)
            health == LocalRuntimeHealth.Healthy -> {
                PrimaryRuntimeButton("重新检测", appearance, onRefresh)
                OutlinedButton(
                    onClick = onRepair,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) {
                    Text("重新安装并修复")
                }
                OutlinedButton(
                    onClick = onUninstall,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    border = BorderStroke(1.dp, ElecKoiDanger.copy(alpha = 0.55f)),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = ElecKoiDanger),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.DeleteOutline,
                        contentDescription = null,
                        tint = ElecKoiDanger,
                        modifier = Modifier.size(18.dp),
                    )
                    Text("卸载本地环境", modifier = Modifier.padding(start = 8.dp))
                }
            }
        }
    }
}

@Composable
private fun PrimaryRuntimeButton(label: String, appearance: AppearanceTheme, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(48.dp),
        colors = ButtonDefaults.buttonColors(containerColor = appearance.mobileBlue),
    ) {
        Text(label, fontWeight = FontWeight.Medium)
    }
}

private val LocalRuntimeHealth.title: String
    get() = when (this) {
        LocalRuntimeHealth.Unsupported -> "当前设备不受支持"
        LocalRuntimeHealth.NotInstalled -> "尚未安装"
        LocalRuntimeHealth.Checking -> "正在进行真实健康检查"
        LocalRuntimeHealth.Healthy -> "本地创作环境运行正常"
        LocalRuntimeHealth.UpdateAvailable -> "本地创作环境可更新"
        LocalRuntimeHealth.NeedsRepair -> "本地创作环境需要修复"
    }

private fun progressLabel(progress: RuntimeInstallationProgress): String = when (progress.stage) {
    RuntimeInstallationStage.Checking -> "正在检查存储空间"
    RuntimeInstallationStage.DownloadingRootfs -> "正在下载 Ubuntu"
    RuntimeInstallationStage.DownloadingHarness -> "正在校验 ${progress.componentId.harnessDisplayName()}"
    RuntimeInstallationStage.DownloadingNode -> "正在下载 Node.js"
    RuntimeInstallationStage.DownloadingPnpm -> "正在下载 pnpm"
    RuntimeInstallationStage.ExtractingRootfs -> "正在部署 Ubuntu"
    RuntimeInstallationStage.ExtractingHarness -> "正在部署 ${progress.componentId.harnessDisplayName()}"
    RuntimeInstallationStage.ExtractingNode -> "正在部署 Node.js"
    RuntimeInstallationStage.ExtractingPnpm -> "正在部署 pnpm"
    RuntimeInstallationStage.ProvisioningPackages -> "正在安装 Python、Git 与网络工具"
    RuntimeInstallationStage.Verifying -> "正在验证所有命令"
    RuntimeInstallationStage.Activating -> "正在安全切换新环境"
    RuntimeInstallationStage.Removing -> "正在卸载"
    RuntimeInstallationStage.Cleaning -> "正在清理旧版本与缓存"
}

private fun String?.harnessDisplayName(): String = when (this) {
    "deepseek" -> "DeepSeek Harness"
    null -> "Agent Harness"
    else -> this
}
