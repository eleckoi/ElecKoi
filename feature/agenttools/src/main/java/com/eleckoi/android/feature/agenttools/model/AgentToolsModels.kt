package com.eleckoi.android.feature.agenttools.model

import com.eleckoi.android.engine.generation.model.ModelConfig

internal enum class PersonalToolGroupSource {
    BuiltIn,
    Mcp,
    Extension,
}

internal data class PersonalToolEntry(
    val name: String,
    val displayName: String,
    val description: String = "",
)

internal data class PersonalToolGroupEntry(
    val id: String,
    val name: String,
    val description: String,
    val source: PersonalToolGroupSource,
    val sourceId: String = "",
    val enabled: Boolean = true,
    val tools: List<PersonalToolEntry> = emptyList(),
)

internal data class AgentToolsUiState(
    val toolScopeId: String = "",
    val groups: List<PersonalToolGroupEntry> = emptyList(),
    val subagentModelConfigId: String = "",
    val subagentModel: String = "",
    val modelConfigs: List<ModelConfig> = emptyList(),
    val characterImagePrompt: String = "",
    val loading: Boolean = false,
    val error: String = "",
)
