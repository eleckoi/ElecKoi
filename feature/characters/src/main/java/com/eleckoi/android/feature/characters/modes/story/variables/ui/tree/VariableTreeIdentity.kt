package com.eleckoi.android.feature.characters.modes.story.variables.ui

import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig

internal fun variableObjectNodeId(objectId: String): String = "object:$objectId"

internal fun variableItemNodeId(variableId: String): String = "variable:$variableId"

internal fun selectedObjectIdFromNodeId(
    nodeId: String,
    variables: List<VariableItemConfig>,
): String = when {
    nodeId.startsWith("object:") -> nodeId.removePrefix("object:")
    nodeId.startsWith("variable:") -> variables
        .firstOrNull { variableItemNodeId(it.id) == nodeId }
        ?.objectId
        .orEmpty()
    else -> ""
}

internal fun descendantVariableObjectIds(
    objectId: String,
    objects: List<VariableObjectConfig>,
): Set<String> {
    val childrenByParent = objects.groupBy { it.parentId }
    val result = mutableSetOf<String>()
    fun collect(parentId: String) {
        childrenByParent[parentId].orEmpty().forEach { child ->
            if (result.add(child.id)) {
                collect(child.id)
            }
        }
    }
    collect(objectId)
    return result
}
