package com.eleckoi.android.engine.story.variables.config

import com.eleckoi.android.engine.story.variables.model.VariableConfigVersion
import com.eleckoi.android.engine.story.variables.model.VariableInitializationObjectId
import com.eleckoi.android.engine.story.variables.model.VariableInitializationObjectName
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.VariableValueType
import com.eleckoi.android.engine.story.variables.model.generatedInitialStateJson
import com.eleckoi.android.engine.story.variables.model.isInitializationObject
import org.json.JSONObject

internal object VariableConfigNormalizer {
    fun normalizeVersion(
        version: VariableConfigVersion,
        now: String,
        fallbackId: String,
    ): VariableConfigVersion {
        val hasUserData = version.schemaCode.isNotBlank() ||
            version.objects.any { !it.isInitializationObject() } || version.variables.isNotEmpty()
        val objects = normalizeObjects(
            if (hasUserData) {
                ensureInitializationObject(version.objects, now)
            } else {
                version.objects.filterNot { it.isInitializationObject() }
            },
            now,
        )
        val objectIds = objects.map { it.id }.toSet()
        val variables = version.variables.mapIndexed { index, item ->
            normalizeVariable(item, index, objectIds, now)
        }
        return version.copy(
            // Legacy rows may have no id. Reads use a deterministic fallback so they do not look
            // like concurrent edits simply because the document was loaded twice.
            id = version.id.ifBlank { fallbackId },
            name = version.name.trim().take(60),
            initialStateJson = version.initialStateJson.takeIf { candidate ->
                runCatching { JSONObject(candidate) }.isSuccess
            }.orEmpty(),
            schemaCode = version.schemaCode,
            objects = objects,
            variables = variables,
            expandedObjectIds = version.expandedObjectIds.filter { it in objectIds }.distinct(),
            createdAt = version.createdAt.ifBlank { now },
            updatedAt = now,
        )
    }

    fun emptyVersion(): VariableConfigVersion {
        // This is a stable empty-document identity. The first real save supplies timestamps.
        return VariableConfigVersion(id = DefaultEmptyVariableConfigVersionId)
    }

    private fun ensureInitializationObject(
        objects: List<VariableObjectConfig>,
        now: String,
    ): List<VariableObjectConfig> {
        val existing = objects.firstOrNull { it.isInitializationObject() }
        val initialization = (existing ?: VariableObjectConfig()).copy(
            id = VariableInitializationObjectId,
            name = VariableInitializationObjectName,
            parentId = "",
            enabled = true,
            order = 0,
            treeViewOrder = 0,
            createdAt = existing?.createdAt?.ifBlank { now } ?: now,
            updatedAt = now,
        )
        return listOf(initialization) + objects.filterNot { it.isInitializationObject() }
    }

    private fun normalizeObjects(
        objects: List<VariableObjectConfig>,
        now: String,
    ): List<VariableObjectConfig> {
        val ids = objects.map { it.id }.filter(String::isNotBlank).toSet()
        val usedIds = ids.toMutableSet()
        return objects.mapIndexed { index, variableObject ->
            val system = variableObject.isInitializationObject()
            val normalizedId = variableObject.id.ifBlank {
                val base = "variable-object-migrated-$index"
                var candidate = base
                var suffix = 2
                while (!usedIds.add(candidate)) {
                    candidate = "$base-$suffix"
                    suffix += 1
                }
                candidate
            }
            variableObject.copy(
                id = normalizedId,
                name = if (system) {
                    VariableInitializationObjectName
                } else {
                    variableObject.name.trim().take(40)
                },
                parentId = if (system) {
                    ""
                } else {
                    variableObject.parentId
                        .takeIf {
                            it in ids && it != variableObject.id &&
                                it != VariableInitializationObjectId
                        }
                        .orEmpty()
                },
                enabled = if (system) true else variableObject.enabled,
                description = if (system) "" else variableObject.description.trim(),
                updateRule = if (system) "" else variableObject.updateRule.trim(),
                order = if (system) 0 else variableObject.order.takeIf { it > 0 } ?: (index + 1),
                treeViewOrder = if (system) 0 else variableObject.treeViewOrder.coerceAtLeast(0),
                createdAt = variableObject.createdAt.ifBlank { now },
                updatedAt = now,
            )
        }.sortedWith(
            compareBy<VariableObjectConfig> { if (it.isInitializationObject()) 0 else 1 }
                .thenBy { it.order },
        ).mapIndexed { index, variableObject ->
            if (variableObject.isInitializationObject()) {
                variableObject.copy(order = 0)
            } else {
                variableObject.copy(order = index)
            }
        }
    }

    private fun normalizeVariable(
        item: VariableItemConfig,
        index: Int,
        objectIds: Set<String>,
        now: String,
    ): VariableItemConfig {
        val normalizedObjectId = when {
            item.objectId == VariableInitializationObjectId -> ""
            item.objectId in objectIds -> item.objectId
            else -> ""
        }
        return item.copy(
            id = item.id.ifBlank { "variable-migrated-$index" },
            title = item.title.trim().take(60),
            objectId = normalizedObjectId,
            type = normalizeJsonType(item.type),
            defaultValue = item.defaultValue.trim(),
            description = item.description.trim(),
            updateRule = item.updateRule.trim(),
            order = item.order.takeIf { it > 0 } ?: (index + 1),
            treeViewOrder = item.treeViewOrder.coerceAtLeast(0),
            createdAt = item.createdAt.ifBlank { now },
            updatedAt = now,
        )
    }

    private fun normalizeJsonType(raw: String): String {
        val type = raw.trim()
        return type.takeIf { candidate ->
            candidate != VariableValueType.Object.raw &&
                VariableValueType.entries.any { it.raw == candidate }
        }.orEmpty()
    }
}

internal fun VariableConfigVersion.resolvedInitialStateJson(): String {
    return initialStateJson.ifBlank { generatedInitialStateJson(objects, variables) }
}

private const val DefaultEmptyVariableConfigVersionId = "variable-config-default"
