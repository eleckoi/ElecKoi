package com.eleckoi.android.engine.workspace.runtime.work

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.eleckoi.android.engine.workspace.runtime.service.LocalRuntimeServiceClient
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeState
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeCapabilities
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationEvent
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.withTimeout

/**
 * Owns the durable bootstrap request. Actual mutation stays in LocalRuntimeService, so UI repair,
 * Agent launches and background initialization share one admission lock and one installer.
 */
class RuntimeBootstrapWorker(
    appContext: Context,
    parameters: WorkerParameters,
) : CoroutineWorker(appContext, parameters) {
    override suspend fun doWork(): Result {
        val runtime = LocalRuntimeServiceClient(applicationContext)
        return try {
            runtime.connect()
            val capabilities = runtime.state.value.capabilitiesOrNull()
            val operation = automaticRuntimeMaintenanceOperation(capabilities)
                ?: return Result.success()

            coroutineScope {
                val terminal = async(start = CoroutineStart.UNDISPATCHED) {
                    runtime.installationEvents
                        .onEach { event ->
                            if (event is RuntimeInstallationEvent.Progress) {
                                setProgress(
                                    workDataOf(
                                        "stage" to event.progress.stage.name,
                                        "completedBytes" to event.progress.completedBytes,
                                        "totalBytes" to (event.progress.totalBytes ?: -1L),
                                        "processedEntries" to event.progress.processedEntries,
                                    ),
                                )
                            }
                        }
                        .first { event ->
                            event is RuntimeInstallationEvent.Completed ||
                                event is RuntimeInstallationEvent.Failed ||
                                event is RuntimeInstallationEvent.Cancelled
                        }
                }
                when (operation) {
                    RuntimeMaintenanceOperation.Install -> runtime.installRuntimeDirectly()
                    RuntimeMaintenanceOperation.Update -> runtime.updateRuntime()
                    RuntimeMaintenanceOperation.Repair -> runtime.repairRuntime()
                    RuntimeMaintenanceOperation.Uninstall -> error("后台启动不能卸载本地运行时")
                }
                when (val event = withTimeout(BootstrapTimeoutMillis) { terminal.await() }) {
                    is RuntimeInstallationEvent.Completed -> if (
                        event.capabilities.health == LocalRuntimeHealth.Healthy
                    ) {
                        Result.success()
                    } else {
                        Result.failure(workDataOf("error" to "本地创作环境校验未通过"))
                    }
                    is RuntimeInstallationEvent.Failed -> {
                        Log.e(Tag, "Background runtime bootstrap failed: ${event.message}")
                        Result.failure(workDataOf("error" to event.message))
                    }
                    is RuntimeInstallationEvent.Cancelled -> Result.retry()
                    is RuntimeInstallationEvent.Progress -> error("进度事件不应作为终态")
                }
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Throwable) {
            Log.e(Tag, "Background runtime bootstrap crashed", error)
            if (runAttemptCount < MaxAutomaticRetries) {
                Result.retry()
            } else {
                Result.failure(
                    workDataOf("error" to (error.message?.take(MaxErrorChars) ?: "本地创作环境准备失败")),
                )
            }
        } finally {
            runtime.close()
        }
    }

    private fun LocalRuntimeState.capabilitiesOrNull() = when (this) {
        is LocalRuntimeState.Ready -> capabilities
        is LocalRuntimeState.Running -> capabilities
        else -> null
    }

    private companion object {
        const val BootstrapTimeoutMillis = 45L * 60L * 1_000L
        const val MaxAutomaticRetries = 2
        const val MaxErrorChars = 1_000
        const val Tag = "ElecKoiRuntime"
    }
}

internal fun automaticRuntimeMaintenanceOperation(
    capabilities: LocalRuntimeCapabilities?,
): RuntimeMaintenanceOperation? = when {
    capabilities == null -> RuntimeMaintenanceOperation.Install
    !capabilities.supportsArm64Runtime || capabilities.health == LocalRuntimeHealth.Unsupported -> null
    capabilities.health == LocalRuntimeHealth.Healthy -> null
    capabilities.health == LocalRuntimeHealth.UpdateAvailable -> RuntimeMaintenanceOperation.Update
    capabilities.health == LocalRuntimeHealth.NeedsRepair -> RuntimeMaintenanceOperation.Repair
    else -> RuntimeMaintenanceOperation.Install
}
