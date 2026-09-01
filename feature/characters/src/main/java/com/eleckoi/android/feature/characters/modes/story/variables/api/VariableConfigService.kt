package com.eleckoi.android.feature.characters.modes.story.variables.api

import com.eleckoi.android.engine.story.variables.model.VariableConfig
import kotlinx.coroutines.flow.Flow

interface VariableConfigService {
    fun variableConfigFlow(characterId: String): Flow<VariableConfig>
    fun saveVariableConfig(characterId: String, config: VariableConfig): VariableConfig
    fun exportVariableConfig(characterId: String): String
    fun importVariableConfig(characterId: String, json: String): VariableConfig
}
