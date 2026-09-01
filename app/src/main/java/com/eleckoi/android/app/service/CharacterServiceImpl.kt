package com.eleckoi.android.app.service

import com.eleckoi.android.engine.immersive.project.FrontendProjectRepository
import com.eleckoi.android.engine.story.variables.config.VariableConfigRepository
import com.eleckoi.android.engine.workspace.storage.CreatorWorkspaceRepository
import com.eleckoi.android.feature.characters.data.CharacterRepository
import com.eleckoi.android.feature.characters.api.CharacterService
import com.eleckoi.android.feature.characters.model.AvatarSlot
import com.eleckoi.android.feature.characters.model.CharacterCard
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.feature.characters.model.CharactersPayload
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryRepository
import com.eleckoi.android.feature.chat.data.ChatSessionStore
import com.eleckoi.android.feature.chat.ui.blocks.markdown.MarkdownRebuildableCaches
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOn

internal class CharacterServiceImpl(
    private val characters: CharacterRepository,
    private val sessions: ChatSessionStore,
    private val settingLibrary: SettingLibraryRepository,
    private val variableConfig: VariableConfigRepository,
    private val frontendProjects: FrontendProjectRepository,
    private val creatorWorkspaces: CreatorWorkspaceRepository,
    private val initializeCharacterTools: (characterId: String) -> Unit,
) : CharacterService {
    override val characterCollectionFlow: Flow<CharactersPayload> = characters.charactersFlow()
        .distinctUntilChanged()
        .flowOn(Dispatchers.IO)

    override suspend fun saveCharacterCollection(payload: CharactersPayload): CharactersPayload {
        val saved = characters.saveCharacters(payload)
        return saved.also {
            val retainedCharacterIds = it.items.map { item -> item.id }
            ensureCharacterContainers(retainedCharacterIds)
            sessions.deleteExceptCharacters(retainedCharacterIds)
            settingLibrary.deleteExceptCharacters(retainedCharacterIds)
            variableConfig.deleteExceptCharacters(retainedCharacterIds)
            frontendProjects.deleteExceptCharacters(retainedCharacterIds)
            deleteCharacterWorkspaces(retainedCharacterIds.toSet(), deleteMatching = false)
            creatorWorkspaces.deleteCharacterContainersExcept(retainedCharacterIds.toSet())
        }
    }

    override suspend fun createCharacter(group: String): CharacterSlot {
        val character = characters.createCharacter(group)
        creatorWorkspaces.ensureCharacterContainer(character.id)
        initializeCharacterTools(character.id)
        return character
    }

    override suspend fun createCharacterGroup(name: String): CharactersPayload {
        return characters.createCharacterGroup(name)
    }

    override fun selectCharacter(characterId: String): CharactersPayload {
        return characters.selectCharacter(characterId)
    }

    override suspend fun toggleAllCharactersExpanded(): CharactersPayload {
        return characters.toggleAllCharactersExpanded()
    }

    override suspend fun toggleCharacterGroupExpanded(group: String): CharactersPayload {
        return characters.toggleCharacterGroupExpanded(group)
    }

    override suspend fun deleteCharacters(characterIds: List<String>): CharactersPayload {
        val deleted = characters.deleteCharacters(characterIds)
        creatorWorkspaces.detachCharacterRootsFor(characterIds.toSet())
        val deletedSessionIds = sessions.deleteForCharacters(characterIds)
        settingLibrary.deleteForCharacters(characterIds)
        variableConfig.deleteForCharacters(characterIds)
        frontendProjects.deleteForCharacters(characterIds)
        deleteCharacterWorkspaces(characterIds.toSet(), deleteMatching = true)
        characterIds.forEach { creatorWorkspaces.deleteCharacterContainer(it) }
        MarkdownRebuildableCaches.clearAfterConversationDeletion(deletedSessionIds)
        return deleted
    }

    override suspend fun importCharacters(json: String): CharactersPayload {
        val payload = characters.importCharacters(json)
        ensureCharacterContainers(payload.items.map { it.id })
        return payload
    }

    override fun exportCharacters(): String = characters.exportCharacters()

    override fun saveCharacterAvatars(
        characterId: String,
        files: Map<AvatarSlot, File>,
    ): CharacterSlot = characters.saveCharacterAvatars(characterId, files)

    override fun clearCharacterAvatarSlots(
        characterId: String,
        slots: Set<AvatarSlot>,
    ): CharacterSlot = characters.clearCharacterAvatarSlots(characterId, slots)

    override fun saveCharacterCover(
        characterId: String,
        coverFile: File,
    ): CharacterSlot = characters.saveCharacterCover(characterId, coverFile)

    override fun saveCharacterPersona(characterId: String, persona: CharacterCard): CharacterSlot {
        return characters.saveCharacterPersona(characterId, persona)
    }

    override fun saveCharacterMode(characterId: String, characterMode: String): CharactersPayload {
        return characters.saveCharacterMode(characterId, characterMode)
    }

    private suspend fun ensureCharacterContainers(characterIds: Collection<String>) {
        characterIds.distinct().forEach { characterId ->
            creatorWorkspaces.ensureCharacterContainer(characterId)
        }
    }

    private suspend fun deleteCharacterWorkspaces(
        characterIds: Set<String>,
        deleteMatching: Boolean,
    ) {
        if (characterIds.isEmpty() && deleteMatching) return
        creatorWorkspaces.list()
            .filter { workspace ->
                val characterId = workspace.linkedCharacterId ?: return@filter false
                workspace.linkedCharacterMode != null &&
                    ((characterId in characterIds) == deleteMatching)
            }
            .forEach { workspace -> creatorWorkspaces.delete(workspace.id) }
    }
}
