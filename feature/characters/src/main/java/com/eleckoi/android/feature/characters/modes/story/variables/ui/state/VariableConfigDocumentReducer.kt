package com.eleckoi.android.feature.characters.modes.story.variables.ui

import com.eleckoi.android.engine.story.variables.model.VariableConfig
import com.eleckoi.android.engine.story.variables.model.VariableConfigVersion
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.VariableInitializationObjectId

internal sealed interface VariableConfigDocumentAction {
    data class Sync(val config: VariableConfig) : VariableConfigDocumentAction
    data class Rename(val value: String) : VariableConfigDocumentAction
    data class UpdateSchema(val value: String) : VariableConfigDocumentAction
    data class SwitchVersion(val version: VariableConfigVersion) : VariableConfigDocumentAction
    data class CreateVersion(val id: String) : VariableConfigDocumentAction
    data class DeleteActiveVersion(val fallbackId: String) : VariableConfigDocumentAction
    data class ReplaceTree(
        val objects: List<VariableObjectConfig>,
        val variables: List<VariableItemConfig>,
        val expandedObjectIds: Set<String>? = null,
    ) : VariableConfigDocumentAction
    data class ReplaceObjects(val objects: List<VariableObjectConfig>) : VariableConfigDocumentAction
    data class ReplaceVariables(val variables: List<VariableItemConfig>) : VariableConfigDocumentAction
    data class SetExpanded(val objectIds: Set<String>) : VariableConfigDocumentAction
}

internal object VariableConfigDocumentReducer {
    fun reduce(
        document: VariableConfigDocument,
        action: VariableConfigDocumentAction,
    ): VariableConfigDocument = when (action) {
        is VariableConfigDocumentAction.Sync -> VariableConfigDocument.from(action.config)
        is VariableConfigDocumentAction.Rename -> {
            val renamed = document.copy(name = action.value.take(60))
            renamed.copy(versions = renamed.withCurrentVersion())
        }
        is VariableConfigDocumentAction.UpdateSchema -> document.copy(schemaCode = action.value)
        is VariableConfigDocumentAction.SwitchVersion -> {
            val versions = document.withCurrentVersion()
            document.copy(
                name = action.version.name,
                schemaCode = action.version.schemaCode,
                objects = action.version.objects,
                variables = action.version.variables,
                expandedObjectIds = action.version.expandedObjectIds.toSet(),
                versions = versions,
                activeVersionId = action.version.id,
            )
        }
        is VariableConfigDocumentAction.CreateVersion -> {
            val versions = document.withCurrentVersion() + VariableConfigVersion(
                id = action.id,
                name = "",
            )
            document.copy(
                name = "",
                schemaCode = "",
                objects = emptyList(),
                variables = emptyList(),
                expandedObjectIds = emptySet(),
                versions = versions,
                activeVersionId = action.id,
            )
        }
        is VariableConfigDocumentAction.DeleteActiveVersion -> {
            val remaining = document.versions
                .filterNot { it.id == document.activeVersionId }
                .ifEmpty { listOf(VariableConfigVersion(id = action.fallbackId)) }
            val next = remaining.first()
            document.copy(
                name = next.name,
                schemaCode = next.schemaCode,
                objects = next.objects,
                variables = next.variables,
                expandedObjectIds = next.expandedObjectIds.toSet(),
                versions = remaining,
                activeVersionId = next.id,
            )
        }
        is VariableConfigDocumentAction.ReplaceTree -> document.copy(
            objects = action.objects,
            variables = action.variables,
            expandedObjectIds = action.expandedObjectIds ?: document.expandedObjectIds,
        )
        is VariableConfigDocumentAction.ReplaceObjects -> {
            val objectIds = action.objects.map { it.id }.toSet()
            val normalizedObjects = action.objects.map { variableObject ->
                if (
                    variableObject.parentId.isBlank() ||
                    variableObject.parentId == VariableInitializationObjectId ||
                    variableObject.parentId !in objectIds
                ) {
                    variableObject.copy(parentId = "")
                } else {
                    variableObject
                }
            }
            document.copy(
                objects = normalizedObjects,
                variables = document.variables.map { item ->
                    when {
                        item.objectId == VariableInitializationObjectId -> item.copy(objectId = "")
                        item.objectId in objectIds -> item
                        else -> item.copy(objectId = "")
                    }
                },
                expandedObjectIds = document.expandedObjectIds.intersect(objectIds),
            )
        }
        is VariableConfigDocumentAction.ReplaceVariables ->
            document.copy(variables = action.variables)
        is VariableConfigDocumentAction.SetExpanded ->
            document.copy(expandedObjectIds = action.objectIds)
    }
}
