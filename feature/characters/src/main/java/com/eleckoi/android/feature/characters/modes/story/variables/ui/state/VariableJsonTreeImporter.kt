package com.eleckoi.android.feature.characters.modes.story.variables.ui

import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.VariableReadMode
import com.eleckoi.android.engine.story.variables.model.VariableInitializationObjectId
import com.eleckoi.android.engine.story.variables.model.VariableInitializationObjectName
import com.eleckoi.android.engine.story.variables.model.VariableValueType
import com.eleckoi.android.engine.story.variables.model.isInitializationObject
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import com.eleckoi.android.foundation.serialization.ElecKoiPrettyJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

internal class VariableJsonTreeImporter(
    private val objectId: (offset: Int) -> String,
    private val variableId: (offset: Int) -> String,
) {
    fun replaceChildren(
        targetObjectId: String,
        rawJson: String,
        objects: List<VariableObjectConfig>,
        variables: List<VariableItemConfig>,
        expandedObjectIds: Set<String>,
    ): VariableJsonTreeImportResult {
        val target = objects.firstOrNull { it.id == targetObjectId }
            ?.takeUnless { it.isInitializationObject() }
            ?: return VariableJsonTreeImportResult.Failure("变量组不存在")
        val parsed = runCatching { ElecKoiJson.parseToJsonElement(rawJson) as? JsonObject }
            .getOrNull()
            ?: return VariableJsonTreeImportResult.Failure("请输入有效的 JSON 对象")
        validateObject(parsed)?.let { return VariableJsonTreeImportResult.Failure(it) }

        val descendantIds = descendantIds(targetObjectId, objects)
        val removedObjectIds = descendantIds.toSet()
        val removedVariableParentIds = removedObjectIds + targetObjectId
        val previousObjectsByPath = objects
            .filter { it.id in removedObjectIds }
            .mapNotNull { variableObject ->
                relativeObjectPath(
                    targetObjectId = targetObjectId,
                    variableObject = variableObject,
                    objects = objects,
                )?.let { path -> path.pathKey() to variableObject }
            }
            .toMap()
        val previousVariablesByPath = variables
            .filter { it.objectId in removedVariableParentIds }
            .mapNotNull { variable ->
                relativeVariablePath(
                    targetObjectId = targetObjectId,
                    variable = variable,
                    objects = objects,
                )?.let { path -> path.pathKey() to variable }
            }
            .toMap()
        val baseObjects = objects.filterNot { it.id in removedObjectIds }
        val baseVariables = variables.filterNot { it.objectId in removedVariableParentIds }
        val generatedObjects = mutableListOf<VariableObjectConfig>()
        val generatedVariables = mutableListOf<VariableItemConfig>()
        var objectOffset = 0
        var variableOffset = 0

        fun appendChildren(parentId: String, path: List<String>, jsonObject: JsonObject) {
            jsonObject.entries.forEachIndexed { index, (key, value) ->
                val childPath = path + key
                when (value) {
                    is JsonObject -> {
                        val childId = objectId(objectOffset++)
                        val previous = previousObjectsByPath[childPath.pathKey()]
                        generatedObjects += VariableObjectConfig(
                            id = childId,
                            name = key,
                            parentId = parentId,
                            description = previous?.description.orEmpty(),
                            updateRule = previous?.updateRule.orEmpty(),
                            order = baseObjects.size + generatedObjects.size + 1,
                            treeViewOrder = index + 1,
                        )
                        appendChildren(childId, childPath, value)
                    }
                    is JsonArray -> generatedVariables += importedVariable(
                        id = variableId(variableOffset++),
                        title = key,
                        objectId = parentId,
                        type = VariableValueType.Array.raw,
                        defaultValue = ElecKoiPrettyJson.encodeToString(
                            JsonElement.serializer(),
                            value,
                        ),
                        previous = previousVariablesByPath[childPath.pathKey()],
                        order = baseVariables.size + generatedVariables.size + 1,
                        treeViewOrder = index + 1,
                    )
                    is JsonPrimitive -> {
                        val type = when {
                            value.isString -> VariableValueType.String.raw
                            value.booleanOrNull != null -> VariableValueType.Boolean.raw
                            else -> VariableValueType.Number.raw
                        }
                        generatedVariables += importedVariable(
                            id = variableId(variableOffset++),
                            title = key,
                            objectId = parentId,
                            type = type,
                            defaultValue = value.content,
                            previous = previousVariablesByPath[childPath.pathKey()],
                            order = baseVariables.size + generatedVariables.size + 1,
                            treeViewOrder = index + 1,
                        )
                    }
                    JsonNull -> Unit
                }
            }
        }

        appendChildren(target.id, emptyList(), parsed)
        return VariableJsonTreeImportResult.Success(
            objects = ensureInitializationObject(baseObjects + generatedObjects),
            variables = baseVariables + generatedVariables,
            expandedObjectIds =
                (expandedObjectIds - removedObjectIds) + targetObjectId + generatedObjects.map { it.id },
        )
    }

    private fun validateObject(value: JsonObject, path: String = ""): String? {
        value.forEach { (key, child) ->
            val currentPath = if (path.isBlank()) key else "$path.$key"
            if (key.isBlank()) return "对象字段名不能为空"
            val maxLength = if (child is JsonObject) 40 else 60
            if (key.length > maxLength) return "字段名过长：$currentPath"
            validateValue(child, currentPath)?.let { return it }
        }
        return null
    }

    private fun validateValue(value: JsonElement, path: String): String? = when (value) {
        JsonNull -> "暂不支持 null：$path"
        is JsonObject -> validateObject(value, path)
        is JsonArray -> {
            value.forEachIndexed { index, item ->
                validateValue(item, "$path[$index]")?.let { return it }
            }
            null
        }
        is JsonPrimitive -> null
    }

    private fun importedVariable(
        id: String,
        title: String,
        objectId: String,
        type: String,
        defaultValue: String,
        previous: VariableItemConfig?,
        order: Int,
        treeViewOrder: Int,
    ) = VariableItemConfig(
        id = id,
        title = title,
        objectId = objectId,
        type = type,
        defaultValue = defaultValue,
        description = previous?.description.orEmpty(),
        updateRule = previous?.updateRule.orEmpty(),
        readMode = previous?.readMode ?: VariableReadMode.OnDemand,
        order = order,
        treeViewOrder = treeViewOrder,
    )

    private fun relativeVariablePath(
        targetObjectId: String,
        variable: VariableItemConfig,
        objects: List<VariableObjectConfig>,
    ): List<String>? {
        val objectsById = objects.associateBy(VariableObjectConfig::id)
        val objectSegments = mutableListOf<String>()
        val visited = hashSetOf<String>()
        var objectId = variable.objectId
        while (objectId != targetObjectId) {
            if (objectId.isBlank() || !visited.add(objectId)) return null
            val variableObject = objectsById[objectId] ?: return null
            objectSegments += variableObject.name
            objectId = variableObject.parentId
        }
        return objectSegments.asReversed() + variable.title
    }

    private fun relativeObjectPath(
        targetObjectId: String,
        variableObject: VariableObjectConfig,
        objects: List<VariableObjectConfig>,
    ): List<String>? {
        val objectsById = objects.associateBy(VariableObjectConfig::id)
        val segments = mutableListOf(variableObject.name)
        val visited = hashSetOf(variableObject.id)
        var parentId = variableObject.parentId
        while (parentId != targetObjectId) {
            if (parentId.isBlank() || !visited.add(parentId)) return null
            val parent = objectsById[parentId] ?: return null
            segments += parent.name
            parentId = parent.parentId
        }
        return segments.asReversed()
    }

    private fun List<String>.pathKey(): String = joinToString("\u0000")

    private fun descendantIds(
        objectId: String,
        objects: List<VariableObjectConfig>,
    ): Set<String> {
        val childrenByParent = objects.groupBy { it.parentId }
        val result = mutableSetOf<String>()
        fun collect(parentId: String) {
            childrenByParent[parentId].orEmpty().forEach { child ->
                if (result.add(child.id)) collect(child.id)
            }
        }
        collect(objectId)
        return result
    }

    private fun ensureInitializationObject(
        source: List<VariableObjectConfig>,
    ): List<VariableObjectConfig> {
        if (source.any { it.isInitializationObject() }) return source
        return listOf(
            VariableObjectConfig(
                id = VariableInitializationObjectId,
                name = VariableInitializationObjectName,
                parentId = "",
                order = 0,
                treeViewOrder = 0,
            ),
        ) + source
    }
}

internal sealed interface VariableJsonTreeImportResult {
    data class Success(
        val objects: List<VariableObjectConfig>,
        val variables: List<VariableItemConfig>,
        val expandedObjectIds: Set<String>,
    ) : VariableJsonTreeImportResult
    data class Failure(val message: String) : VariableJsonTreeImportResult
}
