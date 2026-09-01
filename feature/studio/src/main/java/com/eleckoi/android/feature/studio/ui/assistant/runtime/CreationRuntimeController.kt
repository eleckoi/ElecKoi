package com.eleckoi.android.feature.studio.ui.assistant.runtime

import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeGateway
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationEvent
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationState
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import com.eleckoi.android.feature.studio.ui.assistant.session.creationAssistantMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/**
 * Owns runtime connection and maintenance jobs, but applies results only through
 * the ViewModel-provided state reducer.
 */
internal class CreationRuntimeController(
    private val scope: CoroutineScope,
    private val runtime: LocalRuntimeGateway,
    private val state: () -> AiCreationAssistantUiState,
    private val updateState: ((AiCreationAssistantUiState) -> AiCreationAssistantUiState) -> Unit,
    private val detachSession: () -> Job?,
) {
    private var connectRequested = false

    fun start() {
        scope.launch {
            combine(runtime.state, runtime.installationState) { runtimeState, installationState ->
                runtimeState to installationState
            }.collect { (runtimeState, installationState) ->
                updateState {
                    it.withRuntimeState(runtimeState)
                        .copy(runtimeInstallationState = installationState)
                }
            }
        }
        scope.launch {
            runtime.installationEvents.collect { event ->
                // Completion is the authoritative transition out of the blocking bootstrap UI.
                // Apply its capabilities and Idle state together instead of relying on two
                // independently scheduled StateFlow collectors to arrive in a particular order.
                if (event is RuntimeInstallationEvent.Completed) {
                    updateState { it.withCompletedRuntimeInstallation(event) }
                }
            }
        }
    }

    fun connect() {
        if (connectRequested) return
        connectRequested = true
        scope.launch {
            runCatching { runtime.connect() }
                .onFailure { error ->
                    connectRequested = false
                    updateState {
                        it.copy(errorMessage = error.creationAssistantMessage("连接本地运行时失败"))
                    }
                }
        }
    }

    fun maintain(operation: RuntimeMaintenanceOperation) {
        val snapshot = state()
        if (snapshot.runtimeInstallationState is RuntimeInstallationState.Installing) return
        if (snapshot.isRunning) {
            updateState { it.copy(errorMessage = "请先停止当前创作任务，再维护本地环境") }
            return
        }
        scope.launch {
            detachSession()?.join()
            runCatching {
                runtime.connect()
                when (operation) {
                    RuntimeMaintenanceOperation.Install -> runtime.installRuntime()
                    RuntimeMaintenanceOperation.Update -> runtime.updateRuntime()
                    RuntimeMaintenanceOperation.Repair -> runtime.repairRuntime()
                    RuntimeMaintenanceOperation.Uninstall -> runtime.uninstallRuntime()
                }
            }.onFailure { error ->
                updateState {
                    it.copy(errorMessage = error.creationAssistantMessage("启动本地环境维护失败"))
                }
            }
        }
    }

    fun refresh() {
        scope.launch {
            runCatching { runtime.refreshRuntimeStatus() }
                .onFailure { error ->
                    updateState {
                        it.copy(errorMessage = error.creationAssistantMessage("刷新本地环境状态失败"))
                    }
                }
        }
    }

    fun cancelInstallation() {
        if (state().runtimeInstallationState !is RuntimeInstallationState.Installing) return
        scope.launch {
            runCatching { runtime.cancelRuntimeInstallation() }
                .onFailure { error ->
                    updateState {
                        it.copy(errorMessage = error.creationAssistantMessage("取消运行时安装失败"))
                    }
                }
        }
    }
}
