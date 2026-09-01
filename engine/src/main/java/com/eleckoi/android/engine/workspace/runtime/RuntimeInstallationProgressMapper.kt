package com.eleckoi.android.engine.workspace.runtime

import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationProgress
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationStage
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation

internal fun RuntimeInstallProgress.toDomain(): RuntimeInstallationProgress = RuntimeInstallationProgress(
    stage = when (stage) {
        RuntimeInstallStage.Checking -> RuntimeInstallationStage.Checking
        RuntimeInstallStage.DownloadingRootfs -> RuntimeInstallationStage.DownloadingRootfs
        RuntimeInstallStage.DownloadingHarness -> RuntimeInstallationStage.DownloadingHarness
        RuntimeInstallStage.DownloadingNode -> RuntimeInstallationStage.DownloadingNode
        RuntimeInstallStage.DownloadingPnpm -> RuntimeInstallationStage.DownloadingPnpm
        RuntimeInstallStage.ExtractingRootfs -> RuntimeInstallationStage.ExtractingRootfs
        RuntimeInstallStage.ExtractingHarness -> RuntimeInstallationStage.ExtractingHarness
        RuntimeInstallStage.ExtractingNode -> RuntimeInstallationStage.ExtractingNode
        RuntimeInstallStage.ExtractingPnpm -> RuntimeInstallationStage.ExtractingPnpm
        RuntimeInstallStage.ProvisioningPackages -> RuntimeInstallationStage.ProvisioningPackages
        RuntimeInstallStage.Verifying -> RuntimeInstallationStage.Verifying
        RuntimeInstallStage.Activating -> RuntimeInstallationStage.Activating
        RuntimeInstallStage.Removing -> RuntimeInstallationStage.Removing
        RuntimeInstallStage.Cleaning -> RuntimeInstallationStage.Cleaning
    },
    completedBytes = completedBytes,
    totalBytes = totalBytes,
    processedEntries = processedEntries,
    componentId = componentId,
)

internal val RuntimeInstallationStage.wireName: String
    get() = when (this) {
        RuntimeInstallationStage.Checking -> "checking"
        RuntimeInstallationStage.DownloadingRootfs -> "downloading_rootfs"
        RuntimeInstallationStage.DownloadingHarness -> "downloading_harness"
        RuntimeInstallationStage.DownloadingNode -> "downloading_node"
        RuntimeInstallationStage.DownloadingPnpm -> "downloading_pnpm"
        RuntimeInstallationStage.ExtractingRootfs -> "extracting_rootfs"
        RuntimeInstallationStage.ExtractingHarness -> "extracting_harness"
        RuntimeInstallationStage.ExtractingNode -> "extracting_node"
        RuntimeInstallationStage.ExtractingPnpm -> "extracting_pnpm"
        RuntimeInstallationStage.ProvisioningPackages -> "provisioning_packages"
        RuntimeInstallationStage.Verifying -> "verifying"
        RuntimeInstallationStage.Activating -> "activating"
        RuntimeInstallationStage.Removing -> "removing"
        RuntimeInstallationStage.Cleaning -> "cleaning"
    }

internal fun runtimeInstallationStageFromWire(value: String?): RuntimeInstallationStage? = when (value) {
    "checking" -> RuntimeInstallationStage.Checking
    "downloading_rootfs" -> RuntimeInstallationStage.DownloadingRootfs
    "downloading_harness" -> RuntimeInstallationStage.DownloadingHarness
    "downloading_node" -> RuntimeInstallationStage.DownloadingNode
    "downloading_pnpm" -> RuntimeInstallationStage.DownloadingPnpm
    "extracting_rootfs" -> RuntimeInstallationStage.ExtractingRootfs
    "extracting_harness" -> RuntimeInstallationStage.ExtractingHarness
    "extracting_node" -> RuntimeInstallationStage.ExtractingNode
    "extracting_pnpm" -> RuntimeInstallationStage.ExtractingPnpm
    "provisioning_packages" -> RuntimeInstallationStage.ProvisioningPackages
    "verifying" -> RuntimeInstallationStage.Verifying
    "activating" -> RuntimeInstallationStage.Activating
    "removing" -> RuntimeInstallationStage.Removing
    "cleaning" -> RuntimeInstallationStage.Cleaning
    else -> null
}

internal val RuntimeMaintenanceOperation.wireName: String
    get() = name.lowercase()

internal fun maintenanceOperationFromWire(value: String?): RuntimeMaintenanceOperation? =
    RuntimeMaintenanceOperation.entries.firstOrNull { it.wireName == value }

internal val LocalRuntimeHealth.wireName: String
    get() = when (this) {
        LocalRuntimeHealth.Unsupported -> "unsupported"
        LocalRuntimeHealth.NotInstalled -> "not_installed"
        LocalRuntimeHealth.Checking -> "checking"
        LocalRuntimeHealth.Healthy -> "healthy"
        LocalRuntimeHealth.UpdateAvailable -> "update_available"
        LocalRuntimeHealth.NeedsRepair -> "needs_repair"
    }

internal fun localRuntimeHealthFromWire(value: String?): LocalRuntimeHealth? = when (value) {
    "unsupported" -> LocalRuntimeHealth.Unsupported
    "not_installed" -> LocalRuntimeHealth.NotInstalled
    "checking" -> LocalRuntimeHealth.Checking
    "healthy" -> LocalRuntimeHealth.Healthy
    "update_available" -> LocalRuntimeHealth.UpdateAvailable
    "needs_repair" -> LocalRuntimeHealth.NeedsRepair
    else -> null
}
