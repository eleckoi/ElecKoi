package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.api.SettingLibraryService
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryConversation
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrarySource
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryVersion
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

data class SettingLibraryUiState(
    val library: SettingLibrary? = null,
    val saving: Boolean = false,
    val errorMessage: String = "",
    /** Other characters' libraries, populated only once the import picker asks for them. */
    val importSources: List<SettingLibrarySource> = emptyList(),
    val loadingImportSources: Boolean = false,
    val conversationLibraries: List<SettingLibraryConversation> = emptyList(),
    val loadingConversationLibraries: Boolean = false,
    val savingConversationVersionId: String = "",
    val mutatingConversationId: String = "",
    val dynamicExpandedGroupIds: Map<String, Set<String>> = emptyMap(),
)

sealed interface SettingLibraryIntent {
    data object Clear : SettingLibraryIntent
    data class Load(val characterId: String) : SettingLibraryIntent
    data class Save(val characterId: String, val library: SettingLibrary) : SettingLibraryIntent
    data class Import(val characterId: String, val json: String) : SettingLibraryIntent
    data class Export(val characterId: String) : SettingLibraryIntent
    data class LoadImportSources(val characterId: String) : SettingLibraryIntent
    data class LoadConversationLibraries(val characterId: String) : SettingLibraryIntent
    data class SaveConversationVersion(
        val characterId: String,
        val sessionId: String,
        val name: String,
    ) : SettingLibraryIntent
    data class UpdateConversationEntry(
        val characterId: String,
        val sessionId: String,
        val entryId: String,
        val title: String,
        val content: String,
    ) : SettingLibraryIntent
    data class ReplaceConversationLibrary(
        val characterId: String,
        val sessionId: String,
        val library: SettingLibrary,
        val successMessage: String,
    ) : SettingLibraryIntent
    data class DeleteConversationEntry(
        val characterId: String,
        val sessionId: String,
        val entryId: String,
    ) : SettingLibraryIntent
    data class DeleteConversationGroup(
        val characterId: String,
        val sessionId: String,
        val groupId: String,
    ) : SettingLibraryIntent
    data class DeleteConversationSettings(
        val characterId: String,
        val sessionId: String,
    ) : SettingLibraryIntent
}

sealed interface SettingLibraryEffect {
    data class ExportReady(val json: String, val fileName: String) : SettingLibraryEffect
    data class ConversationVersionSaved(val name: String) : SettingLibraryEffect
    data object ConversationEntrySaved : SettingLibraryEffect
    data class ConversationLibraryChanged(val message: String) : SettingLibraryEffect
    data object ConversationEntryDeleted : SettingLibraryEffect
    data object ConversationGroupDeleted : SettingLibraryEffect
    data object ConversationSettingsDeleted : SettingLibraryEffect
}

class SettingLibraryViewModel(
    private val settingLibraryService: SettingLibraryService,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SettingLibraryUiState())
    val uiState: StateFlow<SettingLibraryUiState> = _uiState.asStateFlow()
    private val _effects = MutableSharedFlow<SettingLibraryEffect>()
    val effects: SharedFlow<SettingLibraryEffect> = _effects.asSharedFlow()
    private val currentCharacterId = MutableStateFlow("")
    private val saveMutex = Mutex()
    private val latestSaveRevision = mutableMapOf<String, Long>()
    private val conversationActions = SettingLibraryConversationActions(
        service = settingLibraryService,
        scope = viewModelScope,
        updateState = { transform -> _uiState.update(transform) },
        emitEffect = _effects::emit,
    )

    init {
        observeCurrentLibrary()
    }

    fun onIntent(intent: SettingLibraryIntent) {
        when (intent) {
            SettingLibraryIntent.Clear -> clear()
            is SettingLibraryIntent.Load -> loadSettingLibrary(intent.characterId)
            is SettingLibraryIntent.Save -> saveSettingLibrary(intent.characterId, intent.library)
            is SettingLibraryIntent.Import -> importSettingLibrary(intent.characterId, intent.json)
            is SettingLibraryIntent.Export -> exportSettingLibrary(intent.characterId)
            is SettingLibraryIntent.LoadImportSources -> loadImportSources(intent.characterId)
            is SettingLibraryIntent.LoadConversationLibraries -> conversationActions.loadLibraries(intent.characterId)
            is SettingLibraryIntent.SaveConversationVersion -> conversationActions.saveVersion(intent)
            is SettingLibraryIntent.UpdateConversationEntry -> conversationActions.updateEntry(intent)
            is SettingLibraryIntent.ReplaceConversationLibrary -> conversationActions.replaceLibrary(intent)
            is SettingLibraryIntent.DeleteConversationEntry -> conversationActions.deleteEntry(intent)
            is SettingLibraryIntent.DeleteConversationGroup -> conversationActions.deleteGroup(intent)
            is SettingLibraryIntent.DeleteConversationSettings -> conversationActions.deleteSettings(intent)
        }
    }

    /**
     * Reads a chosen export file into memory so its entries can be picked over. Nothing is written;
     * a bad file surfaces as an error message rather than a crash, because the user chose it from
     * a system picker and may well have chosen the wrong one.
     */
    fun parseImportFile(json: String): SettingLibraryVersion? {
        return runCatching { settingLibraryService.parseSettingLibraryFile(json) }
            .onFailure { error ->
                _uiState.update { it.copy(errorMessage = error.message ?: "设定库文件读取失败") }
            }
            .getOrNull()
    }

    /**
     * Reading every other card's library touches persistent storage once per character, so it runs
     * off the main thread and only when the picker is actually opened.
     */
    fun loadImportSources(characterId: String) {
        if (characterId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(loadingImportSources = true) }
            runCatching {
                withContext(Dispatchers.IO) { settingLibraryService.settingLibrarySources(characterId) }
            }.onSuccess { sources ->
                _uiState.update { it.copy(importSources = sources, loadingImportSources = false) }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        loadingImportSources = false,
                        errorMessage = error.message ?: "读取其他角色卡的设定库失败",
                    )
                }
            }
        }
    }

    fun updateDynamicExpandedGroups(sessionId: String, expandedGroupIds: Set<String>) {
        if (sessionId.isBlank()) return
        _uiState.update { state ->
            state.copy(
                dynamicExpandedGroupIds = state.dynamicExpandedGroupIds +
                    (sessionId to expandedGroupIds),
            )
        }
    }

    fun clear() {
        currentCharacterId.value = ""
        _uiState.update { SettingLibraryUiState() }
    }

    fun loadSettingLibrary(characterId: String) {
        if (characterId.isBlank()) return
        _uiState.update { state ->
            if (state.library?.characterId == characterId) {
                state.copy(saving = true)
            } else {
                state.copy(saving = true, library = null)
            }
        }
        currentCharacterId.value = characterId
    }

    private fun observeCurrentLibrary() {
        viewModelScope.launch {
            currentCharacterId.collectLatest { characterId ->
                if (characterId.isBlank()) return@collectLatest
                settingLibraryService.settingLibraryFlow(characterId)
                    .catch { error ->
                        _uiState.update {
                            it.copy(
                                saving = false,
                                errorMessage = error.message ?: "加载设定库失败",
                            )
                        }
                    }
                    .collectLatest { library ->
                        _uiState.update {
                            it.copy(
                                library = library,
                                saving = false,
                                errorMessage = "",
                            )
                        }
                    }
            }
        }
    }

    fun saveSettingLibrary(characterId: String, library: SettingLibrary) {
        if (characterId.isBlank()) return
        val revision = (latestSaveRevision[characterId] ?: 0L) + 1L
        latestSaveRevision[characterId] = revision
        viewModelScope.launch {
            _uiState.update { it.copy(saving = true) }
            saveMutex.withLock {
                if (latestSaveRevision[characterId] != revision) return@withLock
                runCatching {
                    withContext(Dispatchers.IO) { settingLibraryService.saveSettingLibrary(characterId, library) }
                }.onSuccess { saved ->
                    if (latestSaveRevision[characterId] == revision) {
                        _uiState.update {
                            it.copy(
                                library = saved,
                                saving = false,
                                errorMessage = "",
                            )
                        }
                    }
                }.onFailure { error ->
                    if (latestSaveRevision[characterId] == revision) {
                        _uiState.update {
                            it.copy(
                                saving = false,
                                errorMessage = error.message ?: "保存设定库失败",
                            )
                        }
                    }
                }
            }
        }
    }

    fun importSettingLibrary(characterId: String, json: String) {
        if (characterId.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(saving = true) }
            runCatching {
                withContext(Dispatchers.IO) { settingLibraryService.importSettingLibrary(characterId, json) }
            }.onSuccess { library ->
                _uiState.update {
                    it.copy(
                        library = library,
                        saving = false,
                        errorMessage = "",
                    )
                }
            }.onFailure { error ->
                _uiState.update {
                    it.copy(
                        saving = false,
                        errorMessage = error.message ?: "导入设定库失败",
                    )
                }
            }
        }
    }

    fun exportSettingLibrary(characterId: String) {
        if (characterId.isBlank()) return
        viewModelScope.launch {
            runCatching {
                withContext(Dispatchers.IO) { settingLibraryService.exportSettingLibrary(characterId) }
            }.onSuccess { json ->
                _uiState.update { it.copy(errorMessage = "") }
                val libraryName = _uiState.value.library?.name?.ifBlank { "setting-library" } ?: "setting-library"
                _effects.emit(SettingLibraryEffect.ExportReady(json, "$libraryName.json"))
            }.onFailure { error ->
                _uiState.update { it.copy(errorMessage = error.message ?: "导出设定库失败") }
            }
        }
    }

    companion object {
        fun factory(settingLibraryService: SettingLibraryService): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    if (modelClass.isAssignableFrom(SettingLibraryViewModel::class.java)) {
                        return SettingLibraryViewModel(settingLibraryService) as T
                    }
                    throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
                }
            }
        }
    }
}
