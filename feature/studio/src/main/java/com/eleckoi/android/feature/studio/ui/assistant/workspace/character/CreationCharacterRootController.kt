package com.eleckoi.android.feature.studio.ui.assistant.workspace

import com.eleckoi.android.engine.workspace.model.CreatorWorkspace
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.feature.studio.api.CreatorAssistantService
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import com.eleckoi.android.feature.studio.ui.assistant.session.creationAssistantMessage
import com.eleckoi.android.feature.studio.ui.assistant.timeline.replaceWorkspace
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Owns character directory paging and character-root mutations for the selected workspace. */
internal class CreationCharacterRootController(
    private val scope: CoroutineScope,
    private val creatorService: CreatorAssistantService,
    private val state: () -> AiCreationAssistantUiState,
    private val updateState: ((AiCreationAssistantUiState) -> AiCreationAssistantUiState) -> Unit,
) {
    private var directoryJob: Job? = null

    fun loadDirectory(query: String, reset: Boolean) {
        directoryJob?.cancel()
        if (reset) {
            updateState {
                it.copy(
                    characterDirectoryQuery = query,
                    characterDirectory = emptyList(),
                    characterDirectoryNextCursor = "",
                )
            }
        }
        directoryJob = scope.launch { fetchDirectory(query, reset) }
    }

    fun onDirectoryQueryChanged(value: String) {
        val query = value.take(CharacterSearchLimit)
        updateState { it.copy(characterDirectoryQuery = query) }
        directoryJob?.cancel()
        directoryJob = scope.launch {
            delay(CharacterSearchDebounceMillis)
            fetchDirectory(query = query, reset = true)
        }
    }

    fun mutateRoots(
        failureMessage: String,
        mutation: suspend (workspaceId: String) -> CreatorWorkspace,
    ) {
        val snapshot = state()
        val workspaceId = snapshot.workspace?.id ?: return
        if (snapshot.isRunning || snapshot.isCharacterRootsUpdating) {
            updateState { it.copy(errorMessage = "请先停止当前任务，再修改角色范围") }
            return
        }
        updateState { it.copy(isCharacterRootsUpdating = true, errorMessage = "") }
        scope.launch {
            runCatching { mutation(workspaceId) }
                .onSuccess(::applyUpdatedRoots)
                .onFailure { error ->
                    updateState {
                        it.copy(
                            isCharacterRootsUpdating = false,
                            errorMessage = error.creationAssistantMessage(failureMessage),
                        )
                    }
                }
        }
    }

    fun createAndAttach(name: String, group: String) {
        val normalizedName = name.trim().take(CharacterNameLimit)
        if (normalizedName.isBlank()) return
        val snapshot = state()
        val workspaceId = snapshot.workspace?.id ?: return
        if (snapshot.isRunning || snapshot.isCharacterRootsUpdating) {
            updateState { it.copy(errorMessage = "请先停止当前任务，再创建角色") }
            return
        }
        updateState { it.copy(isCharacterRootsUpdating = true, errorMessage = "") }
        scope.launch {
            runCatching {
                creatorService.createAndAttachCreatorCharacter(workspaceId, normalizedName, group.trim())
            }.onSuccess { (workspace, _) ->
                applyUpdatedRoots(workspace)
                loadDirectory(query = state().characterDirectoryQuery, reset = true)
            }.onFailure { error ->
                updateState {
                    it.copy(
                        isCharacterRootsUpdating = false,
                        errorMessage = error.creationAssistantMessage("创建角色失败"),
                    )
                }
            }
        }
    }

    fun clear() {
        directoryJob?.cancel()
    }

    private suspend fun fetchDirectory(query: String, reset: Boolean) {
        val snapshot = state()
        val cursor = if (reset) "" else snapshot.characterDirectoryNextCursor
        if (!reset && cursor.isBlank()) return
        updateState { it.copy(isCharacterDirectoryLoading = true) }
        runCatching {
            val page = creatorService.searchCreatorCharacters(
                query = query,
                cursor = cursor,
                limit = CharacterDirectoryPageSize,
            )
            val roots = if (reset) {
                snapshot.workspace?.characterRoots.orEmpty().mapNotNull { root ->
                    creatorService.creatorCharacter(root.characterId)
                }
            } else {
                emptyList<CharacterSlot>()
            }
            page to roots
        }.onSuccess { (page, roots) ->
            updateState { current ->
                if (current.characterDirectoryQuery != query) return@updateState current
                val items = if (reset) page.items else {
                    (current.characterDirectory + page.items).distinctBy { it.id }
                }
                current.copy(
                    characterDirectory = items,
                    creatorRootCharacters = if (reset) roots else current.creatorRootCharacters,
                    characterDirectoryNextCursor = page.nextCursor,
                    isCharacterDirectoryLoading = false,
                )
            }
        }.onFailure { error ->
            if (error is CancellationException) return@onFailure
            updateState {
                it.copy(
                    isCharacterDirectoryLoading = false,
                    errorMessage = error.creationAssistantMessage("加载角色目录失败"),
                )
            }
        }
    }

    private fun applyUpdatedRoots(updated: CreatorWorkspace) {
        updateState { current ->
            val knownCharacters = (current.creatorRootCharacters + current.characterDirectory)
                .associateBy { it.id }
            current.copy(
                workspaces = current.workspaces.replaceWorkspace(updated),
                workspace = if (current.workspace?.id == updated.id) updated else current.workspace,
                characterId = updated.linkedCharacterId.orEmpty(),
                creatorRootCharacters = updated.characterRoots.mapNotNull { root ->
                    knownCharacters[root.characterId]
                },
                isCharacterRootsUpdating = false,
            )
        }
    }

    private companion object {
        const val CharacterNameLimit = 80
        const val CharacterSearchLimit = 80
        const val CharacterDirectoryPageSize = 20
        const val CharacterSearchDebounceMillis = 220L
    }
}
