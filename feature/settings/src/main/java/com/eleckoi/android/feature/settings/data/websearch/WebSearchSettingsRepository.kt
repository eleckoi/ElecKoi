package com.eleckoi.android.feature.settings.data.websearch

import android.content.Context
import com.eleckoi.android.engine.generation.config.AndroidKeystoreModelSecretCodec
import com.eleckoi.android.engine.generation.config.ModelSecretCodec
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class WebSearchSettings(
    val apiKeyConfigured: Boolean = false,
    val maxResults: Int = DefaultMaxResults,
) {
    companion object {
        const val DefaultMaxResults = 5
    }
}

class WebSearchSettingsRepository(
    context: Context,
    private val secretCodec: ModelSecretCodec = AndroidKeystoreModelSecretCodec(),
) {
    private val preferences = context.applicationContext.getSharedPreferences(
        PreferencesName,
        Context.MODE_PRIVATE,
    )
    private val _settings = MutableStateFlow(loadSettings())
    val settings: StateFlow<WebSearchSettings> = _settings.asStateFlow()

    fun setMaxResults(maxResults: Int) {
        val normalized = maxResults.coerceIn(MinResults, MaxResults)
        _settings.value = _settings.value.copy(maxResults = normalized)
        preferences.edit().putInt(MaxResultsKey, normalized).apply()
    }

    fun saveApiKey(apiKey: String) {
        val normalized = apiKey.trim()
        require(normalized.isNotBlank()) { "Tavily API Key 不能为空" }
        val protected = secretCodec.protect(SecretId, normalized)
        check(preferences.edit().putString(ApiKeyKey, protected).commit()) {
            "无法保存 Tavily API Key"
        }
        _settings.value = _settings.value.copy(apiKeyConfigured = true)
    }

    fun clearApiKey() {
        check(preferences.edit().remove(ApiKeyKey).commit()) { "无法移除 Tavily API Key" }
        _settings.value = _settings.value.copy(apiKeyConfigured = false)
    }

    fun apiKey(): String {
        val stored = preferences.getString(ApiKeyKey, "").orEmpty()
        if (stored.isBlank()) return ""
        return secretCodec.reveal(SecretId, stored).trim()
    }

    fun isConfigured(): Boolean = settings.value.apiKeyConfigured

    private fun loadSettings(): WebSearchSettings = WebSearchSettings(
        apiKeyConfigured = preferences.getString(ApiKeyKey, "").orEmpty().isNotBlank(),
        maxResults = preferences.getInt(MaxResultsKey, WebSearchSettings.DefaultMaxResults)
            .coerceIn(MinResults, MaxResults),
    )

    private companion object {
        const val PreferencesName = "eleckoi_web_search"
        const val ApiKeyKey = "tavily_api_key"
        const val MaxResultsKey = "max_results"
        const val SecretId = "tavily-web-search"
        const val MinResults = 1
        const val MaxResults = 8
    }
}
