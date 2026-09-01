package com.eleckoi.android.app.service

import com.eleckoi.android.engine.story.variables.config.VariableConfigRepository
import com.eleckoi.android.engine.story.variables.runtime.VariableRuntimeService
import com.eleckoi.android.engine.agent.api.AgentPermissionMode
import com.eleckoi.android.engine.workspace.storage.CreatorWorkspaceRepository
import com.eleckoi.android.feature.characters.data.CharacterRepository
import com.eleckoi.android.feature.characters.model.CharacterCard
import com.eleckoi.android.feature.characters.model.CharacterMode
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryRepository
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isOpeningEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.defaultOpeningMessage
import com.eleckoi.android.feature.chat.data.ChatSessionStore
import com.eleckoi.android.feature.chat.data.ChatSessionNotFoundException
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatSession
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.model.OpeningMessageId
import com.eleckoi.android.feature.preferences.UiPreferencesRepository
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import com.eleckoi.android.foundation.storage.newId
import com.eleckoi.android.foundation.storage.nowIso

internal class ChatSessionCoordinator(
    private val characters: CharacterRepository,
    private val sessions: ChatSessionStore,
    private val uiPreferences: UiPreferencesRepository,
    private val settingLibrary: SettingLibraryRepository,
    private val variableConfig: VariableConfigRepository,
    private val variableRuntime: VariableRuntimeService,
    private val creatorWorkspaces: CreatorWorkspaceRepository,
    private val modelSelections: ChatModelSelectionResolver,
    private val settleOrphanedPendingResponses: suspend (String) -> Unit,
) {
    fun requireCurrentCharacterMode(session: ChatSession) {
        requireCurrentCharacterMode(session.characterId, session.characterMode)
    }

    fun requireCurrentCharacterMode(characterId: String, requestedMode: String) {
        val currentMode = characters.characterById(characterId)
            ?.characterMode
            ?.let(::normalizeCharacterMode)
            ?: throw ElecKoiDataException("角色不存在")
        val normalizedRequestedMode = normalizeCharacterMode(requestedMode)
        if (currentMode != normalizedRequestedMode) {
            val oldLabel = CharacterMode.fromStorage(normalizedRequestedMode).label
            val currentLabel = CharacterMode.fromStorage(currentMode).label
            throw ElecKoiDataException(
                "这条聊天属于“${oldLabel}模式”，角色当前为“${currentLabel}模式”，不能跨模式继续对话",
            )
        }
    }

    suspend fun createChat(
        characterId: String,
        characterMode: String,
        permissionMode: AgentPermissionMode? = null,
    ): ChatSession {
        val character = characters.characterById(characterId)
            ?: throw ElecKoiDataException("角色不存在")
        val mode = normalizeCharacterMode(characterMode)
        val now = nowIso()
        val persona = sessions.personaSnapshot(character, mode)
        val variables = variableConfig.load(character.id)
        val openingMessage = if (CharacterMode.fromStorage(mode) == CharacterMode.Story) {
            settingLibrary.load(character.id).entries
                .firstOrNull { it.isOpeningEntry() && it.enabled }
                ?.defaultOpeningMessage()
        } else {
            null
        }
        val opening = if (CharacterMode.fromStorage(mode) == CharacterMode.Story) {
            openingMessage?.content?.trim().orEmpty()
        } else {
            openingSnapshot(persona)
        }
        val selectedInitialState = openingMessage?.initialVariableStateJson
            ?.takeIf(String::isNotBlank)
            ?: variables.initialStateJson.ifBlank { "{}" }
        val initialVariableState = if (variables.schemaCode.isNotBlank()) {
            variableRuntime.validateState(variables.schemaCode, selectedInitialState)
                .takeIf { it.ok }
                ?.normalizedStateJson
                ?.ifBlank { selectedInitialState }
                ?: selectedInitialState
        } else {
            selectedInitialState
        }
        val workspace = creatorWorkspaces.ensureCharacterModeWorkspace(
            characterId = character.id,
            characterMode = mode,
            name = "${character.name.ifBlank { "角色" }} · ${CharacterMode.fromStorage(mode).label}",
        )
        val initialMessages = opening.takeIf { it.isNotBlank() }?.let { content ->
            listOf(
                ChatMessage(
                    id = OpeningMessageId,
                    role = MessageRole.Assistant,
                    content = content,
                    createdAt = now,
                    variableStateJson = initialVariableState,
                ),
            )
        }.orEmpty()
        val session = ChatSession(
            id = newId(12),
            workspaceId = workspace.id,
            title = character.name.ifBlank { "新对话" },
            characterId = character.id,
            characterName = character.name,
            characterAvatar = character.avatar,
            characterPersona = persona,
            characterMode = mode,
            permissionMode = permissionMode ?: workspace.permissionMode,
            messages = initialMessages,
            modelSettings = modelSelections.default().let { selection ->
                if (selection.configId.isBlank() || selection.model.isBlank()) emptyMap()
                else mapOf("chat" to selection)
            },
            createdAt = now,
            updatedAt = now,
            initialVariableStateJson = initialVariableState,
            variableStateJson = initialVariableState,
        )
        sessions.replaceUnstartedWith(session)
        sessions.applyHistorySavePolicy(character.id)
        return session
    }

    suspend fun latestSession(
        character: CharacterSlot,
        characterMode: String,
    ): ChatSession? = sessions.latest(character, characterMode)?.let { ensureWorkspaceBinding(it) }

    suspend fun lastActiveChatSession(): ChatSession? {
        val sessionId = uiPreferences.lastActiveChatSessionId()
        if (sessionId.isBlank()) return null
        return loadRememberedSessionOrNull(sessionId)
    }

    suspend fun rememberedChatSession(characterId: String, characterMode: String): ChatSession? {
        val mode = normalizeCharacterMode(characterMode)
        val sessionId = uiPreferences.activeChatSessionId(characterId, mode)
        if (sessionId.isBlank()) return null
        return loadRememberedSessionOrNull(sessionId)
            ?.takeIf { session ->
                session.characterId == characterId &&
                    normalizeCharacterMode(session.characterMode) == mode
            }
    }

    private suspend fun loadRememberedSessionOrNull(sessionId: String): ChatSession? {
        return try {
            loadChat(sessionId, touch = false)
        } catch (_: ChatSessionNotFoundException) {
            // A remembered id is allowed to become stale after deletion or import. Clear only
            // that pointer; database, filesystem, and decoding failures must reach the caller.
            uiPreferences.removeActiveChatSessionId(sessionId)
            null
        }
    }

    suspend fun rememberChatSession(session: ChatSession): ChatSession {
        uiPreferences.setActiveChatSessionId(
            characterId = session.characterId,
            characterMode = CharacterMode.fromStorage(session.characterMode).storageValue,
            sessionId = session.id,
        )
        return session
    }

    suspend fun loadChat(sessionId: String, touch: Boolean): ChatSession {
        settleOrphanedPendingResponses(sessionId)
        return ensureWorkspaceBinding(sessions.load(sessionId, touch))
    }

    suspend fun ensureWorkspaceBinding(session: ChatSession): ChatSession {
        val mode = CharacterMode.fromStorage(session.characterMode)
        val existing = session.workspaceId.takeIf(String::isNotBlank)
            ?.let { creatorWorkspaces.get(it) }
            ?.takeIf { workspace ->
                workspace.linkedCharacterId == session.characterId &&
                    workspace.linkedCharacterMode == mode.storageValue
            }
        if (existing != null) return session

        val workspace = creatorWorkspaces.ensureCharacterModeWorkspace(
            characterId = session.characterId,
            characterMode = mode.storageValue,
            name = "${session.characterName.ifBlank { session.title }} · ${mode.label}",
        )
        return session.copy(workspaceId = workspace.id, updatedAt = nowIso()).also(sessions::write)
    }

    private fun openingSnapshot(persona: CharacterCard): String {
        return persona.opening.trim().takeIf { persona.showOpening }.orEmpty()
    }

    fun normalizeCharacterMode(value: String): String {
        return CharacterMode.fromStorage(value).storageValue
    }

}
