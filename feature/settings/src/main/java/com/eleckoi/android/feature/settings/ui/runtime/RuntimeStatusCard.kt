package com.eleckoi.android.feature.settings.ui.runtime

import android.os.Build
import android.os.SystemClock
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.pm.PackageInfoCompat
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeCapabilities
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeState
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeStorageUsage
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationProgress
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationState
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon

@Composable
internal fun RuntimeStatusCard(
    state: LocalRuntimeSettingsUiState,
    appearance: AppearanceTheme,
    onInstall: () -> Unit,
    onUpdate: () -> Unit,
    onRepair: () -> Unit,
    onRefresh: () -> Unit,
    onCancel: () -> Unit,
    onRetry: (RuntimeMaintenanceOperation) -> Unit,
) {
    val capabilities = state.capabilities
    val maintenance = state.maintenanceState
    RuntimeStatusCardContainer(
        appearance = appearance,
        modifier = Modifier.heightIn(min = 284.dp),
    ) {
        when {
            maintenance is RuntimeInstallationState.Installing ->
                MaintenanceRunning(maintenance, state.maintenanceStartedAtMillis, appearance, onCancel)
            maintenance is RuntimeInstallationState.Failed ->
                MaintenanceFailed(maintenance, state.lastProgress, appearance, onRetry)
            capabilities?.health == LocalRuntimeHealth.Unsupported -> Unsupported(capabilities, appearance)
            capabilities?.health == LocalRuntimeHealth.NotInstalled -> NotInstalled(appearance, onInstall)
            capabilities?.health == LocalRuntimeHealth.Checking -> Checking(capabilities, appearance, onRefresh)
            capabilities?.health == LocalRuntimeHealth.UpdateAvailable -> UpdateAvailable(capabilities, appearance, onUpdate)
            capabilities?.health == LocalRuntimeHealth.NeedsRepair -> NeedsRepair(capabilities, appearance, onRepair)
            capabilities?.health == LocalRuntimeHealth.Healthy -> Healthy(capabilities, state, appearance)
            else -> Connecting(state.runtimeState, appearance, onRefresh)
        }
    }
}

@Composable
private fun ColumnScope.Healthy(
    capabilities: LocalRuntimeCapabilities,
    state: LocalRuntimeSettingsUiState,
    appearance: AppearanceTheme,
) {
    RuntimeCardHead(
        badge = { RuntimeCardBadge(AppIconPaths.Check, appearance.mobileBlue, appearance.mobileBlue.copy(alpha = 0.12f)) },
        title = LocalRuntimeHealth.Healthy.title,
        subtitle = capabilities.installedRuntimeVersion.orEmpty(),
        appearance = appearance,
        monospaceSubtitle = true,
    )
    RuntimeCardDivider(appearance, top = 13.dp, bottom = 12.dp)
    RuntimeReadingRow(
        label = "占用空间",
        value = if (state.storageUsage.measured) formatRuntimeBytes(state.storageUsage.totalBytes) else "正在统计",
        appearance = appearance,
    )
    RuntimeCapacityBar(state.storageUsage, appearance, Modifier.padding(top = 9.dp))
    if (state.storageUsage.measured) {
        RuntimeCapacityLegend(state.storageUsage, appearance, Modifier.padding(top = 11.dp))
    }
    Spacer(Modifier.weight(1f))
    RuntimeComponentChips(RuntimeComponentState.Verified, appearance)
}

@Composable
private fun ColumnScope.Unsupported(
    capabilities: LocalRuntimeCapabilities,
    appearance: AppearanceTheme,
) {
    RuntimeCardHead(
        badge = { RuntimeCardBadge(RuntimeGlyphs.Ban, appearance.mobileMuted, appearance.mobileSearchBg, 1.9f) },
        title = LocalRuntimeHealth.Unsupported.title,
        subtitle = "当前设备暂不支持本地创作环境",
        appearance = appearance,
    )
    Text(
        "变量等 Android 原生工具不依赖它，其余功能不受影响。",
        modifier = Modifier.padding(top = 13.dp),
        color = appearance.mobileMuted,
        fontSize = 12.5.sp,
        lineHeight = 19.sp,
    )
    RuntimeInsetPanel(
        appearance = appearance,
        modifier = Modifier.padding(top = 13.dp).weight(1f),
        verticalPadding = 12.dp,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        RuntimeFactRow("CPU 架构", capabilities.abi, appearance)
        RuntimeFactRow("要求", "arm64-v8a", appearance)
        RuntimeFactRow("系统版本", "Android ${Build.VERSION.RELEASE} · API ${Build.VERSION.SDK_INT}", appearance)
        RuntimeFactRow("应用版本", rememberAppVersion(), appearance)
    }
}

@Composable
private fun ColumnScope.NotInstalled(appearance: AppearanceTheme, onInstall: () -> Unit) {
    RuntimeCardHead(
        badge = { RuntimeCardBadge(RuntimeGlyphs.Download, appearance.mobileMuted, appearance.mobileSearchBg, 1.9f) },
        title = LocalRuntimeHealth.NotInstalled.title,
        subtitle = "AI 创作助手需要它才能动手",
        appearance = appearance,
    )
    Text(
        "安装包已随应用附带，无需联网下载，安装时至少预留约 1.5 GiB 空间。",
        modifier = Modifier.padding(top = 13.dp),
        color = appearance.mobileMuted,
        fontSize = 12.5.sp,
        lineHeight = 18.sp,
    )
    RuntimeComponentChips(RuntimeComponentState.Absent, appearance, Modifier.padding(top = 11.dp))
    RuntimeCapacityBar(LocalRuntimeStorageUsage.Unknown, appearance, Modifier.padding(top = 11.dp))
    Spacer(Modifier.weight(1f))
    RuntimePrimaryButton("安装到本机", appearance, onInstall)
}

@Composable
private fun ColumnScope.Checking(
    capabilities: LocalRuntimeCapabilities,
    appearance: AppearanceTheme,
    onRefresh: () -> Unit,
) {
    RuntimeCardHead(
        badge = { RuntimeProgressRing(null, appearance) },
        title = LocalRuntimeHealth.Checking.title,
        subtitle = capabilities.healthMessage ?: "等待健康检查",
        appearance = appearance,
        monospaceSubtitle = true,
    )
    ProbingBody(appearance, onRefresh)
}

@Composable
private fun ColumnScope.Connecting(
    runtimeState: LocalRuntimeState,
    appearance: AppearanceTheme,
    onRefresh: () -> Unit,
) {
    val failed = runtimeState as? LocalRuntimeState.Failed
    RuntimeCardHead(
        badge = {
            if (failed == null) RuntimeProgressRing(null, appearance)
            else RuntimeCardBadge(AppIconPaths.X, ElecKoiDanger, ElecKoiDanger.copy(alpha = 0.1f), 2f)
        },
        title = if (failed == null) "正在连接本地创作环境" else "连接本地创作环境失败",
        subtitle = failed?.message ?: "等待健康检查",
        appearance = appearance,
        monospaceSubtitle = true,
    )
    ProbingBody(appearance, onRefresh)
}

@Composable
private fun ColumnScope.ProbingBody(appearance: AppearanceTheme, onRefresh: () -> Unit) {
    RuntimeComponentChips(RuntimeComponentState.Pending, appearance, Modifier.padding(top = 15.dp))
    RuntimeCardDivider(appearance, top = 13.dp, bottom = 11.dp)
    RuntimeReadingRow("占用空间", "检测中", appearance, appearance.mobileSoft)
    RuntimeReadingRow("已安装版本", "检测中", appearance, appearance.mobileSoft, Modifier.padding(top = 8.dp))
    Spacer(Modifier.weight(1f))
    RuntimeQuietButton("重新检测", appearance, onRefresh)
}

@Composable
private fun ColumnScope.UpdateAvailable(
    capabilities: LocalRuntimeCapabilities,
    appearance: AppearanceTheme,
    onUpdate: () -> Unit,
) {
    RuntimeCardHead(
        badge = { RuntimeCardBadge(RuntimeGlyphs.Update, appearance.mobileBlue, appearance.mobileBlue.copy(alpha = 0.12f), 2f) },
        title = LocalRuntimeHealth.UpdateAvailable.title,
        subtitle = "当前版本仍可正常使用",
        appearance = appearance,
    )
    RuntimeInsetPanel(appearance, Modifier.padding(top = 15.dp)) {
        RuntimeVersionRow("已安装", capabilities.installedRuntimeVersion, appearance.mobileMuted, appearance)
        Row(
            modifier = Modifier.padding(top = 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            StrokeSvgIcon(RuntimeGlyphs.ArrowRight, appearance.mobileSoft, iconSize = 13.dp, strokeWidth = 1.8f)
            RuntimeVersionRow("目录版本", capabilities.availableRuntimeVersion, appearance.mobileBlue, appearance)
        }
    }
    Text(UpdateScopeNote, Modifier.padding(top = 12.dp), appearance.mobileMuted, 12.sp, lineHeight = 18.sp)
    Spacer(Modifier.weight(1f))
    RuntimePrimaryButton("更新本地环境", appearance, onUpdate)
}

@Composable
private fun ColumnScope.NeedsRepair(
    capabilities: LocalRuntimeCapabilities,
    appearance: AppearanceTheme,
    onRepair: () -> Unit,
) {
    RuntimeCardHead(
        badge = { RuntimeCardBadge(RuntimeGlyphs.Alert, ElecKoiDanger, ElecKoiDanger.copy(alpha = 0.1f), 2f) },
        title = LocalRuntimeHealth.NeedsRepair.title,
        subtitle = "Agent 现在无法启动",
        appearance = appearance,
    )
    val message = capabilities.healthMessage?.takeIf(String::isNotBlank)
    if (message == null) {
        RuntimeComponentChips(RuntimeComponentState.Pending, appearance, Modifier.padding(top = 15.dp))
    } else {
        RuntimeInsetPanel(appearance, Modifier.padding(top = 15.dp)) {
            Text(
                message,
                color = appearance.mobileMuted,
                fontSize = 11.5.sp,
                lineHeight = 17.sp,
                fontFamily = FontFamily.Monospace,
                maxLines = 4,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
    Text(RepairScopeNote, Modifier.padding(top = 14.dp), appearance.mobileMuted, 12.sp, lineHeight = 18.sp)
    Spacer(Modifier.weight(1f))
    RuntimePrimaryButton("修复本地环境", appearance, onRepair)
}

@Composable
private fun ColumnScope.MaintenanceRunning(
    installing: RuntimeInstallationState.Installing,
    startedAtMillis: Long?,
    appearance: AppearanceTheme,
    onCancel: () -> Unit,
) {
    val progress = installing.progress
    val operation = installing.operation
    val fraction = maintenanceFraction(progress, operation)
    val phases = maintenancePhases(operation)
    val step = maintenanceStepNumber(progress, operation)
    val remaining = startedAtMillis?.let {
        maintenanceRemainingMinutes(SystemClock.elapsedRealtime() - it, fraction)
    }
    Row(verticalAlignment = Alignment.CenterVertically) {
        RuntimeProgressRing(fraction, appearance)
        Spacer(Modifier.width(13.dp))
        RuntimeCardHeading(
            title = maintenanceStageLabel(progress),
            subtitle = listOfNotNull("第 $step / ${phases.size} 步", remaining?.let { "剩余约 $it 分钟" }).joinToString(" · "),
            appearance = appearance,
            modifier = Modifier.weight(1f),
            monospaceSubtitle = true,
        )
        Text("${maintenancePercent(fraction)}%", color = appearance.mobileBlue, fontSize = 12.5.sp, fontFamily = FontFamily.Monospace)
    }
    RuntimeProgressTrack(fraction, appearance.mobileBlue, appearance, Modifier.padding(top = 16.dp))
    RuntimeMaintenanceSteps(
        phases = phases,
        currentIndex = phases.indexOf(maintenancePhaseOf(progress.stage, operation)),
        currentMark = RuntimeStepMark.Current,
        appearance = appearance,
        modifier = Modifier.padding(top = 12.dp),
    )
    Spacer(Modifier.weight(1f))
    RuntimeQuietButton("取消维护", appearance, onCancel)
}

@Composable
private fun ColumnScope.MaintenanceFailed(
    failed: RuntimeInstallationState.Failed,
    lastProgress: RuntimeInstallationProgress?,
    appearance: AppearanceTheme,
    onRetry: (RuntimeMaintenanceOperation) -> Unit,
) {
    val operation = failed.operation ?: RuntimeMaintenanceOperation.Install
    val fraction = lastProgress?.let { maintenanceFraction(it, operation) } ?: 0f
    RuntimeCardHead(
        badge = { RuntimeCardBadge(AppIconPaths.X, ElecKoiDanger, ElecKoiDanger.copy(alpha = 0.1f), 2f) },
        title = when (operation) {
            RuntimeMaintenanceOperation.Uninstall -> "卸载未完成"
            RuntimeMaintenanceOperation.Repair -> "修复未完成"
            RuntimeMaintenanceOperation.Update -> "更新未完成"
            RuntimeMaintenanceOperation.Install -> "安装未完成"
        },
        subtitle = failed.message,
        appearance = appearance,
        monospaceSubtitle = true,
    )
    RuntimeProgressTrack(fraction, ElecKoiDanger, appearance, Modifier.padding(top = 16.dp))
    lastProgress?.let { progress ->
        val phases = maintenancePhases(operation)
        RuntimeMaintenanceSteps(
            phases,
            phases.indexOf(maintenancePhaseOf(progress.stage, operation)),
            RuntimeStepMark.Failed,
            appearance,
            Modifier.padding(top = 12.dp),
        )
    }
    Text(
        if (operation == RuntimeMaintenanceOperation.Uninstall) "工作区、聊天记录与会话状态不受影响，可以再试一次。"
        else "已完成的部署阶段会保留，重试从中断处继续。",
        modifier = Modifier.padding(top = 12.dp),
        color = appearance.mobileMuted,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    )
    Spacer(Modifier.weight(1f))
    RuntimePrimaryButton(
        label = if (operation == RuntimeMaintenanceOperation.Uninstall) "重试卸载" else "重试${operation.label}",
        appearance = appearance,
        onClick = { onRetry(operation) },
    )
}

@Composable
private fun RuntimeCardHead(
    badge: @Composable () -> Unit,
    title: String,
    subtitle: String,
    appearance: AppearanceTheme,
    monospaceSubtitle: Boolean = false,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        badge()
        Spacer(Modifier.width(13.dp))
        RuntimeCardHeading(title, subtitle, appearance, Modifier.weight(1f), monospaceSubtitle)
    }
}

@Composable
private fun RuntimeVersionRow(
    label: String,
    version: String?,
    color: Color,
    appearance: AppearanceTheme,
) {
    Column {
        Text(label, color = appearance.mobileSoft, fontSize = 10.5.sp, fontFamily = FontFamily.Monospace)
        Text(
            version ?: "未知",
            modifier = Modifier.padding(top = 3.dp),
            color = color,
            fontSize = 11.5.sp,
            lineHeight = 16.sp,
            fontFamily = FontFamily.Monospace,
        )
    }
}

@Composable
private fun rememberAppVersion(): String {
    val context = LocalContext.current
    return remember(context) {
        val info = runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull()
        val name = info?.versionName
        if (name.isNullOrBlank()) "未知" else "$name (${PackageInfoCompat.getLongVersionCode(info)})"
    }
}

private val RuntimeMaintenanceOperation.label: String
    get() = when (this) {
        RuntimeMaintenanceOperation.Install -> "安装"
        RuntimeMaintenanceOperation.Update -> "更新"
        RuntimeMaintenanceOperation.Repair -> "修复"
        RuntimeMaintenanceOperation.Uninstall -> "卸载"
    }

private object RuntimeGlyphs {
    val Ban = listOf("M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8Z", "m6.6 17.4 10.8-10.8")
    val Download = listOf(
        "M12 3.8v9.6M8.4 10.2 12 13.8l3.6-3.6",
        "M4.6 15.6v3a1.8 1.8 0 0 0 1.8 1.8h11.2a1.8 1.8 0 0 0 1.8-1.8v-3",
    )
    val Update = listOf("M19.4 12a7.4 7.4 0 1 1-2.2-5.2", "M19.6 4.6v3.8h-3.8")
    val Alert = listOf("M12 7.6v5.2", "M12 16.6h.01", "M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2Z")
    val ArrowRight = listOf("M4.5 12h14M13.5 7l5 5-5 5")
}

private const val UpdateScopeNote = "更新会替换 rootfs 与 Harness，不会删除工作区、聊天记录或 Harness 会话状态。"
private const val RepairScopeNote = "修复会重新校验并解压内置组件，不会删除工作区、聊天记录或 Harness 会话状态。"
