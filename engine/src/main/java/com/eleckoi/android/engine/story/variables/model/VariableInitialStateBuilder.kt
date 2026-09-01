package com.eleckoi.android.engine.story.variables.model

import org.json.JSONArray
import org.json.JSONObject

fun generatedInitialStateJson(
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
): String {
    return buildStateObject(
        objects = objects,
        variables = variables,
        parentId = "",
        enabledOnly = true,
        includeDynamicTemplate = false,
    ).toString(2)
}

fun generatedInitialStatePreviewJson(
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
): String {
    return buildStateObject(
        objects = objects,
        variables = variables,
        parentId = "",
        enabledOnly = true,
        includeDynamicTemplate = true,
    ).toString(2)
}

fun generatedObjectStateJson(
    objectId: String,
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
): String {
    if (objects.none { it.id == objectId && !it.isInitializationObject() }) return "{}"
    return buildStateObject(
        objects = objects,
        variables = variables,
        parentId = objectId,
        enabledOnly = false,
        includeDynamicTemplate = true,
    ).toString(2)
}

private fun buildStateObject(
    objects: List<VariableObjectConfig>,
    variables: List<VariableItemConfig>,
    parentId: String,
    enabledOnly: Boolean,
    includeDynamicTemplate: Boolean,
): JSONObject {
    val objectById = objects
        .filterNot { it.isInitializationObject() }
        .associateBy { it.id }
    val childrenByParent = objectById.values
        .groupBy { it.parentId.takeIf { parentId -> parentId in objectById }.orEmpty() }
    val variablesByObject = variables.groupBy { item ->
        item.objectId.takeIf { it in objectById }.orEmpty()
    }

    fun objectEnabled(objectId: String): Boolean {
        val chain = generateSequence(objectById[objectId]) { parent -> objectById[parent.parentId] }.toList()
        return chain.all { it.enabled }
    }

    fun fill(target: JSONObject, currentParentId: String) {
        childrenByParent[currentParentId]
            .orEmpty()
            .filter { includeDynamicTemplate || !it.dynamicKey }
            .filter { !enabledOnly || (it.enabled && objectEnabled(it.id)) }
            .sortedWith(compareBy<VariableObjectConfig> { it.treeViewOrder }.thenBy { it.order }.thenBy { it.name })
            .forEach { child ->
                val name = child.name.trim().let { value ->
                    if (child.dynamicKey && includeDynamicTemplate) "<$value>" else value
                }
                if (name.isBlank()) return@forEach
                val childJson = JSONObject()
                fill(childJson, child.id)
                target.put(name, childJson)
            }

        variablesByObject[currentParentId]
            .orEmpty()
            .filter { !enabledOnly || (it.enabled && (currentParentId.isBlank() || objectEnabled(currentParentId))) }
            .sortedWith(compareBy<VariableItemConfig> { it.treeViewOrder }.thenBy { it.order }.thenBy { it.title })
            .forEach { item ->
                val name = item.title.trim()
                if (name.isBlank()) return@forEach
                target.put(name, item.defaultJsonValue())
            }
    }

    return JSONObject().also { fill(it, parentId) }
}

private fun VariableItemConfig.defaultJsonValue(): Any {
    return when (type) {
        VariableValueType.Number.raw -> defaultValue.trim().toJsonNumberOrDefault()
        VariableValueType.String.raw -> defaultValue
        VariableValueType.Boolean.raw -> defaultValue.trim().equals("true", ignoreCase = true)
        VariableValueType.Array.raw -> defaultValue.trim().toJsonArrayOrEmpty()
        else -> defaultValue
    }
}

private fun String.toJsonNumberOrDefault(): Number {
    val text = trim()
    if (text.isBlank()) return 0
    return text.toLongOrNull() ?: text.toDoubleOrNull() ?: 0
}

private fun String.toJsonArrayOrEmpty(): JSONArray {
    if (isBlank()) return JSONArray()
    return runCatching { JSONArray(this) }.getOrDefault(JSONArray())
}
