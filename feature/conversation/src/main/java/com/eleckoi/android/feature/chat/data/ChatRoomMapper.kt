package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentPermissionMode
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatSession
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.foundation.storage.room.ChatSessionEntity

internal fun ChatSession.toEntity(): ChatSessionEntity = ChatSessionEntity(
    id = id,
    workspaceId = workspaceId,
    title = title,
    characterId = characterId,
    characterName = characterName,
    characterAvatar = characterAvatar,
    characterMode = characterMode,
    permissionMode = permissionMode.name,
    characterPersonaJson = characterPersonaJsonString(characterPersona),
    modelSettingsJson = modelSettingsJsonString(modelSettings),
    initialVariableStateJson = initialVariableStateJson,
    variableStateJson = variableStateJson,
    historySummary = messages.asReversed().firstOrNull { it.content.isNotBlank() }
        ?.content.orEmpty().take(42),
    historyMessageCount = messages.size,
    historyUserMessageCount = messages.count { it.role == MessageRole.User },
    createdAt = createdAt,
    updatedAt = updatedAt,
)

internal fun chatSessionFromRoom(
    session: ChatSessionEntity,
    messages: List<ChatMessage>,
): ChatSession = ChatSession(
    id = session.id,
    workspaceId = session.workspaceId,
    title = session.title.ifBlank { session.characterName.ifBlank { "新对话" } },
    characterId = session.characterId,
    characterName = session.characterName,
    characterAvatar = session.characterAvatar,
    characterPersona = characterPersonaFromJsonString(
        value = session.characterPersonaJson,
        characterName = session.characterName,
        characterAvatar = session.characterAvatar,
    ),
    characterMode = session.characterMode,
    permissionMode = AgentPermissionMode.entries.firstOrNull {
        it.name.equals(session.permissionMode, ignoreCase = true)
    } ?: AgentPermissionMode.AskForApproval,
    messages = messages,
    createdAt = session.createdAt,
    updatedAt = session.updatedAt,
    modelSettings = modelSettingsFromJsonString(session.modelSettingsJson),
    initialVariableStateJson = session.initialVariableStateJson,
    variableStateJson = session.variableStateJson,
)
