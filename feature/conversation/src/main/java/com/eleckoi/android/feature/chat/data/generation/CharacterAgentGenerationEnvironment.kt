package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.generation.config.ModelConfigRepository
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.workspace.storage.CreatorWorkspaceRepository
import com.eleckoi.android.feature.characters.model.CharacterMode
import com.eleckoi.android.feature.chat.model.ChatDraft
import com.eleckoi.android.feature.chat.model.ChatSession
import com.eleckoi.android.feature.modelconfig.model.ChatModelSelection
import com.eleckoi.android.feature.modelconfig.model.ModelParameters
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import com.eleckoi.android.foundation.storage.nowIso

internal class CharacterAgentGenerationEnvironment(
    private val settings: ModelConfigRepository,
    private val workspaces: CreatorWorkspaceRepository,
    private val sessions: ChatSessionStore,
) {
    suspend fun ensureWorkspace(session: ChatSession): ChatSession {
        val mode = CharacterMode.fromStorage(session.characterMode)
        val existing = session.workspaceId.takeIf(String::isNotBlank)
            ?.let { workspaces.get(it) }
            ?.takeIf { workspace ->
                workspace.linkedCharacterId == session.characterId &&
                    workspace.linkedCharacterMode == mode.storageValue
            }
        val workspace = existing ?: workspaces.ensureCharacterModeWorkspace(
            characterId = session.characterId,
            characterMode = mode.storageValue,
            name = "${session.characterName.ifBlank { session.title }} · ${mode.label}",
        )
        return if (session.workspaceId == workspace.id) {
            session
        } else {
            session.copy(workspaceId = workspace.id, updatedAt = nowIso()).also(sessions::updateMetadata)
        }
    }

    fun selectedConfig(draft: ChatDraft): ModelConfig {
        val collection = settings.loadModelConfigCollection()
        val selection = draft.session.modelSettings["chat"]
        val configId = selection?.configId.orEmpty().ifBlank { draft.selectedModelConfig.id }
        val configured = collection.chatConfigs.firstOrNull { it.id == configId }
            ?: draft.selectedModelConfig
        val selectedModel = selection?.model.orEmpty().ifBlank { draft.selectedModel }
        val result = if (selectedModel.isNotBlank()) configured.copy(model = selectedModel) else configured
        if (result.id.isBlank() || result.model.isBlank()) {
            throw ElecKoiDataException("请先选择可用的 Agent 模型配置")
        }
        return result
    }

    fun applyModelSelection(session: ChatSession, config: ModelConfig): ChatSession {
        val current = session.modelSettings["chat"]
        val selection = ChatModelSelection(
            capability = "chat",
            configId = config.id,
            model = config.model,
            parameters = current?.parameters ?: ModelParameters(),
        )
        return session.copy(modelSettings = session.modelSettings + ("chat" to selection))
    }
}
