package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.api.SettingLibraryService
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Coordinates conversation-scoped setting edits while the ViewModel owns only screen state. */
internal class SettingLibraryConversationActions(
    private val service: SettingLibraryService,
    private val scope: CoroutineScope,
    private val updateState: (((SettingLibraryUiState) -> SettingLibraryUiState) -> Unit),
    private val emitEffect: suspend (SettingLibraryEffect) -> Unit,
) {
    fun loadLibraries(characterId: String) {
        if (characterId.isBlank()) return
        scope.launch {
            updateState { it.copy(loadingConversationLibraries = true) }
            runCatching {
                withContext(Dispatchers.IO) {
                    service.conversationSettingLibraries(characterId)
                }
            }.onSuccess { libraries ->
                updateState {
                    it.copy(
                        conversationLibraries = libraries,
                        loadingConversationLibraries = false,
                        errorMessage = "",
                    )
                }
            }.onFailure { error ->
                updateState {
                    it.copy(
                        loadingConversationLibraries = false,
                        errorMessage = error.message ?: "读取对话设定失败",
                    )
                }
            }
        }
    }

    fun saveVersion(intent: SettingLibraryIntent.SaveConversationVersion) {
        if (intent.characterId.isBlank() || intent.sessionId.isBlank()) return
        scope.launch {
            updateState {
                it.copy(
                    savingConversationVersionId = intent.sessionId,
                    errorMessage = "",
                )
            }
            runCatching {
                withContext(Dispatchers.IO) {
                    service.saveConversationSettingVersion(
                        characterId = intent.characterId,
                        sessionId = intent.sessionId,
                        name = intent.name,
                    )
                }
            }.onSuccess { library ->
                updateState {
                    it.copy(
                        library = library,
                        savingConversationVersionId = "",
                        errorMessage = "",
                    )
                }
                emitEffect(SettingLibraryEffect.ConversationVersionSaved(intent.name.trim()))
            }.onFailure { error ->
                updateState {
                    it.copy(
                        savingConversationVersionId = "",
                        errorMessage = error.message ?: "保存设定版本失败",
                    )
                }
            }
        }
    }

    fun updateEntry(intent: SettingLibraryIntent.UpdateConversationEntry) {
        if (intent.characterId.isBlank() || intent.sessionId.isBlank() || intent.entryId.isBlank()) return
        scope.launch {
            updateState { it.copy(mutatingConversationId = intent.sessionId, errorMessage = "") }
            runCatching {
                withContext(Dispatchers.IO) {
                    service.updateConversationSettingEntry(
                        characterId = intent.characterId,
                        sessionId = intent.sessionId,
                        entryId = intent.entryId,
                        title = intent.title,
                        content = intent.content,
                    )
                }
            }.onSuccess { library ->
                replaceLibrary(intent.sessionId, library)
                emitEffect(SettingLibraryEffect.ConversationEntrySaved)
            }.onFailure { error ->
                updateState {
                    it.copy(
                        mutatingConversationId = "",
                        errorMessage = error.message ?: "保存动态设定失败",
                    )
                }
            }
        }
    }

    fun deleteEntry(intent: SettingLibraryIntent.DeleteConversationEntry) {
        if (intent.characterId.isBlank() || intent.sessionId.isBlank() || intent.entryId.isBlank()) return
        scope.launch {
            updateState { it.copy(mutatingConversationId = intent.sessionId, errorMessage = "") }
            runCatching {
                withContext(Dispatchers.IO) {
                    service.deleteConversationSettingEntry(
                        characterId = intent.characterId,
                        sessionId = intent.sessionId,
                        entryId = intent.entryId,
                    )
                }
            }.onSuccess { library ->
                replaceLibrary(intent.sessionId, library)
                emitEffect(SettingLibraryEffect.ConversationEntryDeleted)
            }.onFailure { error ->
                updateState {
                    it.copy(
                        mutatingConversationId = "",
                        errorMessage = error.message ?: "删除动态设定条目失败",
                    )
                }
            }
        }
    }

    fun deleteGroup(intent: SettingLibraryIntent.DeleteConversationGroup) {
        if (intent.characterId.isBlank() || intent.sessionId.isBlank() || intent.groupId.isBlank()) return
        scope.launch {
            updateState { it.copy(mutatingConversationId = intent.sessionId, errorMessage = "") }
            runCatching {
                withContext(Dispatchers.IO) {
                    service.deleteConversationSettingGroup(
                        characterId = intent.characterId,
                        sessionId = intent.sessionId,
                        groupId = intent.groupId,
                    )
                }
            }.onSuccess { library ->
                replaceLibrary(intent.sessionId, library)
                emitEffect(SettingLibraryEffect.ConversationGroupDeleted)
            }.onFailure { error ->
                updateState {
                    it.copy(
                        mutatingConversationId = "",
                        errorMessage = error.message ?: "删除动态设定文件夹失败",
                    )
                }
            }
        }
    }

    fun replaceLibrary(intent: SettingLibraryIntent.ReplaceConversationLibrary) {
        if (intent.characterId.isBlank() || intent.sessionId.isBlank()) return
        scope.launch {
            updateState { it.copy(mutatingConversationId = intent.sessionId, errorMessage = "") }
            runCatching {
                withContext(Dispatchers.IO) {
                    service.replaceConversationSettingLibrary(
                        characterId = intent.characterId,
                        sessionId = intent.sessionId,
                        library = intent.library,
                    )
                }
            }.onSuccess { library ->
                replaceLibrary(intent.sessionId, library)
                emitEffect(SettingLibraryEffect.ConversationLibraryChanged(intent.successMessage))
            }.onFailure { error ->
                updateState {
                    it.copy(
                        mutatingConversationId = "",
                        errorMessage = error.message ?: "修改动态设定失败",
                    )
                }
            }
        }
    }

    fun deleteSettings(intent: SettingLibraryIntent.DeleteConversationSettings) {
        if (intent.characterId.isBlank() || intent.sessionId.isBlank()) return
        scope.launch {
            updateState { it.copy(mutatingConversationId = intent.sessionId, errorMessage = "") }
            runCatching {
                withContext(Dispatchers.IO) {
                    service.deleteConversationSettings(intent.characterId, intent.sessionId)
                }
            }.onSuccess {
                updateState { state ->
                    state.copy(
                        conversationLibraries = state.conversationLibraries.filterNot {
                            it.sessionId == intent.sessionId
                        },
                        dynamicExpandedGroupIds = state.dynamicExpandedGroupIds - intent.sessionId,
                        mutatingConversationId = "",
                        errorMessage = "",
                    )
                }
                emitEffect(SettingLibraryEffect.ConversationSettingsDeleted)
            }.onFailure { error ->
                updateState {
                    it.copy(
                        mutatingConversationId = "",
                        errorMessage = error.message ?: "删除动态设定失败",
                    )
                }
            }
        }
    }

    private fun replaceLibrary(sessionId: String, library: SettingLibrary) {
        updateState { state -> state.withConversationLibrary(sessionId, library) }
    }
}
