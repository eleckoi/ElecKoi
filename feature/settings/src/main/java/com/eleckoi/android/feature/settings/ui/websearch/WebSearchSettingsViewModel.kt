package com.eleckoi.android.feature.settings.ui.websearch

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.eleckoi.android.engine.agent.websearch.TavilyApiClient
import com.eleckoi.android.feature.settings.data.websearch.WebSearchSettingsRepository
import com.eleckoi.android.feature.settings.data.websearch.WebSearchMode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal data class WebSearchSettingsUiState(
    val mode: WebSearchMode = WebSearchMode.ProviderNative,
    val apiKeyConfigured: Boolean = false,
    val apiKeyDraft: String = "",
    val maxResults: Int = 5,
    val testing: Boolean = false,
    val usageSummary: String = "",
    val notice: String = "",
    val errorMessage: String = "",
)

internal sealed interface WebSearchSettingsIntent {
    data class SetMode(val value: WebSearchMode) : WebSearchSettingsIntent
    data class SetApiKeyDraft(val value: String) : WebSearchSettingsIntent
    data class SetMaxResults(val value: Int) : WebSearchSettingsIntent
    data object SaveAndTest : WebSearchSettingsIntent
    data object TestConnection : WebSearchSettingsIntent
    data object RemoveApiKey : WebSearchSettingsIntent
    data object DismissMessage : WebSearchSettingsIntent
}

class WebSearchSettingsViewModel(
    private val repository: WebSearchSettingsRepository,
    private val apiClient: TavilyApiClient,
) : ViewModel() {
    private val _uiState = MutableStateFlow(WebSearchSettingsUiState())
    internal val uiState: StateFlow<WebSearchSettingsUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.settings.collect { settings ->
                _uiState.update {
                    it.copy(
                        mode = settings.mode,
                        apiKeyConfigured = settings.apiKeyConfigured,
                        maxResults = settings.maxResults,
                    )
                }
            }
        }
    }

    internal fun onIntent(intent: WebSearchSettingsIntent) {
        when (intent) {
            is WebSearchSettingsIntent.SetMode -> repository.setMode(intent.value)
            is WebSearchSettingsIntent.SetApiKeyDraft -> _uiState.update {
                it.copy(apiKeyDraft = intent.value.take(MaxApiKeyChars), notice = "", errorMessage = "")
            }
            is WebSearchSettingsIntent.SetMaxResults -> repository.setMaxResults(intent.value)
            WebSearchSettingsIntent.SaveAndTest -> testConnection(saveDraftOnSuccess = true)
            WebSearchSettingsIntent.TestConnection -> testConnection(saveDraftOnSuccess = false)
            WebSearchSettingsIntent.RemoveApiKey -> removeApiKey()
            WebSearchSettingsIntent.DismissMessage -> _uiState.update {
                it.copy(notice = "", errorMessage = "")
            }
        }
    }

    private fun testConnection(saveDraftOnSuccess: Boolean) {
        if (_uiState.value.testing) return
        val draft = _uiState.value.apiKeyDraft.trim()
        viewModelScope.launch {
            _uiState.update { it.copy(testing = true, notice = "", errorMessage = "") }
            runCatching {
                val apiKey = withContext(Dispatchers.IO) {
                    draft.ifBlank(repository::apiKey)
                }
                require(apiKey.isNotBlank()) { "请先填写 Tavily API Key" }
                val usage = withContext(Dispatchers.IO) { apiClient.usage(apiKey) }
                if (draft.isNotBlank() && saveDraftOnSuccess) {
                    withContext(Dispatchers.IO) { repository.saveApiKey(draft) }
                }
                usage
            }.onSuccess { usage ->
                val usageText = if (usage.limit > 0) {
                    "${usage.plan} · 本周期 ${usage.used} / ${usage.limit} credits"
                } else {
                    "${usage.plan} · 已连接"
                }
                _uiState.update {
                    it.copy(
                        testing = false,
                        apiKeyDraft = if (draft.isNotBlank() && saveDraftOnSuccess) "" else it.apiKeyDraft,
                        usageSummary = usageText,
                        notice = if (draft.isNotBlank() && saveDraftOnSuccess) {
                            "API Key 已加密保存，连接正常"
                        } else {
                            "Tavily 连接正常"
                        },
                        errorMessage = "",
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        testing = false,
                        errorMessage = error.message?.trim()?.ifBlank { "Tavily 连接失败" }
                            ?: "Tavily 连接失败",
                    )
                }
            }
        }
    }

    private fun removeApiKey() {
        viewModelScope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.clearApiKey() } }
                .onSuccess {
                    _uiState.update {
                        it.copy(
                            apiKeyDraft = "",
                            usageSummary = "",
                            notice = "已移除 Tavily API Key",
                            errorMessage = "",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(errorMessage = error.message ?: "移除 Tavily API Key 失败")
                    }
                }
        }
    }

    companion object {
        private const val MaxApiKeyChars = 2_048

        fun factory(
            repository: WebSearchSettingsRepository,
            apiClient: TavilyApiClient,
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                WebSearchSettingsViewModel(repository, apiClient) as T
        }
    }
}
