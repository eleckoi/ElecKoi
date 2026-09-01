package com.eleckoi.android.app.service

import com.eleckoi.android.engine.story.variables.config.VariableConfigRepository
import com.eleckoi.android.engine.story.variables.model.VariableConfig
import com.eleckoi.android.feature.characters.modes.story.variables.api.VariableConfigService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOn

internal class VariableConfigServiceImpl(
    private val variableConfig: VariableConfigRepository,
) : VariableConfigService {
    override fun variableConfigFlow(characterId: String): Flow<VariableConfig> {
        return variableConfig.configFlow(characterId)
            .distinctUntilChanged()
            .flowOn(Dispatchers.IO)
    }

    override fun saveVariableConfig(characterId: String, config: VariableConfig): VariableConfig {
        return variableConfig.save(characterId, config)
    }

    override fun exportVariableConfig(characterId: String): String = variableConfig.exportJson(characterId)

    override fun importVariableConfig(characterId: String, json: String): VariableConfig {
        return variableConfig.importJson(characterId, json)
    }
}
