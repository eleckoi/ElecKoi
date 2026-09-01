package com.eleckoi.android.feature.characters.modes.story.variables.ui

import com.eleckoi.android.engine.story.variables.model.VariableInitializationObjectId
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig

internal fun variableTreeTitle(
    selectedNodeId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
): String = when {
    selectedNodeId.startsWith("object:") -> {
        val id = selectedNodeId.removePrefix("object:")
        objects.firstOrNull { it.id == id }?.name?.ifBlank { "未命名变量组" } ?: "变量组"
    }
    selectedNodeId.startsWith("variable:") -> {
        val id = selectedNodeId.removePrefix("variable:")
        variables.firstOrNull { it.id == id }?.title?.ifBlank { "未命名变量" } ?: "变量"
    }
    else -> "变量配置"
}

internal fun variableTreeKindLabel(selectedNodeId: String): String =
    if (selectedNodeId.startsWith("variable:")) "变量" else "变量组"

internal fun canDeleteVariableTreeNode(selectedNodeId: String): Boolean = when {
    selectedNodeId == VariableRootNodeId -> false
    selectedNodeId == variableObjectNodeId(VariableInitializationObjectId) -> false
    selectedNodeId.startsWith("object:") -> true
    selectedNodeId.startsWith("variable:") -> true
    else -> false
}

internal fun variableTreeBreadcrumb(
    selectedNodeId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
): String {
    val objectsById = objects.associateBy { it.id }
    val selectedObjectId = when {
        selectedNodeId.startsWith("object:") -> selectedNodeId.removePrefix("object:")
        selectedNodeId.startsWith("variable:") -> variables
            .firstOrNull { variableItemNodeId(it.id) == selectedNodeId }
            ?.objectId
            .orEmpty()
        else -> ""
    }
    val chain = generateSequence(objectsById[selectedObjectId]) { variableObject ->
        objectsById[variableObject.parentId]
    }.toList().asReversed()
    val parts = chain.mapTo(mutableListOf()) { it.name.ifBlank { "未命名变量组" } }
    if (selectedNodeId.startsWith("variable:")) {
        parts += variableTreeTitle(selectedNodeId, objects, variables)
    }
    return parts.joinToString(" / ").ifBlank { "未选择变量组" }
}

internal fun variableObjectJsonPointer(
    objectId: String,
    objects: List<VariableObjectConfig>,
): String {
    if (objectId == VariableInitializationObjectId) return VariableApiRootPath
    val variableObject = objects.firstOrNull { it.id == objectId } ?: return VariableApiRootPath
    return variablePathSegments(variableObject.parentId, objects)
        .plus(variableObject.name.ifBlank { "未命名变量组" })
        .toVariableJsonPointer()
}

internal fun variableItemJsonPointer(
    variableId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
): String {
    val variable = variables.firstOrNull { it.id == variableId } ?: return VariableApiRootPath
    return variablePathSegments(variable.objectId, objects)
        .plus(variable.title.ifBlank { "未命名变量" })
        .toVariableJsonPointer()
}

private fun variablePathSegments(
    objectId: String,
    objects: List<VariableObjectConfig>,
): List<String> {
    val objectsById = objects.associateBy { it.id }
    return generateSequence(objectsById[objectId]) { variableObject ->
        objectsById[variableObject.parentId]
    }
        .toList()
        .asReversed()
        .map { it.name.ifBlank { "未命名变量组" } }
}

private const val VariableApiRootPath = "/"

private fun List<String>.toVariableJsonPointer(): String =
    joinToString(separator = "/", prefix = "/") {
        it.replace("~", "~0").replace("/", "~1")
    }
