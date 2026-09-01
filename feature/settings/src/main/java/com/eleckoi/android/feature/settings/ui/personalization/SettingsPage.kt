package com.eleckoi.android.feature.settings.ui.personalization

import com.eleckoi.android.feature.settings.ui.personalization.components.*

import com.eleckoi.android.foundation.design.components.noRippleClickable
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.provider.Settings as AndroidSettings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.eleckoi.android.foundation.diagnostics.CrashDiagnostics
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.PhosphorRegular
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun SettingsPage(
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onOpenUserProfile: () -> Unit,
    onOpenThemeStyle: () -> Unit,
    onOpenChatDisplay: () -> Unit,
    onOpenCommonPages: () -> Unit,
    onOpenFont: () -> Unit,
    onOpenAbout: () -> Unit,
    onOpenLocalRuntime: () -> Unit,
    onOpenAppUpdate: () -> Unit,
    appUpdateAvailable: Boolean,
    appUpdateLatestVersion: String,
    appUpdateChecking: Boolean,
    appUpdateCheckedOnce: Boolean,
    agentBackgroundProtectionEnabled: Boolean,
    onAgentBackgroundProtectionEnabledChange: (Boolean) -> Unit,
    onAgentBackgroundProtectionPermissionChanged: () -> Unit,
    backupBusy: Boolean = false,
    onExportBackup: () -> Unit = {},
    onImportBackup: () -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var overlayPermissionGranted by remember {
        mutableStateOf(AndroidSettings.canDrawOverlays(context))
    }
    var notificationsEnabled by remember {
        mutableStateOf(
            context.getSystemService(NotificationManager::class.java).areNotificationsEnabled(),
        )
    }
    var showPermissionExplanation by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    var pendingCrashReport by remember { mutableStateOf<String?>(null) }
    var preparingCrashReport by remember { mutableStateOf(false) }
    val crashReportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("text/plain"),
    ) { uri ->
        val report = pendingCrashReport
        pendingCrashReport = null
        if (uri != null && report != null) {
            scope.launch {
                val result = withContext(Dispatchers.IO) {
                    runCatching {
                        context.contentResolver.openOutputStream(uri, "wt")?.bufferedWriter()?.use {
                            it.write(report)
                        } ?: error("无法打开保存位置")
                    }
                }
                Toast.makeText(
                    context,
                    if (result.isSuccess) "崩溃日志已保存" else "保存失败：${result.exceptionOrNull()?.message.orEmpty()}",
                    Toast.LENGTH_LONG,
                ).show()
            }
        }
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) {
        overlayPermissionGranted = AndroidSettings.canDrawOverlays(context)
        onAgentBackgroundProtectionEnabledChange(overlayPermissionGranted)
        onAgentBackgroundProtectionPermissionChanged()
    }

    DisposableEffect(lifecycleOwner, context) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                overlayPermissionGranted = AndroidSettings.canDrawOverlays(context)
                notificationsEnabled = context
                    .getSystemService(NotificationManager::class.java)
                    .areNotificationsEnabled()
                onAgentBackgroundProtectionPermissionChanged()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val protectionSubtitle = when {
        agentBackgroundProtectionEnabled && !overlayPermissionGranted ->
            "需要授予悬浮窗权限才能生效"
        agentBackgroundProtectionEnabled -> "仅在 AI 生成或 Agent 执行时启用"
        else -> "防止部分国产系统冻结后台 Agent"
    }

    CompactSettingsScaffold(
        title = "设置",
        appearance = appearance,
        onBack = onBack,
    ) {
        SettingsSection(label = "个性化", appearance = appearance) {
            SettingsDestinationRow(
                iconPath = PhosphorRegular.UserCircle,
                title = "用户资料",
                appearance = appearance,
                onClick = onOpenUserProfile,
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            SettingsDestinationRow(
                iconPath = PhosphorRegular.Palette,
                title = "主题风格",
                appearance = appearance,
                onClick = onOpenThemeStyle,
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            SettingsDestinationRow(
                iconPath = PhosphorRegular.ChatCircle,
                title = "聊天显示",
                appearance = appearance,
                onClick = onOpenChatDisplay,
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            SettingsDestinationRow(
                iconPath = PhosphorRegular.Plus,
                title = "常用页面",
                appearance = appearance,
                onClick = onOpenCommonPages,
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            SettingsDestinationRow(
                iconPath = PhosphorRegular.TextAa,
                title = "字体",
                appearance = appearance,
                onClick = onOpenFont,
            )
        }
        SettingsSection(label = "后台运行", appearance = appearance) {
            SettingsDestinationRow(
                iconPath = PhosphorRegular.Bell,
                title = "系统通知",
                subtitle = if (notificationsEnabled) {
                    "已开启 · 显示生成状态和完成通知"
                } else {
                    "已关闭 · 点此到系统设置开启"
                },
                appearance = appearance,
                onClick = {
                    context.startActivity(
                        Intent(AndroidSettings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(AndroidSettings.EXTRA_APP_PACKAGE, context.packageName),
                    )
                },
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            SettingsToggleRow(
                iconPath = PhosphorRegular.Cpu,
                title = "增强后台运行",
                subtitle = protectionSubtitle,
                checked = agentBackgroundProtectionEnabled,
                appearance = appearance,
                onCheckedChange = { enabled ->
                    onAgentBackgroundProtectionEnabledChange(enabled)
                    if (enabled && !overlayPermissionGranted) {
                        showPermissionExplanation = true
                    }
                },
            )
        }
        SettingsSection(label = "故障诊断", appearance = appearance) {
            SettingsDestinationRow(
                iconPath = PhosphorRegular.DownloadSimple,
                title = if (preparingCrashReport) "正在整理崩溃日志" else "导出崩溃日志",
                subtitle = "包含闪退、ANR、低内存、本地环境安装和最近生成阶段；不含聊天正文与密钥",
                appearance = appearance,
                onClick = {
                    if (!preparingCrashReport) {
                        preparingCrashReport = true
                        scope.launch {
                            val report = withContext(Dispatchers.IO) {
                                CrashDiagnostics.buildReport(context)
                            }
                            pendingCrashReport = report
                            preparingCrashReport = false
                            crashReportLauncher.launch(CrashDiagnostics.suggestedFileName())
                        }
                    }
                },
            )
        }
        SettingsSection(label = "数据", appearance = appearance) {
            SettingsDestinationRow(
                iconPath = PhosphorRegular.UploadSimple,
                title = "导出数据备份",
                subtitle = "角色、预设、聊天、偏好和模型",
                appearance = appearance,
                onClick = onExportBackup,
                enabled = !backupBusy,
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            SettingsDestinationRow(
                iconPath = PhosphorRegular.DownloadSimple,
                title = "导入数据备份",
                subtitle = "用于干净安装后的恢复",
                appearance = appearance,
                onClick = onImportBackup,
                enabled = !backupBusy,
            )
        }
        SettingsSection(label = "开发与更新", appearance = appearance) {
            SettingsDestinationRow(
                iconPath = PhosphorRegular.Cpu,
                title = "本地创作环境",
                subtitle = "Ubuntu · Agent Harness",
                appearance = appearance,
                onClick = onOpenLocalRuntime,
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            SettingsDestinationRow(
                icon = if (appUpdateAvailable) {
                    Icons.Rounded.ErrorOutline
                } else {
                    Icons.Rounded.SystemUpdate
                },
                title = "应用更新",
                subtitle = when {
                    appUpdateChecking -> "正在检查 GitHub Release"
                    appUpdateAvailable -> "发现新版本 $appUpdateLatestVersion"
                    appUpdateCheckedOnce -> "当前已是最新版本"
                    else -> "检查新版本与更新提醒"
                },
                appearance = appearance,
                iconTint = if (appUpdateAvailable) {
                    MaterialTheme.colorScheme.error
                } else {
                    appearance.mobileMuted
                },
                onClick = onOpenAppUpdate,
            )
        }
        SettingsSection(label = "关于", appearance = appearance) {
            SettingsDestinationRow(
                icon = Icons.Rounded.Info,
                title = "关于电子爱",
                subtitle = "版本与 GitHub",
                appearance = appearance,
                onClick = onOpenAbout,
            )
        }
    }

    if (showPermissionExplanation) {
        AlertDialog(
            onDismissRequest = {
                showPermissionExplanation = false
                onAgentBackgroundProtectionEnabledChange(false)
            },
            containerColor = appearance.mobileSurface,
            title = {
                Text(
                    "允许增强后台运行？",
                    color = appearance.mobileText,
                    fontSize = 17.sp,
                )
            },
            text = {
                Text(
                    "部分国产系统会冻结后台 Agent。开启后，ElecKoi 只在 AI 生成或 " +
                        "Agent 执行期间创建一个不可见的 1×1 悬浮层，任务结束后立即移除。",
                    color = appearance.mobileMuted,
                    fontSize = 14.sp,
                    lineHeight = 20.sp,
                )
            },
            confirmButton = {
                Text(
                    "继续设置",
                    color = appearance.mobileBlue,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier
                        .noRippleClickable {
                            showPermissionExplanation = false
                            permissionLauncher.launch(
                                Intent(
                                    AndroidSettings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    Uri.parse("package:${context.packageName}"),
                                ),
                            )
                        }
                        .padding(12.dp),
                )
            },
            dismissButton = {
                Text(
                    "取消",
                    color = appearance.mobileMuted,
                    fontSize = 15.sp,
                    modifier = Modifier
                        .noRippleClickable {
                            showPermissionExplanation = false
                            onAgentBackgroundProtectionEnabledChange(false)
                        }
                        .padding(12.dp),
                )
            },
        )
    }
}
