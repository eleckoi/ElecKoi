package com.eleckoi.android.feature.settings.ui.runtime

import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationProgress
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationStage
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.roundToInt

internal enum class RuntimeMaintenancePhase(val label: String) {
    CheckSpace("检查存储空间"),
    VerifyBundles("校验内置包"),
    Deploy("部署 Ubuntu 与 Harness"),
    Activate("验证并启用"),
    CheckInstallation("检查现有安装"),
    Remove("移除运行时文件"),
    CleanUp("清理残留"),
}

internal fun maintenancePhases(operation: RuntimeMaintenanceOperation): List<RuntimeMaintenancePhase> =
    if (operation == RuntimeMaintenanceOperation.Uninstall) {
        listOf(
            RuntimeMaintenancePhase.CheckInstallation,
            RuntimeMaintenancePhase.Remove,
            RuntimeMaintenancePhase.CleanUp,
        )
    } else {
        listOf(
            RuntimeMaintenancePhase.CheckSpace,
            RuntimeMaintenancePhase.VerifyBundles,
            RuntimeMaintenancePhase.Deploy,
            RuntimeMaintenancePhase.Activate,
        )
    }

internal fun maintenancePhaseOf(
    stage: RuntimeInstallationStage,
    operation: RuntimeMaintenanceOperation,
): RuntimeMaintenancePhase = if (operation == RuntimeMaintenanceOperation.Uninstall) {
    when (stage) {
        RuntimeInstallationStage.Removing -> RuntimeMaintenancePhase.Remove
        RuntimeInstallationStage.Cleaning -> RuntimeMaintenancePhase.CleanUp
        else -> RuntimeMaintenancePhase.CheckInstallation
    }
} else {
    when (stage) {
        RuntimeInstallationStage.Checking -> RuntimeMaintenancePhase.CheckSpace
        RuntimeInstallationStage.DownloadingRootfs,
        RuntimeInstallationStage.DownloadingHarness,
        RuntimeInstallationStage.DownloadingNode,
        RuntimeInstallationStage.DownloadingPnpm,
        -> RuntimeMaintenancePhase.VerifyBundles
        RuntimeInstallationStage.ExtractingRootfs,
        RuntimeInstallationStage.ExtractingHarness,
        RuntimeInstallationStage.ExtractingNode,
        RuntimeInstallationStage.ExtractingPnpm,
        RuntimeInstallationStage.ProvisioningPackages,
        -> RuntimeMaintenancePhase.Deploy
        RuntimeInstallationStage.Verifying,
        RuntimeInstallationStage.Activating,
        RuntimeInstallationStage.Cleaning,
        RuntimeInstallationStage.Removing,
        -> RuntimeMaintenancePhase.Activate
    }
}

internal fun maintenanceStepNumber(
    progress: RuntimeInstallationProgress,
    operation: RuntimeMaintenanceOperation,
): Int = maintenancePhases(operation).indexOf(maintenancePhaseOf(progress.stage, operation)) + 1

internal fun maintenanceFraction(
    progress: RuntimeInstallationProgress,
    operation: RuntimeMaintenanceOperation,
): Float {
    val phases = maintenancePhases(operation)
    val index = phases.indexOf(maintenancePhaseOf(progress.stage, operation)).coerceAtLeast(0)
    val total = progress.totalBytes ?: 0L
    val within = if (total > 0L) {
        (progress.completedBytes.toFloat() / total.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    return ((index + within) / phases.size).coerceIn(0f, 1f)
}

internal fun maintenancePercent(fraction: Float): Int =
    (fraction * 100f).roundToInt().coerceIn(0, 99)

internal fun maintenanceRemainingMinutes(elapsedMillis: Long, fraction: Float): Int? {
    if (elapsedMillis <= 0L || fraction < 0.12f || fraction >= 1f) return null
    val minutes = ceil(elapsedMillis * (1f - fraction) / fraction / 60_000f).toInt()
    return minutes.takeIf { it in 1..60 }
}

internal val LocalRuntimeHealth.title: String
    get() = when (this) {
        LocalRuntimeHealth.Unsupported -> "当前设备不受支持"
        LocalRuntimeHealth.NotInstalled -> "尚未安装"
        LocalRuntimeHealth.Checking -> "正在检查本地创作环境"
        LocalRuntimeHealth.Healthy -> "本地创作环境运行正常"
        LocalRuntimeHealth.UpdateAvailable -> "本地创作环境可更新"
        LocalRuntimeHealth.NeedsRepair -> "本地创作环境需要修复"
    }

internal fun maintenanceStageLabel(progress: RuntimeInstallationProgress): String = when (progress.stage) {
    RuntimeInstallationStage.Checking -> "正在检查存储空间"
    RuntimeInstallationStage.DownloadingRootfs -> "正在校验 Ubuntu"
    RuntimeInstallationStage.DownloadingHarness -> "正在校验 ${progress.componentId.harnessDisplayName()}"
    RuntimeInstallationStage.DownloadingNode -> "正在校验 Node.js"
    RuntimeInstallationStage.DownloadingPnpm -> "正在校验 pnpm"
    RuntimeInstallationStage.ExtractingRootfs -> "正在部署 Ubuntu"
    RuntimeInstallationStage.ExtractingHarness -> "正在部署 ${progress.componentId.harnessDisplayName()}"
    RuntimeInstallationStage.ExtractingNode -> "正在部署 Node.js"
    RuntimeInstallationStage.ExtractingPnpm -> "正在部署 pnpm"
    RuntimeInstallationStage.ProvisioningPackages -> "正在安装开发工具"
    RuntimeInstallationStage.Verifying -> "正在验证所有命令"
    RuntimeInstallationStage.Activating -> "正在安全切换新环境"
    RuntimeInstallationStage.Removing -> "正在卸载"
    RuntimeInstallationStage.Cleaning -> "正在清理旧版本与缓存"
}

internal fun String?.harnessDisplayName(): String = when (this) {
    "deepseek" -> "DeepSeek Harness"
    null -> "Agent Harness"
    else -> this
}

internal fun formatRuntimeBytes(bytes: Long): String = when {
    bytes <= 0L -> "0 MiB"
    bytes >= Gibibyte -> String.format(Locale.US, "%.2f GiB", bytes.toDouble() / Gibibyte)
    bytes >= Mebibyte -> "${(bytes + Mebibyte / 2) / Mebibyte} MiB"
    else -> "${(bytes + Kibibyte - 1) / Kibibyte} KiB"
}

private const val Kibibyte = 1024L
private const val Mebibyte = 1024L * 1024L
private const val Gibibyte = 1024L * 1024L * 1024L
