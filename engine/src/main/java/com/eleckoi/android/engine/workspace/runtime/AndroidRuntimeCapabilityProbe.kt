package com.eleckoi.android.engine.workspace.runtime

import android.os.Build
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeCapabilities
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth

internal object AndroidRuntimeCapabilityProbe {
    fun inspect(
        paths: RuntimePaths,
        catalog: RuntimeDistributionCatalog,
    ): LocalRuntimeCapabilities {
        val supported64BitAbis = Build.SUPPORTED_64_BIT_ABIS.toList()
        val supportsArm64 = "arm64-v8a" in supported64BitAbis
        val active = RuntimeInstallationInspector.readActive(paths)
        val structurallyUsable = active?.let { RuntimeInstallationInspector.isUsable(paths, it) } == true
        val health = when {
            !supportsArm64 -> LocalRuntimeHealth.Unsupported
            active == null -> LocalRuntimeHealth.NotInstalled
            !structurallyUsable -> LocalRuntimeHealth.NeedsRepair
            active.runtimeVersion != catalog.runtimeVersion ||
                active.catalogFingerprint != catalog.contentFingerprint() -> LocalRuntimeHealth.UpdateAvailable
            else -> LocalRuntimeHealth.Checking
        }
        return LocalRuntimeCapabilities(
            abi = Build.SUPPORTED_ABIS.firstOrNull().orEmpty().ifBlank { "unknown" },
            supportsArm64Runtime = supportsArm64,
            health = health,
            installedRuntimeVersion = active?.runtimeVersion,
            availableRuntimeVersion = catalog.runtimeVersion,
            healthMessage = when (health) {
                LocalRuntimeHealth.Unsupported -> "当前设备不是 arm64-v8a"
                LocalRuntimeHealth.NotInstalled -> "本地创作环境尚未安装"
                LocalRuntimeHealth.Checking -> "正在验证 Ubuntu 与 Agent Harness"
                LocalRuntimeHealth.UpdateAvailable -> "已有可用环境，可更新到最新版本"
                LocalRuntimeHealth.NeedsRepair -> "本地创作环境文件不完整"
                LocalRuntimeHealth.Healthy -> null
            },
        )
    }
}
