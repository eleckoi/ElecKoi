package com.eleckoi.android.feature.agenttools

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.eleckoi.android.engine.agent.tools.AgentToolScopes
import com.eleckoi.android.engine.agent.tools.AgentToolRequestPolicy
import com.eleckoi.android.feature.agenttools.data.AgentToolsRepository
import com.eleckoi.android.feature.agenttools.model.AgentToolsUiState
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.isImageGenerationConfig

class AgentToolsViewModel(
    private val repository: AgentToolsRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AgentToolsUiState())
    internal val uiState: StateFlow<AgentToolsUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null

    fun selectToolScope(scopeId: String) {
        val normalized = AgentToolScopes.normalize(scopeId)
        val current = _uiState.value
        if (current.toolScopeId == normalized && current.groups.isNotEmpty()) return

        loadJob?.cancel()
        _uiState.value = AgentToolsUiState(toolScopeId = normalized, loading = true)
        loadJob = viewModelScope.launch {
            val result = runCatching { repository.load(normalized) }
            _uiState.update { state ->
                if (!state.matches(normalized)) {
                    state
                } else {
                    state.copy(
                        groups = result.getOrNull()?.groups ?: state.groups,
                        subagentModelConfigId = result.getOrNull()?.subagentModelConfigId
                            ?: state.subagentModelConfigId,
                        subagentModel = result.getOrNull()?.subagentModel ?: state.subagentModel,
                        modelConfigs = result.getOrNull()?.modelConfigs ?: state.modelConfigs,
                        characterImagePrompt = result.getOrNull()?.characterImagePrompt
                            ?: state.characterImagePrompt,
                        loading = false,
                        error = result.exceptionOrNull()?.message.orEmpty(),
                    )
                }
            }
        }
    }

    fun setPersonalToolGroupEnabled(id: String, enabled: Boolean) {
        val before = _uiState.value.groups.firstOrNull { it.id == id } ?: return
        val scopeId = AgentToolScopes.normalize(_uiState.value.toolScopeId)
        _uiState.update { state ->
            state.copy(groups = state.groups.map { if (it.id == id) it.copy(enabled = enabled) else it })
        }
        viewModelScope.launch {
            runCatching { repository.setGroupEnabled(scopeId, id, enabled) }
                .onFailure { error ->
                    _uiState.update { state ->
                        if (!state.matches(scopeId)) {
                            state
                        } else {
                            state.copy(
                                groups = state.groups.map { group ->
                                    if (group.id == id && group.enabled == enabled) {
                                        group.copy(enabled = before.enabled)
                                    } else {
                                        group
                                    }
                                },
                                error = error.message ?: "更新工具状态失败",
                            )
                        }
                    }
                }
        }
    }

    fun setRoleplayPlanEnabledFromSettingLibrary(scopeId: String, enabled: Boolean) {
        val normalizedScopeId = AgentToolScopes.normalize(scopeId)
        _uiState.update { state ->
            if (!state.matches(normalizedScopeId)) {
                state
            } else {
                state.copy(
                    groups = state.groups.map { group ->
                        if (group.id == AgentToolRequestPolicy.BuiltInRoleplayWorkflow) {
                            group.copy(enabled = enabled)
                        } else {
                            group
                        }
                    },
                )
            }
        }
        viewModelScope.launch {
            runCatching {
                repository.setGroupEnabled(
                    scopeId = normalizedScopeId,
                    groupId = AgentToolRequestPolicy.BuiltInRoleplayWorkflow,
                    enabled = enabled,
                    syncSettingLibrary = false,
                )
            }.onFailure { error ->
                _uiState.update { state ->
                    if (state.matches(normalizedScopeId)) {
                        state.copy(error = error.message ?: "更新角色扮演计划状态失败")
                    } else {
                        state
                    }
                }
            }
        }
    }

    fun setSubagentModel(configId: String, model: String) {
        val scopeId = AgentToolScopes.normalize(_uiState.value.toolScopeId)
        val previousConfigId = _uiState.value.subagentModelConfigId
        val previousModel = _uiState.value.subagentModel
        _uiState.update {
            it.copy(
                subagentModelConfigId = configId,
                subagentModel = model,
            )
        }
        viewModelScope.launch {
            runCatching { repository.setSubagentModel(scopeId, configId, model) }
                .onFailure { error ->
                    _uiState.update { state ->
                        if (
                            state.matches(scopeId) &&
                            state.subagentModelConfigId == configId &&
                            state.subagentModel == model
                        ) {
                            state.copy(
                                subagentModelConfigId = previousConfigId,
                                subagentModel = previousModel,
                                error = error.message ?: "更新子 Agent 模型失败",
                            )
                        } else {
                            state
                        }
                    }
                }
        }
    }

    fun saveModelConfig(
        config: ModelConfig,
        onFinished: (Result<ModelConfig>) -> Unit = {},
    ) {
        viewModelScope.launch {
            val result = runCatching { repository.saveModel(config) }
            result.onSuccess { saved ->
                _uiState.update { state ->
                    state.copy(
                        modelConfigs = state.modelConfigs.map { current ->
                            if (current.id == saved.id) saved else current
                        },
                    )
                }
            }
            onFinished(result)
        }
    }

    fun saveImageModelConfig(
        config: ModelConfig,
        onFinished: (Result<ModelConfig>) -> Unit = {},
    ) {
        viewModelScope.launch {
            val result = runCatching { repository.saveImageModel(config) }
            result.onSuccess { saved ->
                _uiState.update { state ->
                    state.copy(
                        modelConfigs = state.modelConfigs.map { current ->
                            when {
                                current.id == saved.id -> saved
                                saved.enabled && current.isImageGenerationConfig() -> current.copy(enabled = false)
                                else -> current
                            }
                        },
                    )
                }
            }
            onFinished(result)
        }
    }

    fun saveCharacterImagePrompt(
        prompt: String,
        onFinished: (Result<String>) -> Unit = {},
    ) {
        val scopeId = AgentToolScopes.normalize(_uiState.value.toolScopeId)
        viewModelScope.launch {
            val result = runCatching { repository.saveCharacterImagePrompt(scopeId, prompt) }
            result.onSuccess { saved ->
                _uiState.update { state ->
                    if (state.matches(scopeId)) state.copy(characterImagePrompt = saved) else state
                }
            }
            onFinished(result)
        }
    }

    fun refreshModels(
        config: ModelConfig,
        onFinished: (Result<ModelConfig>) -> Unit = {},
    ) {
        viewModelScope.launch {
            val result = runCatching { repository.refreshModelOptions(config) }
            result.onSuccess { refreshed ->
                _uiState.update { state ->
                    state.copy(
                        modelConfigs = state.modelConfigs.map { current ->
                            if (current.id == refreshed.id) refreshed else current
                        },
                    )
                }
            }
            onFinished(result)
        }
    }

    companion object {
        fun factory(repository: AgentToolsRepository): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    AgentToolsViewModel(repository) as T
            }
    }

    private fun AgentToolsUiState.matches(scopeId: String): Boolean =
        AgentToolScopes.normalize(scopeId) == AgentToolScopes.normalize(toolScopeId)
}
