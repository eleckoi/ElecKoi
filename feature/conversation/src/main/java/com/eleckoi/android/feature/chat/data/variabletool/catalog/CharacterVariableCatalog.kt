package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.story.variables.model.VariableConfig
import com.eleckoi.android.engine.story.variables.model.VariableInitializationObjectId
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.VariableReadMode
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import org.json.JSONObject

internal class CharacterVariableTurnState(initialStateJson: String) {
    var stateJson: String = normalizedState(initialStateJson)
        private set

    fun replaceState(value: String) {
        stateJson = normalizedState(value)
    }

    private companion object {
        fun normalizedState(value: String): String = try {
            JSONObject(value.ifBlank { "{}" }).toString(2)
        } catch (error: Exception) {
            throw ElecKoiDataException("当前变量状态不是合法 JSON object：${error.message}", error)
        }
    }
}

internal data class CharacterVariableCatalogEntry(
    val path: String,
    val variable: VariableItemConfig? = null,
    val variableObject: VariableObjectConfig? = null,
    val inferredType: String? = null,
    val objectContainer: Boolean = false,
    val allowsDynamicChildren: Boolean = false,
)

internal fun characterVariableCatalog(
    config: VariableConfig,
    stateJson: String = config.initialStateJson,
): List<CharacterVariableCatalogEntry> {
    val objectsById = config.objects
        .filterNot { it.id == VariableInitializationObjectId }
        .associateBy(VariableObjectConfig::id)
    val state = runCatching { JSONObject(stateJson.ifBlank { "{}" }) }.getOrDefault(JSONObject())

    fun enabledObjectChain(objectId: String): List<VariableObjectConfig>? {
        if (objectId.isBlank()) return emptyList()
        val chain = mutableListOf<VariableObjectConfig>()
        val visited = hashSetOf<String>()
        var currentId = objectId
        while (currentId.isNotBlank()) {
            if (!visited.add(currentId)) return null
            val current = objectsById[currentId] ?: return null
            if (!current.enabled || current.name.isBlank()) return null
            chain += current
            currentId = current.parentId
        }
        return chain.asReversed()
    }

    fun enabledObjectPaths(objectId: String): List<List<String>>? {
        if (objectId.isBlank()) return listOf(emptyList())
        val chain = enabledObjectChain(objectId) ?: return null
        var paths = listOf(emptyList<String>())
        chain.forEach { item ->
            paths = if (item.dynamicKey) {
                paths.flatMap { parentPath ->
                    val containerPath = parentPath + item.name.trim()
                    state.variableObjectAtSegments(containerPath)?.keys()?.asSequence()?.toList().orEmpty()
                        .map { key -> containerPath + key }
                }
            } else {
                paths.map { parent -> parent + item.name.trim() }
            }
        }
        return paths
    }

    val objectEntries = objectsById.values
        .asSequence()
        .filter { it.enabled && it.name.isNotBlank() }
        .flatMap { variableObject ->
            val parentPaths = enabledObjectPaths(variableObject.parentId).orEmpty()
            val containerPaths = parentPaths.map { parent -> parent + variableObject.name.trim() }
            val containers = containerPaths.asSequence().map { segments ->
                CharacterVariableCatalogEntry(
                    path = segments.joinToString(separator = "/", prefix = "/") {
                        it.toVariableJsonPointerToken()
                    },
                    variableObject = variableObject,
                    objectContainer = true,
                    allowsDynamicChildren = variableObject.dynamicKey,
                )
            }
            if (!variableObject.dynamicKey) return@flatMap containers
            val dynamicValues = containerPaths.asSequence().flatMap { containerPath ->
                val container = state.variableObjectAtSegments(containerPath)
                container?.keys()?.asSequence()?.map { key ->
                    val value = container.opt(key)
                    CharacterVariableCatalogEntry(
                        path = (containerPath + key).joinToString(separator = "/", prefix = "/") {
                            it.toVariableJsonPointerToken()
                        },
                        variableObject = variableObject,
                        inferredType = value.inferredCharacterVariableType(),
                        objectContainer = value is JSONObject,
                    )
                } ?: emptySequence()
            }
            containers + dynamicValues
        }
    val variableEntries = config.variables
        .asSequence()
        .filter { it.enabled && it.title.isNotBlank() }
        .flatMap { variable ->
            enabledObjectPaths(variable.objectId).orEmpty().asSequence().map { objectPath ->
                val segments = objectPath + variable.title.trim()
                CharacterVariableCatalogEntry(
                    path = segments.joinToString(separator = "/", prefix = "/") {
                        it.toVariableJsonPointerToken()
                    },
                    variable = variable,
                )
            }
        }
        .toList()
    val configuredVariablePaths = variableEntries
        .mapTo(hashSetOf(), CharacterVariableCatalogEntry::path)
    val inferredEntries = buildList {
        fun addValue(value: Any?, segments: List<String>) {
            val path = segments.joinToString(separator = "/", prefix = "/") {
                it.toVariableJsonPointerToken()
            }
            // A configured variable owns its complete runtime value. Arrays (and any
            // structured value accepted by the author's schema) are not extra variables.
            if (path in configuredVariablePaths) return
            add(
                CharacterVariableCatalogEntry(
                    path = path,
                    inferredType = value.inferredCharacterVariableType(),
                    objectContainer = value is JSONObject,
                    allowsDynamicChildren = value is JSONObject,
                ),
            )
            if (value is JSONObject) {
                value.keys().forEach { key -> addValue(value.opt(key), segments + key) }
            }
        }
        state.keys().forEach { key -> addValue(state.opt(key), listOf(key)) }
    }
    return (variableEntries + objectEntries + inferredEntries.asSequence())
        .distinctBy(CharacterVariableCatalogEntry::path)
        .sortedWith(characterVariableCatalogOrder())
        .toList()
}

private fun characterVariableCatalogOrder(): Comparator<CharacterVariableCatalogEntry> =
    compareBy<CharacterVariableCatalogEntry> { if (it.isRequired) 0 else 1 }
        .thenBy(CharacterVariableCatalogEntry::path)

internal val CharacterVariableCatalogEntry.type: String
    get() = variable?.type ?: inferredType ?: "object"

internal val CharacterVariableCatalogEntry.title: String
    get() = variable?.title ?: inferredType?.let { path.variableJsonPointerLeaf() } ?: variableObject?.name.orEmpty()

internal val CharacterVariableCatalogEntry.description: String
    get() = variable?.description ?: variableObject?.description.orEmpty()

internal val CharacterVariableCatalogEntry.updateRule: String
    get() = variable?.updateRule ?: variableObject?.updateRule.orEmpty()

internal val CharacterVariableCatalogEntry.readMode: VariableReadMode
    get() = variable?.readMode ?: VariableReadMode.OnDemand

internal val CharacterVariableCatalogEntry.isRequired: Boolean
    get() = variable?.readMode == VariableReadMode.Required
