package com.eleckoi.android.feature.characters.modes.story.variables.ui

import com.eleckoi.android.engine.story.variables.model.VariableInitializationObjectId
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.isInitializationObject

internal enum class VariableTreeClipboardMode {
    Copy,
    Cut,
}

internal data class VariableTreeClipboard(
    val nodeId: String,
    val mode: VariableTreeClipboardMode,
)

internal data class VariableTreePasteResult(
    val selectedNodeId: String,
    val objects: List<VariableObjectConfig>? = null,
    val variables: List<VariableItemConfig>? = null,
)

internal fun planVariableTreePaste(
    clipboard: VariableTreeClipboard,
    targetObjectId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
    uniqueObjectId: (offset: Int) -> String,
    uniqueVariableId: (offset: Int) -> String,
): VariableTreePasteResult? {
    if (targetObjectId == VariableInitializationObjectId) return null
    return when (clipboard.mode) {
        VariableTreeClipboardMode.Copy -> when {
            clipboard.nodeId.startsWith("variable:") -> copyVariableToObject(
                variableId = clipboard.nodeId.removePrefix("variable:"),
                targetObjectId = targetObjectId,
                objects = objects,
                variables = variables,
                uniqueVariableId = uniqueVariableId,
            )
            clipboard.nodeId.startsWith("object:") -> copyObjectToObject(
                objectId = clipboard.nodeId.removePrefix("object:"),
                targetObjectId = targetObjectId,
                objects = objects,
                variables = variables,
                uniqueObjectId = uniqueObjectId,
                uniqueVariableId = uniqueVariableId,
            )
            else -> null
        }
        VariableTreeClipboardMode.Cut -> when {
            clipboard.nodeId.startsWith("variable:") -> moveVariableToObject(
                variableId = clipboard.nodeId.removePrefix("variable:"),
                targetObjectId = targetObjectId,
                objects = objects,
                variables = variables,
            )
            clipboard.nodeId.startsWith("object:") -> moveObjectToObject(
                objectId = clipboard.nodeId.removePrefix("object:"),
                targetObjectId = targetObjectId,
                objects = objects,
                variables = variables,
            )
            else -> null
        }
    }
}

private fun copyVariableToObject(
    variableId: String,
    targetObjectId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
    uniqueVariableId: (offset: Int) -> String,
): VariableTreePasteResult? {
    val source = variables.firstOrNull { it.id == variableId } ?: return null
    val nextId = uniqueVariableId(0)
    val copied = source.copy(
        id = nextId,
        title = copiedTitle(source.title.ifBlank { "未命名变量" }),
        objectId = targetObjectId,
        treeViewOrder = nextTreeViewOrder(targetObjectId, objects, variables),
        createdAt = "",
        updatedAt = "",
    )
    return VariableTreePasteResult(
        selectedNodeId = variableItemNodeId(nextId),
        variables = variables + copied,
    )
}

private fun copyObjectToObject(
    objectId: String,
    targetObjectId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
    uniqueObjectId: (offset: Int) -> String,
    uniqueVariableId: (offset: Int) -> String,
): VariableTreePasteResult? {
    val source = objects.firstOrNull { it.id == objectId }
        ?.takeUnless { it.isInitializationObject() }
        ?: return null
    if (targetObjectId == objectId || targetObjectId in descendantVariableObjectIds(objectId, objects)) {
        return null
    }
    val descendantIds = descendantVariableObjectIds(objectId, objects)
    val copyIds = descendantIds + objectId
    val sourceObjects = objects.filter { it.id in copyIds }
    val idMap = mutableMapOf<String, String>()
    sourceObjects.forEachIndexed { index, variableObject ->
        idMap[variableObject.id] = uniqueObjectId(index)
    }
    val rootNewId = idMap[objectId] ?: return null
    val copiedObjects = sourceObjects.map { variableObject ->
        val newId = idMap.getValue(variableObject.id)
        val newParentId = if (variableObject.id == objectId) {
            targetObjectId
        } else {
            idMap[variableObject.parentId].orEmpty()
        }
        variableObject.copy(
            id = newId,
            name = if (variableObject.id == objectId) {
                copiedTitle(source.name.ifBlank { "未命名变量组" })
            } else {
                variableObject.name
            },
            parentId = newParentId,
            treeViewOrder = if (variableObject.id == objectId) {
                nextTreeViewOrder(targetObjectId, objects, variables)
            } else {
                variableObject.treeViewOrder
            },
            createdAt = "",
            updatedAt = "",
        )
    }
    val copiedVariables = variables
        .filter { it.objectId in copyIds }
        .mapIndexed { index, item ->
            item.copy(
                id = uniqueVariableId(index),
                objectId = idMap[item.objectId].orEmpty(),
                createdAt = "",
                updatedAt = "",
            )
        }
    return VariableTreePasteResult(
        selectedNodeId = variableObjectNodeId(rootNewId),
        objects = objects + copiedObjects,
        variables = variables + copiedVariables,
    )
}

private fun moveVariableToObject(
    variableId: String,
    targetObjectId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
): VariableTreePasteResult? {
    if (targetObjectId.isBlank()) return null
    val source = variables.firstOrNull { it.id == variableId } ?: return null
    return VariableTreePasteResult(
        selectedNodeId = variableItemNodeId(variableId),
        variables = variables.map { item ->
            if (item.id == source.id) {
                item.copy(
                    objectId = targetObjectId,
                    treeViewOrder = nextTreeViewOrder(targetObjectId, objects, variables),
                )
            } else {
                item
            }
        },
    )
}

private fun moveObjectToObject(
    objectId: String,
    targetObjectId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
): VariableTreePasteResult? {
    val source = objects.firstOrNull { it.id == objectId }
        ?.takeUnless { it.isInitializationObject() }
        ?: return null
    if (targetObjectId == source.id || targetObjectId in descendantVariableObjectIds(source.id, objects)) {
        return null
    }
    return VariableTreePasteResult(
        selectedNodeId = variableObjectNodeId(objectId),
        objects = objects.map { variableObject ->
            if (variableObject.id == source.id) {
                variableObject.copy(
                    parentId = targetObjectId,
                    treeViewOrder = nextTreeViewOrder(targetObjectId, objects, variables),
                )
            } else {
                variableObject
            }
        },
    )
}

private fun nextTreeViewOrder(
    parentId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
): Int {
    val objectMax = objects.filter { it.parentId == parentId }.maxOfOrNull { it.treeViewOrder } ?: 0
    val variableMax = variables.filter { it.objectId == parentId }.maxOfOrNull { it.treeViewOrder } ?: 0
    return maxOf(objectMax, variableMax) + 1
}

private fun copiedTitle(title: String): String = "$title 副本".take(60)
