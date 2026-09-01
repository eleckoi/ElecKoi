package com.eleckoi.android.engine.workspace.runtime.model

import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

/** Application-facing boundary for the isolated local runtime process. */
interface LocalRuntimeGateway : AutoCloseable {
    val state: StateFlow<LocalRuntimeState>
    val events: SharedFlow<LocalRuntimeEvent>
    val installationState: StateFlow<RuntimeInstallationState>
    val installationEvents: SharedFlow<RuntimeInstallationEvent>

    suspend fun connect()

    suspend fun installRuntime()

    suspend fun updateRuntime() = installRuntime()

    suspend fun repairRuntime() = installRuntime()

    suspend fun uninstallRuntime() {
        error("当前本地运行时实现不支持卸载")
    }

    suspend fun refreshRuntimeStatus() = connect()

    suspend fun cancelRuntimeInstallation()

    suspend fun startSystemProbe(commandId: String)

    suspend fun startDeepSeekHarness(commandId: String, launchSpec: DeepSeekRuntimeLaunchSpec) {
        error("当前本地运行时实现不支持 DeepSeek Harness")
    }

    suspend fun sendLine(commandId: String, line: String)

    suspend fun stop(commandId: String)
}
