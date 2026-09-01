package com.eleckoi.android.engine.workspace.runtime.work

import android.content.Context
import android.os.Build
import android.os.StatFs
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.eleckoi.android.engine.workspace.runtime.RuntimeDistributionCatalog
import com.eleckoi.android.engine.workspace.runtime.RuntimeInstallationInspector
import com.eleckoi.android.engine.workspace.runtime.RuntimePaths
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeState
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationState
import java.util.concurrent.TimeUnit

/** Snapshot exported with the user-created fault report; it never includes prompts or credentials. */
object RuntimeBootstrapDiagnostics {
    fun buildReport(
        context: Context,
        runtimeState: LocalRuntimeState? = null,
        installationState: RuntimeInstallationState? = null,
    ): String {
        val appContext = context.applicationContext
        val paths = RuntimePaths(appContext)
        val catalog = runCatching { RuntimeDistributionCatalog.load(appContext) }.getOrNull()
        val active = runCatching { RuntimeInstallationInspector.readActive(paths) }.getOrNull()
        val activeUsable = active?.let { manifest ->
            runCatching { RuntimeInstallationInspector.isUsable(paths, manifest) }.getOrDefault(false)
        }
        val storage = storageSnapshot(appContext)
        val workResult = runCatching {
            WorkManager.getInstance(appContext)
                .getWorkInfosForUniqueWork(RuntimeBootstrapUniqueWorkName)
                .get(WorkQueryTimeoutSeconds, TimeUnit.SECONDS)
        }

        return buildString {
            appendLine("supported_64_bit_abis=${Build.SUPPORTED_64_BIT_ABIS.joinToString()}")
            appendLine("runtime_client_state=${runtimeState ?: "unavailable"}")
            appendLine("runtime_installation_state=${installationState ?: "unavailable"}")
            appendLine("catalog_version=${catalog?.runtimeVersion ?: "unavailable"}")
            appendLine("catalog_architecture=${catalog?.architecture ?: "unavailable"}")
            appendLine("active_manifest=${active != null}")
            appendLine("active_version=${active?.runtimeVersion ?: "none"}")
            appendLine("active_architecture=${active?.architecture ?: "none"}")
            appendLine("active_usable=${activeUsable ?: false}")
            appendLine("storage_total_bytes=${storage.totalBytes}")
            appendLine("storage_available_bytes=${storage.availableBytes}")
            workResult.fold(
                onSuccess = { workInfos ->
                    appendLine("bootstrap_work_count=${workInfos.size}")
                    if (workInfos.isEmpty()) appendLine("bootstrap_work=none")
                    workInfos.sortedBy { it.generation }.forEachIndexed { index, info ->
                        appendWorkInfo(index, info)
                    }
                },
                onFailure = { error ->
                    appendLine("bootstrap_work_query_error=${error.javaClass.name}: ${error.message.orEmpty()}")
                },
            )
        }
    }

    private fun StringBuilder.appendWorkInfo(index: Int, info: WorkInfo) {
        val prefix = "bootstrap_work[$index]"
        appendLine("$prefix.id=${info.id}")
        appendLine("$prefix.state=${info.state}")
        appendLine("$prefix.generation=${info.generation}")
        appendLine("$prefix.run_attempt_count=${info.runAttemptCount}")
        appendLine("$prefix.stop_reason=${stopReasonLabel(info.stopReason)}(${info.stopReason})")
        appendLine("$prefix.requires_storage_not_low=${info.constraints.requiresStorageNotLow()}")
        appendLine("$prefix.next_schedule_time_millis=${info.nextScheduleTimeMillis}")
        info.progress.getString(ProgressStageKey)?.let { appendLine("$prefix.progress_stage=$it") }
        info.progress.getLong(ProgressCompletedBytesKey, -1L)
            .takeIf { it >= 0L }
            ?.let { appendLine("$prefix.progress_completed_bytes=$it") }
        info.progress.getLong(ProgressTotalBytesKey, -1L)
            .takeIf { it >= 0L }
            ?.let { appendLine("$prefix.progress_total_bytes=$it") }
        info.progress.getInt(ProgressProcessedEntriesKey, -1)
            .takeIf { it >= 0 }
            ?.let { appendLine("$prefix.progress_processed_entries=$it") }
        info.outputData.getString(OutputErrorKey)
            ?.takeIf(String::isNotBlank)
            ?.let { appendLine("$prefix.output_error=$it") }
    }

    private fun storageSnapshot(context: Context): RuntimeStorageDiagnostic {
        val stat = StatFs(context.filesDir.absolutePath)
        return RuntimeStorageDiagnostic(
            totalBytes = stat.totalBytes,
            availableBytes = stat.availableBytes,
        )
    }

    private fun stopReasonLabel(reason: Int): String = when (reason) {
        WorkInfo.STOP_REASON_NOT_STOPPED -> "not_stopped"
        WorkInfo.STOP_REASON_CANCELLED_BY_APP -> "cancelled_by_app"
        WorkInfo.STOP_REASON_PREEMPT -> "preempted"
        WorkInfo.STOP_REASON_TIMEOUT -> "timeout"
        WorkInfo.STOP_REASON_DEVICE_STATE -> "device_state"
        WorkInfo.STOP_REASON_CONSTRAINT_BATTERY_NOT_LOW -> "battery_not_low_constraint"
        WorkInfo.STOP_REASON_CONSTRAINT_CHARGING -> "charging_constraint"
        WorkInfo.STOP_REASON_CONSTRAINT_CONNECTIVITY -> "connectivity_constraint"
        WorkInfo.STOP_REASON_CONSTRAINT_DEVICE_IDLE -> "device_idle_constraint"
        WorkInfo.STOP_REASON_CONSTRAINT_STORAGE_NOT_LOW -> "storage_not_low_constraint"
        WorkInfo.STOP_REASON_QUOTA -> "quota"
        WorkInfo.STOP_REASON_BACKGROUND_RESTRICTION -> "background_restriction"
        WorkInfo.STOP_REASON_APP_STANDBY -> "app_standby"
        WorkInfo.STOP_REASON_USER -> "user"
        WorkInfo.STOP_REASON_SYSTEM_PROCESSING -> "system_processing"
        else -> "unknown"
    }

    private data class RuntimeStorageDiagnostic(
        val totalBytes: Long,
        val availableBytes: Long,
    )

    private const val WorkQueryTimeoutSeconds = 2L
    private const val ProgressStageKey = "stage"
    private const val ProgressCompletedBytesKey = "completedBytes"
    private const val ProgressTotalBytesKey = "totalBytes"
    private const val ProgressProcessedEntriesKey = "processedEntries"
    private const val OutputErrorKey = "error"
}
