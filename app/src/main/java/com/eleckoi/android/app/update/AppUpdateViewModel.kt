package com.eleckoi.android.app.update

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal data class AppUpdateUiState(
    val installedVersion: String,
    val latestRelease: AppRelease? = null,
    val remindersEnabled: Boolean = true,
    val checking: Boolean = false,
    val checkedOnce: Boolean = false,
    val errorMessage: String = "",
) {
    val updateAvailable: Boolean
        get() = latestRelease?.let { AppVersion.isNewer(it.tagName, installedVersion) } == true

    val latestVersion: String
        get() = latestRelease?.tagName?.let(AppVersion::display).orEmpty()
}

internal class AppUpdateViewModel(
    private val repository: AppUpdateRepository,
    private val installedVersion: String,
    private val scheduler: AppUpdateScheduler,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AppUpdateUiState(installedVersion = installedVersion))
    val uiState: StateFlow<AppUpdateUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.snapshot.collect { snapshot ->
                _uiState.update { state ->
                    state.copy(
                        latestRelease = snapshot.latestRelease,
                        remindersEnabled = snapshot.remindersEnabled,
                        checkedOnce = snapshot.lastCheckedAtMillis > 0L,
                    )
                }
            }
        }
        viewModelScope.launch {
            val snapshot = repository.current()
            scheduler.setEnabled(snapshot.remindersEnabled)
            val stale = nowMillis() - snapshot.lastCheckedAtMillis >= ForegroundRefreshIntervalMillis
            if (snapshot.lastCheckedAtMillis == 0L || stale) refresh()
        }
    }

    fun refresh() {
        if (_uiState.value.checking) return
        viewModelScope.launch {
            _uiState.update { it.copy(checking = true, errorMessage = "") }
            runCatching { repository.checkForUpdate() }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            errorMessage = error.message?.trim().orEmpty()
                                .ifBlank { "暂时无法连接 GitHub" },
                        )
                    }
                }
            _uiState.update { it.copy(checking = false) }
        }
    }

    fun setRemindersEnabled(enabled: Boolean) {
        viewModelScope.launch {
            repository.setRemindersEnabled(enabled)
            scheduler.setEnabled(enabled)
        }
    }

    companion object {
        private val ForegroundRefreshIntervalMillis = TimeUnit.HOURS.toMillis(6)

        fun factory(
            repository: AppUpdateRepository,
            installedVersion: String,
            scheduler: AppUpdateScheduler,
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                AppUpdateViewModel(repository, installedVersion, scheduler) as T
        }
    }
}
