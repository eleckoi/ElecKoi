package com.eleckoi.android.feature.settings.ui.runtime

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Build
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationState
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.feature.settings.ui.personalization.components.CompactSettingsScaffold
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsDestinationRow
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsDivider
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsRowTextStart
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsSection

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

    Box(Modifier.fillMaxSize()) {
        CompactSettingsScaffold(
            title = "本地创作环境",
            appearance = appearance,
            onBack = onBack,
        ) {
            RuntimeStatusCard(
                state = state,
                appearance = appearance,
                onInstall = { viewModel.onIntent(LocalRuntimeSettingsIntent.Install) },
                onUpdate = { viewModel.onIntent(LocalRuntimeSettingsIntent.Update) },
                onRepair = { viewModel.onIntent(LocalRuntimeSettingsIntent.Repair) },
                onRefresh = { viewModel.onIntent(LocalRuntimeSettingsIntent.Refresh) },
                onCancel = { viewModel.onIntent(LocalRuntimeSettingsIntent.CancelMaintenance) },
                onRetry = { operation -> viewModel.onIntent(operation.intent) },
            )

            if (state.showsMaintenanceMenu) {
                SettingsSection(label = "维护", appearance = appearance) {
                    SettingsDestinationRow(
                        icon = Icons.Rounded.Refresh,
                        title = "重新检测",
                        subtitle = "再次检查组件与版本状态",
                        appearance = appearance,
                        onClick = { viewModel.onIntent(LocalRuntimeSettingsIntent.Refresh) },
                        iconTint = appearance.mobileBlue,
                    )
                    SettingsDivider(appearance, startIndent = SettingsRowTextStart)
                    SettingsDestinationRow(
                        icon = Icons.Rounded.Build,
                        title = "重新安装并修复",
                        subtitle = "保留工作区、聊天记录与会话状态",
                        appearance = appearance,
                        onClick = { viewModel.onIntent(LocalRuntimeSettingsIntent.Repair) },
                        iconTint = appearance.mobileBlue,
                    )
                    SettingsDivider(appearance, startIndent = SettingsRowTextStart)
                    SettingsDestinationRow(
                        icon = Icons.Rounded.DeleteOutline,
                        title = "卸载本地环境",
                        subtitle = "不会删除工作区、聊天记录或会话状态",
                        appearance = appearance,
                        onClick = { confirmUninstall = true },
                        iconTint = ElecKoiDanger,
                    )
                }
            }
        }
        SnackbarHost(
            hostState = snackbar,
            modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp).navigationBarsPadding(),
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

private val LocalRuntimeSettingsUiState.showsMaintenanceMenu: Boolean
    get() = maintenanceState is RuntimeInstallationState.Idle && capabilities?.health in setOf(
        LocalRuntimeHealth.Healthy,
        LocalRuntimeHealth.UpdateAvailable,
        LocalRuntimeHealth.NeedsRepair,
    )

private val RuntimeMaintenanceOperation.intent: LocalRuntimeSettingsIntent
    get() = when (this) {
        RuntimeMaintenanceOperation.Install -> LocalRuntimeSettingsIntent.Install
        RuntimeMaintenanceOperation.Update -> LocalRuntimeSettingsIntent.Update
        RuntimeMaintenanceOperation.Repair -> LocalRuntimeSettingsIntent.Repair
        RuntimeMaintenanceOperation.Uninstall -> LocalRuntimeSettingsIntent.Uninstall
    }
