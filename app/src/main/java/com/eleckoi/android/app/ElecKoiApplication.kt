package com.eleckoi.android.app

import android.app.Application
import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.os.Build
import android.os.Process
import android.util.Log
import androidx.compose.foundation.ComposeFoundationFlags
import androidx.compose.foundation.ExperimentalFoundationApi
import com.eleckoi.android.foundation.diagnostics.CrashDiagnostics
import com.eleckoi.android.engine.workspace.runtime.work.RuntimeBootstrapScheduler
import com.eleckoi.android.engine.workspace.runtime.work.RuntimeBootstrapDiagnostics
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationState
import com.eleckoi.android.feature.chat.data.markdown.MarkdownDocumentDiskCache
import com.eleckoi.android.feature.chat.ui.blocks.markdown.MarkdownRebuildableCaches
import com.eleckoi.android.feature.conversation.timeline.ui.clearCreationTimelinePreparationCache
import com.eleckoi.android.app.update.AppUpdateRepository
import com.eleckoi.android.app.update.AppUpdateScheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.launch

class ElecKoiApplication : Application() {
    private val containerDelegate = lazy { ElecKoiAppContainer(this) }
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val container: ElecKoiAppContainer by containerDelegate
    internal val appUpdateRepository by lazy { AppUpdateRepository(this) }
    internal val appUpdateScheduler by lazy { AppUpdateScheduler(this) }

    @OptIn(ExperimentalFoundationApi::class)
    override fun onCreate() {
        // Compose Foundation 1.11's new context-menu path can inherit toolbar coordinates across
        // separate Dialog windows. Long-pressing selectable dialog text then asks two unrelated
        // layout trees for a common ancestor and crashes. The legacy path keeps native drag
        // selection/copy behavior without that cross-window coordinate conversion.
        ComposeFoundationFlags.isNewContextMenuEnabled = false
        super.onCreate()
        if (isMainProcess()) {
            CrashDiagnostics.install(this)
            CrashDiagnostics.registerReportSection(
                title = "本地运行时安装诊断",
                provider = { context ->
                    RuntimeBootstrapDiagnostics.buildReport(
                        context = context,
                        runtimeState = container.localRuntime.state.value,
                        installationState = container.localRuntime.installationState.value,
                    )
                },
            )
            // Only records the path here; directory IO stays off the application launch frame.
            MarkdownDocumentDiskCache.initialize(cacheDir)
            runCatching { RuntimeBootstrapScheduler.ensureInstalled(this) }
                .onFailure { error -> Log.e(LogTag, "Unable to schedule bundled runtime bootstrap", error) }
            applicationScope.launch {
                // Keep only the process-level runtime service resident. Workspace, conversation,
                // and model selection belong to the assistant screen and must not be guessed here.
                runCatching { container.prewarmAgentRuntime() }
                    .onFailure { error ->
                        Log.i(LogTag, "Agent runtime prewarm deferred until the runtime is ready", error)
                    }
            }
            applicationScope.launch {
                container.localRuntime.installationState
                    .distinctUntilChangedBy { state ->
                        when (state) {
                            RuntimeInstallationState.Idle -> "idle"
                            is RuntimeInstallationState.Installing ->
                                "${state.operation}:${state.progress.stage}"
                            is RuntimeInstallationState.Failed ->
                                "${state.operation}:${state.message}"
                        }
                    }
                    .collect { state ->
                        val fields = when (state) {
                            RuntimeInstallationState.Idle -> mapOf("state" to "idle")
                            is RuntimeInstallationState.Installing -> mapOf(
                                "state" to "installing",
                                "operation" to state.operation,
                                "stage" to state.progress.stage,
                                "completed_bytes" to state.progress.completedBytes,
                                "total_bytes" to state.progress.totalBytes,
                                "processed_entries" to state.progress.processedEntries,
                            )
                            is RuntimeInstallationState.Failed -> mapOf(
                                "state" to "failed",
                                "operation" to state.operation,
                                "message" to state.message,
                            )
                        }
                        CrashDiagnostics.breadcrumb("runtime_installation_state", fields)
                    }
            }
        }
    }

    override fun onTerminate() {
        applicationScope.cancel()
        clearRebuildablePresentationCaches()
        if (containerDelegate.isInitialized()) container.close()
        super.onTerminate()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        CrashDiagnostics.memoryBreadcrumb("trim_memory", mapOf("level" to level))
        // UI_HIDDEN (20) only means the user put the app in the background. Clearing there made
        // every return to a long conversation a cold Markdown rebuild. Preserve rebuildable data
        // for that normal lifecycle event and release it only for an actual pressure tier.
        val runningUnderPressure = level in
            ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW..ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL
        val backgroundUnderPressure = level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND
        if (runningUnderPressure || backgroundUnderPressure) {
            clearRebuildablePresentationCaches()
        }
    }

    override fun onLowMemory() {
        CrashDiagnostics.memoryBreadcrumb("low_memory")
        clearRebuildablePresentationCaches()
        super.onLowMemory()
    }

    private fun isMainProcess(): Boolean {
        val processName = if (Build.VERSION.SDK_INT >= 28) {
            Application.getProcessName()
        } else {
            val pid = Process.myPid()
            (getSystemService(ACTIVITY_SERVICE) as? ActivityManager)
                ?.runningAppProcesses
                ?.firstOrNull { it.pid == pid }
                ?.processName
        }
        return processName == packageName
    }

    private fun clearRebuildablePresentationCaches() {
        MarkdownRebuildableCaches.clear()
        clearCreationTimelinePreparationCache()
    }

    private companion object {
        const val LogTag = "ElecKoiRuntime"
    }
}
