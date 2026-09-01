package com.eleckoi.android.compatibility.mvu.importer

import com.eleckoi.android.engine.story.variables.model.VariableConfig
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.VariableReadMode
import com.eleckoi.android.engine.story.variables.model.VariableValueType
import com.eleckoi.android.foundation.storage.newId
import org.json.JSONArray
import org.json.JSONObject

internal fun ParsedSchema.toConfig(
    initialState: JSONObject,
    rules: UpdateRules,
): VariableConfig {
    val objects = mutableListOf<VariableObjectConfig>()
    val variables = mutableListOf<VariableItemConfig>()

    fun appendNode(
        name: String,
        node: SchemaNode,
        parentId: String,
        order: Int,
        supplied: Any? = null,
        path: List<String> = listOf(name),
    ) {
        when (node) {
            is SchemaNode.ObjectNode -> {
                val objectId = "import-object-${newId(10)}"
                objects += VariableObjectConfig(
                    id = objectId,
                    name = name,
                    parentId = parentId,
                    description = node.description,
                    updateRule = rules.forPath(path),
                    order = order,
                    treeViewOrder = order,
                )
                val suppliedObject = supplied as? JSONObject
                node.fields.entries.forEachIndexed { index, entry ->
                    appendNode(
                        name = entry.key,
                        node = entry.value,
                        parentId = objectId,
                        order = index + 1,
                        supplied = suppliedObject?.opt(entry.key),
                        path = path + entry.key,
                    )
                }
            }

            is SchemaNode.RecordNode -> {
                val objectId = "import-object-${newId(10)}"
                objects += VariableObjectConfig(
                    id = objectId,
                    name = name.ifBlank { "动态对象" },
                    parentId = parentId,
                    description = node.description,
                    updateRule = "",
                    dynamicKey = true,
                    order = order,
                    treeViewOrder = order,
                )
                val value = node.value
                if (value is SchemaNode.ObjectNode) {
                    value.fields.entries.forEachIndexed { index, entry ->
                        appendNode(
                            name = entry.key,
                            node = entry.value,
                            parentId = objectId,
                            order = index + 1,
                            path = listOf(entry.key),
                        )
                    }
                }
            }

            is SchemaNode.ValueNode -> variables += VariableItemConfig(
                id = "import-variable-${newId(10)}",
                title = name,
                objectId = parentId,
                type = node.type,
                defaultValue = initialValue(supplied, node),
                description = node.description,
                updateRule = rules.forPath(path),
                readMode = VariableReadMode.OnDemand,
                order = order,
                treeViewOrder = order,
            )
        }
    }

    when (val root = root) {
        is SchemaNode.ObjectNode -> root.fields.entries.forEachIndexed { index, entry ->
            appendNode(entry.key, entry.value, "", index + 1, initialState.opt(entry.key))
        }

        is SchemaNode.RecordNode -> appendNode("动态对象", root, "", 1)
        is SchemaNode.ValueNode -> appendNode("值", root, "", 1)
    }
    val seeded = mergeDefaults(root, initialState)
    return VariableConfig(
        characterId = "",
        name = "变量配置",
        initialStateJson = (seeded as? JSONObject)?.toString(2)
            ?: JSONObject().put("值", seeded).toString(2),
        schemaCode = "const Schema = ${root.schemaCode()}",
        objects = objects,
        variables = variables,
        expandedObjectIds = objects.map(VariableObjectConfig::id),
    )
}

internal fun stateConfig(state: JSONObject, rules: UpdateRules): VariableConfig {
    val objects = mutableListOf<VariableObjectConfig>()
    val variables = mutableListOf<VariableItemConfig>()

    fun visit(value: JSONObject, parentId: String, parentPath: List<String>) {
        value.keys().asSequence().toList().forEachIndexed { index, key ->
            val path = parentPath + key
            val child = value.opt(key)
            if (child is JSONObject) {
                val id = "import-object-${newId(10)}"
                objects += VariableObjectConfig(
                    id = id,
                    name = key,
                    parentId = parentId,
                    updateRule = rules.forPath(path),
                    order = index + 1,
                    treeViewOrder = index + 1,
                )
                visit(child, id, path)
            } else if (child != null && child != JSONObject.NULL) {
                variables += VariableItemConfig(
                    id = "import-variable-${newId(10)}",
                    title = key,
                    objectId = parentId,
                    type = valueType(child),
                    defaultValue = if (child is String) child else child.toString(),
                    updateRule = rules.forPath(path),
                    readMode = VariableReadMode.OnDemand,
                    order = index + 1,
                    treeViewOrder = index + 1,
                )
            }
        }
    }

    visit(state, "", emptyList())
    return VariableConfig(
        characterId = "",
        name = "变量配置",
        initialStateJson = state.toString(2),
        objects = objects,
        variables = variables,
        expandedObjectIds = objects.map(VariableObjectConfig::id),
    )
}

private fun initialValue(supplied: Any?, node: SchemaNode.ValueNode): String {
    val value = supplied.takeUnless { it == null || it == JSONObject.NULL } ?: node.defaultValue
    return when (value) {
        null -> node.fallbackDefault()
        is String -> value
        else -> value.toString()
    }
}

private fun mergeDefaults(node: SchemaNode, supplied: Any?): Any = when (node) {
    is SchemaNode.ValueNode -> supplied.takeUnless { it == null || it == JSONObject.NULL }
        ?: node.jsonDefault()

    is SchemaNode.ObjectNode -> JSONObject().also { result ->
        val source = supplied as? JSONObject
        node.fields.forEach { (key, child) -> result.put(key, mergeDefaults(child, source?.opt(key))) }
        source?.keys()?.forEach { key -> if (!result.has(key)) result.put(key, source.get(key)) }
    }

    is SchemaNode.RecordNode -> (supplied as? JSONObject) ?: JSONObject()
}

private fun valueType(value: Any): String = when (value) {
    is Number -> VariableValueType.Number.raw
    is Boolean -> VariableValueType.Boolean.raw
    is JSONArray -> VariableValueType.Array.raw
    else -> VariableValueType.String.raw
}
