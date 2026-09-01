package com.eleckoi.android.feature.settings.ui.update

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircleOutline
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.NewReleases
import androidx.compose.material.icons.rounded.NotificationsOff
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SystemUpdate
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.settings.ui.personalization.components.CompactSettingsScaffold
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsDestinationRow
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsDivider
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsRowTextStart
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsSection
import com.eleckoi.android.feature.settings.ui.personalization.components.SettingsToggleRow
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.PhosphorRegular

@Composable
fun AppUpdatePage(
    appearance: AppearanceTheme,
    installedVersion: String,
    latestVersion: String,
    releaseNotes: String,
    releasePageUrl: String,
    updateAvailable: Boolean,
    remindersEnabled: Boolean,
    checking: Boolean,
    checkedOnce: Boolean,
    errorMessage: String,
    onRefresh: () -> Unit,
    onRemindersEnabledChange: (Boolean) -> Unit,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    var notificationPermissionGranted by remember {
        mutableStateOf(
            Build.VERSION.SDK_INT < 33 ||
                context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        notificationPermissionGranted = granted
        onRemindersEnabledChange(granted)
        if (!granted) {
            Toast.makeText(context, "未取得通知权限，仍可在侧边栏手动检查更新", Toast.LENGTH_SHORT)
                .show()
        }
    }
    val errorColor = MaterialTheme.colorScheme.error
    val statusTitle = when {
        checking -> "正在检查更新"
        updateAvailable -> "发现新版本 $latestVersion"
        checkedOnce -> "已经是最新版本"
        else -> "尚未检查更新"
    }
    val statusSubtitle = when {
        checking -> "正在连接 GitHub Release"
        updateAvailable -> "当前版本 $installedVersion"
        checkedOnce -> "当前版本 $installedVersion"
        else -> "当前版本 $installedVersion"
    }
    val statusIcon = when {
        updateAvailable -> Icons.Rounded.ErrorOutline
        checkedOnce -> Icons.Rounded.CheckCircleOutline
        else -> Icons.Rounded.SystemUpdate
    }

    CompactSettingsScaffold(
        title = "应用更新",
        appearance = appearance,
        onBack = onBack,
    ) {
        SettingsSection(label = "版本", appearance = appearance) {
            SettingsDestinationRow(
                icon = statusIcon,
                title = statusTitle,
                subtitle = statusSubtitle,
                appearance = appearance,
                enabled = !checking,
                iconTint = if (updateAvailable) errorColor else appearance.mobileMuted,
                onClick = onRefresh,
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            SettingsDestinationRow(
                icon = Icons.Rounded.Refresh,
                title = if (checking) "检查中…" else "立即检查更新",
                subtitle = "通过 ElecKoi 的 GitHub Release 获取版本信息",
                appearance = appearance,
                enabled = !checking,
                onClick = onRefresh,
            )
        }

        if (errorMessage.isNotBlank()) {
            Text(
                text = errorMessage,
                color = errorColor,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }

        if (updateAvailable && releasePageUrl.isNotBlank()) {
            SettingsSection(label = "新版本", appearance = appearance) {
                SettingsDestinationRow(
                    icon = Icons.Rounded.NewReleases,
                    title = "前往 GitHub 下载 $latestVersion",
                    subtitle = "在 Release 页面查看说明和安装包",
                    appearance = appearance,
                    iconTint = errorColor,
                    onClick = {
                        val opened = runCatching {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, Uri.parse(releasePageUrl)),
                            )
                        }.isSuccess
                        if (!opened) {
                            Toast.makeText(context, "没有可打开下载页面的应用", Toast.LENGTH_SHORT)
                                .show()
                        }
                    },
                )
            }
            if (releaseNotes.isNotBlank()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 4.dp),
                ) {
                    Text(
                        text = "更新说明",
                        color = appearance.mobileText,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = releaseNotes.take(500),
                        color = appearance.mobileMuted,
                        fontSize = 13.sp,
                        lineHeight = 19.sp,
                        modifier = Modifier.padding(top = 7.dp),
                    )
                }
            }
        }

        SettingsSection(label = "提醒", appearance = appearance) {
            SettingsToggleRow(
                iconPath = PhosphorRegular.Bell,
                title = "新版本提醒",
                subtitle = "每天低频检查一次；关闭后停止后台检查和通知",
                checked = remindersEnabled,
                appearance = appearance,
                onCheckedChange = { enabled ->
                    if (
                        enabled &&
                        Build.VERSION.SDK_INT >= 33 &&
                        !notificationPermissionGranted
                    ) {
                        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        onRemindersEnabledChange(enabled)
                    }
                },
            )
            if (remindersEnabled && !notificationPermissionGranted) {
                SettingsDivider(appearance, startIndent = SettingsRowTextStart)
                SettingsDestinationRow(
                    icon = Icons.Rounded.NotificationsOff,
                    title = "允许系统通知",
                    subtitle = "当前只能显示 App 内更新提示",
                    appearance = appearance,
                    iconTint = errorColor,
                    onClick = {
                        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    },
                )
            }
        }
    }
}
