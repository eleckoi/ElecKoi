package com.eleckoi.android.engine.workspace.runtime.work

import android.content.Context
import android.os.Build
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.eleckoi.android.engine.workspace.runtime.RuntimeDistributionCatalog
import com.eleckoi.android.engine.workspace.runtime.RuntimeInstallationInspector
import com.eleckoi.android.engine.workspace.runtime.RuntimePaths

/** Keeps the bundled core runtime self-healing without waiting for a feature page to open. */
object RuntimeBootstrapScheduler {
    fun cancelPendingAutomaticInstall(context: Context) {
        WorkManager.getInstance(context.applicationContext)
            .cancelUniqueWork(RuntimeBootstrapUniqueWorkName)
    }

    fun ensureInstalled(context: Context) {
        val appContext = context.applicationContext
        if ("arm64-v8a" !in Build.SUPPORTED_64_BIT_ABIS) {
            WorkManager.getInstance(appContext).cancelUniqueWork(RuntimeBootstrapUniqueWorkName)
            return
        }
        val paths = RuntimePaths(appContext)
        val catalog = RuntimeDistributionCatalog.load(appContext)
        val active = RuntimeInstallationInspector.readActive(paths)
        val currentIsReady = active != null &&
            active.runtimeVersion == catalog.runtimeVersion &&
            active.catalogFingerprint == catalog.contentFingerprint() &&
            RuntimeInstallationInspector.isUsable(paths, active)
        if (currentIsReady) {
            WorkManager.getInstance(appContext).cancelUniqueWork(RuntimeBootstrapUniqueWorkName)
            return
        }

        val request = OneTimeWorkRequestBuilder<RuntimeBootstrapWorker>()
            .setConstraints(
                Constraints.Builder()
                    .setRequiresStorageNotLow(true)
                    .build(),
            )
            .build()
        WorkManager.getInstance(appContext).enqueueUniqueWork(
            RuntimeBootstrapUniqueWorkName,
            ExistingWorkPolicy.KEEP,
            request,
        )
    }
}

internal const val RuntimeBootstrapUniqueWorkName = "eleckoi-core-runtime-bootstrap"
