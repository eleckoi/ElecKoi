package com.eleckoi.android.feature.agenttools.data

import com.eleckoi.android.engine.agent.tools.AgentToolCatalogStore
import com.eleckoi.android.engine.agent.tools.AgentToolGroupSource
import com.eleckoi.android.engine.agent.tools.AgentToolRequestPolicy
import com.eleckoi.android.engine.agent.tools.AgentToolScopes
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.isImageGenerationConfig
import com.eleckoi.android.feature.agenttools.model.PersonalToolEntry
import com.eleckoi.android.feature.agenttools.model.PersonalToolGroupEntry
import com.eleckoi.android.feature.agenttools.model.PersonalToolGroupSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Persistent per-character switches for the tools exposed by the active DSH composition. */
class AgentToolsRepository(
    private val toolCatalogStore: AgentToolCatalogStore,
    private val modelConfigs: () -> List<ModelConfig>,
    private val saveModelConfig: (ModelConfig) -> ModelConfig,
    private val refreshModels: (ModelConfig) -> ModelConfig,
    private val loadCharacterImagePrompt: (scopeId: String) -> String = { "" },
    private val persistCharacterImagePrompt: (scopeId: String, prompt: String) -> String = { _, prompt -> prompt },
    private val syncRoleplayPlanEntryEnabled: (scopeId: String, enabled: Boolean) -> Unit = { _, _ -> },
) {
    internal suspend fun load(scopeId: String): AgentToolsSnapshot = withContext(Dispatchers.IO) {
        val availableModels = modelConfigs()
        val storedSubagentModelId = toolCatalogStore.subagentModelConfigId(scopeId)
        val effectiveSubagentModelId = storedSubagentModelId.takeIf { storedId ->
            availableModels.any { it.id == storedId }
        }.orEmpty()
        val selectedConfig = availableModels.firstOrNull { it.id == effectiveSubagentModelId }
        val effectiveSubagentModel = if (selectedConfig == null) {
            ""
        } else {
            toolCatalogStore.subagentModel(scopeId).ifBlank { selectedConfig.model }
        }
        if (storedSubagentModelId.isNotBlank() && effectiveSubagentModelId.isBlank()) {
            toolCatalogStore.setSubagentModel(scopeId, "", "")
        }
        val imageModelConfigIds = listOf(
            AgentToolRequestPolicy.BuiltInAutoIllustration,
            AgentToolRequestPolicy.BuiltInCreator,
        ).associateWith { groupId ->
            val storedId = toolCatalogStore.toolModelConfigId(scopeId, groupId)
            val effectiveId = storedId.takeIf { candidate ->
                availableModels.any { it.id == candidate && it.isImageGenerationConfig() }
            }.orEmpty()
            if (storedId.isNotBlank() && effectiveId.isBlank()) {
                toolCatalogStore.setToolModelConfigId(scopeId, groupId, "")
            }
            effectiveId
        }
        AgentToolsSnapshot(
            groups = toolCatalogStore.groups(scopeId)
                .filterNot { group ->
                    group.id == AgentToolRequestPolicy.BuiltInAutoIllustration &&
                        AgentToolScopes.characterId(scopeId) == null
                }
                .map { group ->
                PersonalToolGroupEntry(
                    id = group.id,
                    name = group.name,
                    description = group.description,
                    source = when (group.source) {
                        AgentToolGroupSource.BuiltIn -> PersonalToolGroupSource.BuiltIn
                        AgentToolGroupSource.Mcp -> PersonalToolGroupSource.Mcp
                        AgentToolGroupSource.Extension -> PersonalToolGroupSource.Extension
                    },
                    sourceId = group.sourceId,
                    enabled = group.enabled,
                    tools = group.members.map { member ->
                        PersonalToolEntry(
                            name = member.name,
                            displayName = member.displayName,
                            description = member.description,
                        )
                    },
                )
            },
            subagentModelConfigId = effectiveSubagentModelId,
            subagentModel = effectiveSubagentModel,
            modelConfigs = availableModels,
            imageModelConfigIds = imageModelConfigIds,
            characterImagePrompt = loadCharacterImagePrompt(scopeId),
        )
    }

    suspend fun setGroupEnabled(
        scopeId: String,
        groupId: String,
        enabled: Boolean,
        syncSettingLibrary: Boolean = true,
    ) = withContext(Dispatchers.IO) {
        val previous = toolCatalogStore.groups(scopeId)
            .firstOrNull { it.id == groupId }
            ?.enabled
        try {
            toolCatalogStore.setEnabled(scopeId, groupId, enabled)
            if (
                syncSettingLibrary &&
                groupId == AgentToolRequestPolicy.BuiltInRoleplayWorkflow
            ) {
                syncRoleplayPlanEntryEnabled(scopeId, enabled)
            }
        } catch (error: Throwable) {
            previous?.let { toolCatalogStore.setEnabled(scopeId, groupId, it) }
            throw error
        }
    }

    suspend fun setSubagentModel(scopeId: String, configId: String, model: String) =
        withContext(Dispatchers.IO) {
            toolCatalogStore.setSubagentModel(scopeId, configId, model)
        }

    suspend fun setImageModel(scopeId: String, groupId: String, configId: String) =
        withContext(Dispatchers.IO) {
            require(
                groupId == AgentToolRequestPolicy.BuiltInAutoIllustration ||
                    groupId == AgentToolRequestPolicy.BuiltInCreator,
            ) { "当前工具组不使用图片生成模型" }
            val selected = modelConfigs().firstOrNull {
                it.id == configId && it.isImageGenerationConfig()
            } ?: error("图片生成模型不存在")
            toolCatalogStore.setToolModelConfigId(scopeId, groupId, selected.id)
        }

    suspend fun saveModel(config: ModelConfig): ModelConfig = withContext(Dispatchers.IO) {
        saveModelConfig(config)
    }

    suspend fun saveImageModel(config: ModelConfig): ModelConfig = withContext(Dispatchers.IO) {
        require(config.isImageGenerationConfig()) { "只能在这里保存图片生成模型" }
        saveModelConfig(config)
    }

    suspend fun saveCharacterImagePrompt(scopeId: String, prompt: String): String =
        withContext(Dispatchers.IO) {
            persistCharacterImagePrompt(scopeId, prompt.trim().take(4_000))
        }

    suspend fun refreshModelOptions(config: ModelConfig): ModelConfig = withContext(Dispatchers.IO) {
        refreshModels(config)
    }
}

internal data class AgentToolsSnapshot(
    val groups: List<PersonalToolGroupEntry>,
    val subagentModelConfigId: String,
    val subagentModel: String,
    val modelConfigs: List<ModelConfig>,
    val imageModelConfigIds: Map<String, String>,
    val characterImagePrompt: String,
)
