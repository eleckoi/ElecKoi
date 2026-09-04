package com.eleckoi.android.feature.settings.ui.runtime

import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeCapabilities
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeGateway
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeHealth
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeState
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeStorageUsage
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationProgress
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeInstallationState
import com.eleckoi.android.engine.workspace.runtime.model.RuntimeMaintenanceOperation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal data class LocalRuntimeSettingsUiState(
    val runtimeState: LocalRuntimeState = LocalRuntimeState.Disconnected,
    val maintenanceState: RuntimeInstallationState = RuntimeInstallationState.Idle,
    val storageUsage: LocalRuntimeStorageUsage = LocalRuntimeStorageUsage.Unknown,
    val lastProgress: RuntimeInstallationProgress? = null,
    val maintenanceStartedAtMillis: Long? = null,
    val notice: String = "",
    val errorMessage: String = "",
) {
    val capabilities: LocalRuntimeCapabilities?
        get() = when (runtimeState) {
            is LocalRuntimeState.Ready -> runtimeState.capabilities
            is LocalRuntimeState.Running -> runtimeState.capabilities
            else -> null
        }

    fun withMaintenance(next: RuntimeInstallationState): LocalRuntimeSettingsUiState = when (next) {
        is RuntimeInstallationState.Installing -> copy(
            maintenanceState = next,
            lastProgress = next.progress,
            maintenanceStartedAtMillis = maintenanceStartedAtMillis ?: SystemClock.elapsedRealtime(),
        )
        is RuntimeInstallationState.Failed -> copy(
            maintenanceState = next,
            maintenanceStartedAtMillis = null,
        )
        RuntimeInstallationState.Idle -> copy(
            maintenanceState = next,
            lastProgress = null,
            maintenanceStartedAtMillis = null,
        )
    }
}

internal sealed interface LocalRuntimeSettingsIntent {
    data object Connect : LocalRuntimeSettingsIntent
    data object Refresh : LocalRuntimeSettingsIntent
    data object Install : LocalRuntimeSettingsIntent
    data object Update : LocalRuntimeSettingsIntent
    data object Repair : LocalRuntimeSettingsIntent
    data object Uninstall : LocalRuntimeSettingsIntent
    data object CancelMaintenance : LocalRuntimeSettingsIntent
    data object DismissMessage : LocalRuntimeSettingsIntent
}

class LocalRuntimeSettingsViewModel(
    private val runtime: LocalRuntimeGateway,
) : ViewModel() {
    private val _uiState = MutableStateFlow(LocalRuntimeSettingsUiState())
    internal val uiState: StateFlow<LocalRuntimeSettingsUiState> = _uiState.asStateFlow()
    private var measuredFor: String? = null

    init {
        viewModelScope.launch {
            runtime.state.collect { value ->
                _uiState.update { it.copy(runtimeState = value) }
                measureStorageWhenInstalled(value)
            }
        }
        viewModelScope.launch {
            runtime.installationState.collect { value ->
                _uiState.update { state -> state.withMaintenance(value) }
                if (value !is RuntimeInstallationState.Installing) measuredFor = null
            }
        }
    }

    private fun measureStorageWhenInstalled(state: LocalRuntimeState) {
        val capabilities = when (state) {
            is LocalRuntimeState.Ready -> state.capabilities
            is LocalRuntimeState.Running -> state.capabilities
            else -> null
        } ?: return
        if (capabilities.health == LocalRuntimeHealth.Unsupported ||
            capabilities.health == LocalRuntimeHealth.NotInstalled
        ) {
            measuredFor = null
            _uiState.update { it.copy(storageUsage = LocalRuntimeStorageUsage.Unknown) }
            return
        }
        val version = capabilities.installedRuntimeVersion ?: return
        if (version == measuredFor) return
        measuredFor = version
        viewModelScope.launch {
            val usage = runCatching { runtime.readStorageUsage() }.getOrNull()
            if (usage == null) {
                measuredFor = null
            } else {
                _uiState.update { it.copy(storageUsage = usage) }
            }
        }
    }

    internal fun onIntent(intent: LocalRuntimeSettingsIntent) {
        when (intent) {
            LocalRuntimeSettingsIntent.Connect -> connect()
            LocalRuntimeSettingsIntent.Refresh -> refresh()
            LocalRuntimeSettingsIntent.Install -> maintain(RuntimeMaintenanceOperation.Install)
            LocalRuntimeSettingsIntent.Update -> maintain(RuntimeMaintenanceOperation.Update)
            LocalRuntimeSettingsIntent.Repair -> maintain(RuntimeMaintenanceOperation.Repair)
            LocalRuntimeSettingsIntent.Uninstall -> maintain(RuntimeMaintenanceOperation.Uninstall)
            LocalRuntimeSettingsIntent.CancelMaintenance -> cancelMaintenance()
            LocalRuntimeSettingsIntent.DismissMessage -> _uiState.update {
                it.copy(notice = "", errorMessage = "")
            }
        }
    }

    private fun connect() {
        viewModelScope.launch {
            runCatching { runtime.connect() }.onFailure { error ->
                showError(error, "连接本地创作环境失败")
            }
        }
    }

    private fun refresh() {
        viewModelScope.launch {
            runCatching { runtime.refreshRuntimeStatus() }.onFailure { error ->
                showError(error, "刷新本地创作环境失败")
            }
        }
    }

    private fun maintain(operation: RuntimeMaintenanceOperation) {
        if (_uiState.value.maintenanceState is RuntimeInstallationState.Installing) return
        viewModelScope.launch {
            runCatching {
                when (operation) {
                    RuntimeMaintenanceOperation.Install -> runtime.installRuntime()
                    RuntimeMaintenanceOperation.Update -> runtime.updateRuntime()
                    RuntimeMaintenanceOperation.Repair -> runtime.repairRuntime()
                    RuntimeMaintenanceOperation.Uninstall -> runtime.uninstallRuntime()
                }
            }.onFailure { error -> showError(error, "启动本地创作环境维护失败") }
        }
    }

    private fun cancelMaintenance() {
        viewModelScope.launch {
            runCatching { runtime.cancelRuntimeInstallation() }.onFailure { error ->
                showError(error, "取消本地环境维护失败")
            }
        }
    }

    private fun showError(error: Throwable, fallback: String) {
        _uiState.update {
            it.copy(errorMessage = error.message?.trim()?.ifBlank { fallback } ?: fallback)
        }
    }

    companion object {
        fun factory(
            runtime: LocalRuntimeGateway,
        ): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    LocalRuntimeSettingsViewModel(runtime) as T
            }
    }
}
