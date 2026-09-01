package com.eleckoi.android.feature.characters.modes.story.variables.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.eleckoi.android.feature.characters.modes.story.variables.api.VariableConfigService
import com.eleckoi.android.engine.story.variables.model.VariableConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class VariableConfigUiState(
    val config: VariableConfig? = null,
    val saving: Boolean = false,
    val errorMessage: String = "",
)

sealed interface VariableConfigIntent {
    data object Clear : VariableConfigIntent
    data class Load(val characterId: String) : VariableConfigIntent
    data class Save(val characterId: String, val config: VariableConfig) : VariableConfigIntent
    data class Import(val characterId: String, val json: String) : VariableConfigIntent
    data class Export(val characterId: String) : VariableConfigIntent
}

sealed interface VariableConfigEffect {
    data class ExportReady(val json: String, val fileName: String) : VariableConfigEffect
}

class VariableConfigViewModel(
    private val variableConfigService: VariableConfigService,
) : ViewModel() {
    private val _uiState = MutableStateFlow(VariableConfigUiState())
    val uiState: StateFlow<VariableConfigUiState> = _uiState.asStateFlow()
    private val _effects = MutableSharedFlow<VariableConfigEffect>()
    val effects: SharedFlow<VariableConfigEffect> = _effects.asSharedFlow()
    private val currentCharacterId = MutableStateFlow("")

    init {
        observeCurrentConfig()
    }

    fun onIntent(intent: VariableConfigIntent) {
        when (intent) {
            VariableConfigIntent.Clear -> clear()
            is VariableConfigIntent.Load -> loadVariableConfig(intent.characterId)
            is VariableConfigIntent.Save -> saveVariableConfig(intent.characterId, intent.config)
            is VariableConfigIntent.Import -> importVariableConfig(intent.characterId, intent.json)
            is VariableConfigIntent.Export -> exportVariableConfig(intent.characterId)
        }
    }

    fun clear() {
        currentCharacterId.value = ""
        _uiState.update { VariableConfigUiState() }
    }

    fun loadVariableConfig(characterId: String) {
        if (characterId.isBlank()) return
        _uiState.update { state ->
            if (state.config?.characterId == characterId) {
                state.copy(saving = true)
            } else {
                state.copy(saving = true, config = null)
            }
        }
        currentCharacterId.value = characterId
    }

    private fun observeCurrentConfig() {
        viewModelScope.launch {
            currentCharacterId.collectLatest { characterId ->
                if (characterId.isBlank()) return@collectLatest
                variableConfigService.variableConfigFlow(characterId)
                    .catch { error ->
                        _uiState.update {
                            it.copy(
                                saving = false,
                                errorMessage = error.message ?: "加载变量配置失败",
                            )
                        }
                    }
                    .collectLatest { config ->
                        _uiState.update {
                            it.copy(
                                config = config,
                                saving = false,
                                errorMessage = "",
                            )
                        }
                    }
            }
        }
    }

    fun saveVariableConfig(characterId: String, config: VariableConfig) {
        if (characterId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(saving = true) }
            runCatching {
                withContext(Dispatchers.IO) { variableConfigService.saveVariableConfig(characterId, config) }
            }.onSuccess { saved ->
                _uiState.update {
                    it.copy(
                        config = saved,
                        saving = false,
                        errorMessage = "",
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        saving = false,
                        errorMessage = error.message ?: "保存变量配置失败",
                    )
                }
            }
        }
    }

    private fun importVariableConfig(characterId: String, json: String) {
        if (characterId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(saving = true) }
            runCatching {
                withContext(Dispatchers.IO) { variableConfigService.importVariableConfig(characterId, json) }
            }.onSuccess { config ->
                _uiState.update { it.copy(config = config, saving = false, errorMessage = "") }
            }.onFailure { error ->
                _uiState.update { it.copy(saving = false, errorMessage = error.message ?: "导入变量配置失败") }
            }
        }
    }

    private fun exportVariableConfig(characterId: String) {
        if (characterId.isBlank()) return
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { variableConfigService.exportVariableConfig(characterId) }
            }.onSuccess { json ->
                _uiState.update { it.copy(errorMessage = "") }
                val name = _uiState.value.config?.name?.ifBlank { "variable-config" } ?: "variable-config"
                _effects.emit(VariableConfigEffect.ExportReady(json, "$name.json"))
            }.onFailure { error ->
                _uiState.update { it.copy(errorMessage = error.message ?: "导出变量配置失败") }
            }
        }
    }

    companion object {
        fun factory(variableConfigService: VariableConfigService): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    if (modelClass.isAssignableFrom(VariableConfigViewModel::class.java)) {
                        return VariableConfigViewModel(variableConfigService) as T
                    }
                    throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
                }
            }
        }
    }
}
