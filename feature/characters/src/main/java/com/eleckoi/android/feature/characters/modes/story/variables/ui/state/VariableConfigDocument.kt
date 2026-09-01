package com.eleckoi.android.feature.characters.modes.story.variables.ui

import com.eleckoi.android.engine.story.variables.model.VariableConfig
import com.eleckoi.android.engine.story.variables.model.VariableConfigVersion
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.generatedInitialStateJson

internal data class VariableConfigDocument(
    val name: String = "",
    val initialStateJson: String = "",
    val schemaCode: String = "",
    val objects: List<VariableObjectConfig> = emptyList(),
    val variables: List<VariableItemConfig> = emptyList(),
    val expandedObjectIds: Set<String> = emptySet(),
    val versions: List<VariableConfigVersion> = emptyList(),
    val activeVersionId: String = "",
) {
    fun editedConfig(source: VariableConfig): VariableConfig = source.copy(
        name = name,
        initialStateJson = if (objects.any { it.dynamicKey }) {
            initialStateJson
        } else {
            generatedInitialStateJson(objects, variables)
        },
        schemaCode = schemaCode,
        objects = objects,
        variables = variables,
        expandedObjectIds = expandedObjectIds.toList(),
        activeVersionId = activeVersionId,
        versions = withCurrentVersion(),
    )

    fun withCurrentVersion(): List<VariableConfigVersion> {
        if (activeVersionId.isBlank()) return versions
        val existing = versions.firstOrNull { it.id == activeVersionId }
        val current = VariableConfigVersion(
            id = activeVersionId,
            name = name,
            initialStateJson = initialStateJson,
            schemaCode = schemaCode,
            objects = objects,
            variables = variables,
            expandedObjectIds = expandedObjectIds.toList(),
            createdAt = existing?.createdAt.orEmpty(),
            updatedAt = existing?.updatedAt.orEmpty(),
        )
        return versions.filterNot { it.id == activeVersionId } + current
    }

    companion object {
        fun from(config: VariableConfig?): VariableConfigDocument = VariableConfigDocument(
            name = config?.name.orEmpty(),
            initialStateJson = config?.initialStateJson.orEmpty(),
            schemaCode = config?.schemaCode.orEmpty(),
            objects = config?.objects.orEmpty(),
            variables = config?.variables.orEmpty(),
            expandedObjectIds = config?.expandedObjectIds?.toSet().orEmpty(),
            versions = config?.versions.orEmpty(),
            activeVersionId = config?.activeVersionId.orEmpty(),
        )
    }
}
