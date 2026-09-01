package com.eleckoi.android.feature.characters.modes.story.frontendbeauty.ui

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.eleckoi.android.engine.immersive.api.FrontendProjectService
import com.eleckoi.android.engine.immersive.model.FrontendProject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FrontendBeautyUiState(
    val characterId: String = "",
    val projects: List<FrontendProject> = emptyList(),
    val selectedProjectId: String? = null,
    val messageRendererEnabled: Boolean = true,
    val isImporting: Boolean = false,
    val errorMessage: String = "",
)

sealed interface FrontendBeautyIntent {
    data class Load(val characterId: String) : FrontendBeautyIntent
    data class Import(val uri: Uri) : FrontendBeautyIntent
    data class Select(val projectId: String?) : FrontendBeautyIntent
    data class SetMessageRendererEnabled(val enabled: Boolean) : FrontendBeautyIntent
    data class Delete(val projectId: String) : FrontendBeautyIntent
    data object DismissError : FrontendBeautyIntent
}

class FrontendBeautyViewModel(
    private val service: FrontendProjectService,
) : ViewModel() {
    private val _uiState = MutableStateFlow(FrontendBeautyUiState())
    val uiState: StateFlow<FrontendBeautyUiState> = _uiState.asStateFlow()
    private var workspaceJob: Job? = null

    fun onIntent(intent: FrontendBeautyIntent) {
        when (intent) {
            is FrontendBeautyIntent.Load -> load(intent.characterId)
            is FrontendBeautyIntent.Import -> import(intent.uri)
            is FrontendBeautyIntent.Select -> select(intent.projectId)
            is FrontendBeautyIntent.SetMessageRendererEnabled -> setMessageRendererEnabled(intent.enabled)
            is FrontendBeautyIntent.Delete -> delete(intent.projectId)
            FrontendBeautyIntent.DismissError -> _uiState.update { it.copy(errorMessage = "") }
        }
    }

    private fun load(characterId: String) {
        if (characterId.isBlank() || characterId == _uiState.value.characterId) return
        workspaceJob?.cancel()
        _uiState.update { FrontendBeautyUiState(characterId = characterId) }
        workspaceJob = viewModelScope.launch {
            service.frontendWorkspaceFlow(characterId).collectLatest { workspace ->
                _uiState.update {
                    it.copy(
                        projects = workspace.projects,
                        selectedProjectId = workspace.selectedProjectId,
                        messageRendererEnabled = workspace.messageRendererEnabled,
                    )
                }
            }
        }
    }

    private fun import(uri: Uri) {
        val characterId = _uiState.value.characterId
        if (characterId.isBlank() || _uiState.value.isImporting) return
        viewModelScope.launch {
            _uiState.update { it.copy(isImporting = true, errorMessage = "") }
            runCatching { service.importFrontendProject(characterId, uri) }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(errorMessage = error.message ?: "导入前端项目失败")
                    }
                }
            _uiState.update { it.copy(isImporting = false) }
        }
    }

    private fun select(projectId: String?) {
        val characterId = _uiState.value.characterId
        if (characterId.isBlank()) return
        viewModelScope.launch {
            runCatching { service.selectFrontendProject(characterId, projectId) }
                .onFailure { error ->
                    _uiState.update { it.copy(errorMessage = error.message ?: "切换前端失败") }
                }
        }
    }

    private fun setMessageRendererEnabled(enabled: Boolean) {
        val characterId = _uiState.value.characterId
        if (characterId.isBlank()) return
        _uiState.update { it.copy(messageRendererEnabled = enabled, errorMessage = "") }
        viewModelScope.launch {
            runCatching { service.setMessageRendererEnabled(characterId, enabled) }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            messageRendererEnabled = !enabled,
                            errorMessage = error.message ?: "保存消息前端渲染设置失败",
                        )
                    }
                }
        }
    }

    private fun delete(projectId: String) {
        val characterId = _uiState.value.characterId
        if (characterId.isBlank()) return
        viewModelScope.launch {
            runCatching { service.deleteFrontendProject(characterId, projectId) }
                .onFailure { error ->
                    _uiState.update { it.copy(errorMessage = error.message ?: "删除前端项目失败") }
                }
        }
    }

    companion object {
        fun factory(service: FrontendProjectService): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return FrontendBeautyViewModel(service) as T
                }
            }
        }
    }
}
