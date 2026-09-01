package com.eleckoi.android.feature.studio.authoring.capability

import com.eleckoi.android.engine.story.variables.model.VariableConfig
import com.eleckoi.android.engine.story.variables.model.VariableConfigVersion
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.VariableReadMode
import com.eleckoi.android.engine.story.variables.model.VariableValueType
import com.eleckoi.android.engine.story.variables.model.generatedInitialStateJson
import com.eleckoi.android.engine.story.variables.model.isInitializationObject
import com.eleckoi.android.feature.studio.authoring.CreatorAuthoringException
import com.eleckoi.android.feature.studio.authoring.creatorArray
import com.eleckoi.android.feature.studio.authoring.creatorBoolean
import com.eleckoi.android.feature.studio.authoring.creatorInt
import com.eleckoi.android.feature.studio.authoring.creatorRawString
import com.eleckoi.android.feature.studio.authoring.creatorString
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

internal fun applyOperations(source: VariableConfig, operations: List<JsonObject>): VariableApplyResult {
    var config = source
    val descriptions = mutableListOf<String>()
    operations.forEachIndexed { index, op ->
        val kind = op.creatorString("op")
        when (kind) {
            "set_config" -> {
                config = config.copy(
                    name = op.stringPatch("name", config.name),
                    initialStateJson = op.rawStringPatch("initial_state_json", config.initialStateJson),
                    schemaCode = op.rawStringPatch("schema_code", config.schemaCode),
                    expandedObjectIds = if ("expanded_object_ids" in op) op.stringList("expanded_object_ids") else config.expandedObjectIds,
                )
                descriptions += "更新变量配置"
            }
            "create_object" -> {
                val id = op.creatorString("id").ifBlank { "variable-object-${UUID.randomUUID()}" }
                if (config.objects.any { it.id == id }) invalid(index, "对象 id 已存在：$id")
                config = config.copy(objects = config.objects + VariableObjectConfig(
                    id = id,
                    name = op.creatorString("name"),
                    parentId = op.creatorString("parent_id"),
                    enabled = op.creatorBoolean("enabled", true),
                    description = op.creatorString("description"),
                    updateRule = op.creatorString("update_rule"),
                    dynamicKey = op.creatorBoolean("dynamic_key"),
                    order = op.creatorInt("order", config.objects.size + 1),
                    treeViewOrder = op.creatorInt("tree_view_order", config.objects.size + 1),
                ))
                descriptions += "创建变量对象 $id"
            }
            "patch_object" -> {
                val id = op.requiredId(index)
                val old = config.objects.firstOrNull { it.id == id } ?: invalid(index, "找不到对象：$id")
                if (old.isInitializationObject()) invalid(index, "系统变量运行配置对象不可修改")
                val next = old.copy(
                    name = op.stringPatch("name", old.name),
                    parentId = op.stringPatch("parent_id", old.parentId),
                    enabled = op.booleanPatch("enabled", old.enabled),
                    description = op.stringPatch("description", old.description),
                    updateRule = op.stringPatch("update_rule", old.updateRule),
                    dynamicKey = op.booleanPatch("dynamic_key", old.dynamicKey),
                    order = op.intPatch("order", old.order),
                    treeViewOrder = op.intPatch("tree_view_order", old.treeViewOrder),
                )
                config = config.copy(objects = config.objects.map { if (it.id == id) next else it })
                descriptions += "修改变量对象 $id"
            }
            "delete_object" -> {
                val id = op.requiredId(index)
                val target = config.objects.firstOrNull { it.id == id } ?: invalid(index, "找不到对象：$id")
                if (target.isInitializationObject()) invalid(index, "系统变量运行配置对象不可删除")
                val descendants = descendantObjectIds(config.objects, id)
                val affected = descendants + id
                val hasContents = config.variables.any { it.objectId in affected } || descendants.isNotEmpty()
                if (hasContents && !op.creatorBoolean("cascade")) invalid(index, "对象包含子对象或变量；确认删除时请传 cascade=true")
                config = config.copy(
                    objects = config.objects.filterNot { it.id in affected },
                    variables = config.variables.filterNot { it.objectId in affected },
                    expandedObjectIds = config.expandedObjectIds.filterNot { it in affected },
                )
                descriptions += "删除变量对象 $id"
            }
            "create_variable" -> {
                val requestedId = op.creatorString("id")
                val requestedTitle = op.creatorString("title")
                val requestedObjectId = op.creatorString("object_id")
                if (requestedTitle.isBlank()) invalid(index, "create_variable 必须填写 title")
                val existingById = requestedId.takeIf(String::isNotBlank)
                    ?.let { id -> config.variables.firstOrNull { it.id == id } }
                val existingByPath = config.variables.firstOrNull { item ->
                    item.objectId == requestedObjectId && item.title.trim() == requestedTitle
                }
                val existing = existingById ?: existingByPath
                val next = (existing ?: VariableItemConfig(
                    id = requestedId.ifBlank { "variable-${UUID.randomUUID()}" },
                    order = config.variables.size + 1,
                    treeViewOrder = config.variables.size + 1,
                )).copy(
                    title = requestedTitle,
                    objectId = requestedObjectId,
                    enabled = if ("enabled" in op) op.creatorBoolean("enabled") else existing?.enabled ?: true,
                    type = op.stringPatch("type", existing?.type.orEmpty()),
                    defaultValue = op.stringPatch("default_value", existing?.defaultValue.orEmpty()),
                    description = op.stringPatch("description", existing?.description.orEmpty()),
                    updateRule = op.stringPatch("update_rule", existing?.updateRule.orEmpty()),
                    readMode = if ("read_mode" in op) {
                        op.readMode(index, existing?.readMode ?: VariableReadMode.OnDemand)
                    } else {
                        existing?.readMode ?: VariableReadMode.OnDemand
                    },
                    order = op.intPatch("order", existing?.order ?: (config.variables.size + 1)),
                    treeViewOrder = op.intPatch("tree_view_order", existing?.treeViewOrder ?: (config.variables.size + 1)),
                )
                if (next.type.isBlank()) invalid(index, "create_variable 必须填写 type")
                if (next.description.isBlank()) invalid(index, "create_variable 必须填写 description")
                if (next.updateRule.isBlank()) {
                    invalid(index, "create_variable 必须填写 update_rule；静态变量请明确写“仅由用户手动修改，AI 不得自动更新”")
                }
                config = config.copy(
                    variables = if (existing == null) {
                        config.variables + next
                    } else {
                        config.variables.map { item -> if (item.id == existing.id) next else item }
                    },
                )
                descriptions += if (existing == null) {
                    "创建变量 ${next.title}"
                } else {
                    "更新已有变量 ${next.title}（未重复创建）"
                }
            }
            "patch_variable" -> {
                val id = op.requiredId(index)
                val old = config.variables.firstOrNull { it.id == id } ?: invalid(index, "找不到变量：$id")
                val next = old.copy(
                    title = op.stringPatch("title", old.title),
                    objectId = op.stringPatch("object_id", old.objectId),
                    enabled = op.booleanPatch("enabled", old.enabled),
                    type = op.stringPatch("type", old.type),
                    defaultValue = op.stringPatch("default_value", old.defaultValue),
                    description = op.stringPatch("description", old.description),
                    updateRule = op.stringPatch("update_rule", old.updateRule),
                    readMode = if ("read_mode" in op) op.readMode(index, old.readMode) else old.readMode,
                    order = op.intPatch("order", old.order),
                    treeViewOrder = op.intPatch("tree_view_order", old.treeViewOrder),
                )
                config = config.copy(variables = config.variables.map { if (it.id == id) next else it })
                descriptions += "修改变量 $id"
            }
            "delete_variable" -> {
                val id = op.requiredId(index)
                if (config.variables.none { it.id == id }) invalid(index, "找不到变量：$id")
                config = config.copy(variables = config.variables.filterNot { it.id == id })
                descriptions += "删除变量 $id"
            }
            "convert_variable_to_object" -> {
                val id = op.requiredId(index)
                val sourceVariable = config.variables.firstOrNull { it.id == id }
                    ?: invalid(index, "找不到变量：$id")
                val objectId = op.creatorString("new_id").ifBlank { "variable-object-${UUID.randomUUID()}" }
                if (config.objects.any { it.id == objectId }) invalid(index, "对象 id 已存在：$objectId")
                val variableObject = VariableObjectConfig(
                    id = objectId,
                    name = op.creatorString("name").ifBlank { sourceVariable.title.ifBlank { "未命名变量组" } },
                    parentId = sourceVariable.objectId,
                    enabled = sourceVariable.enabled,
                    description = sourceVariable.description,
                    updateRule = sourceVariable.updateRule,
                    order = sourceVariable.order,
                    treeViewOrder = sourceVariable.treeViewOrder,
                    createdAt = sourceVariable.createdAt,
                    updatedAt = sourceVariable.updatedAt,
                )
                config = config.copy(
                    objects = config.objects + variableObject,
                    variables = config.variables.filterNot { it.id == id },
                    expandedObjectIds = (config.expandedObjectIds + objectId +
                        listOf(sourceVariable.objectId).filter(String::isNotBlank)).distinct(),
                )
                descriptions += "把变量 $id 转换为 object $objectId"
            }
            "create_version" -> {
                val id = op.creatorString("id").ifBlank { "variable-config-${UUID.randomUUID()}" }
                if (config.versions.any { it.id == id }) invalid(index, "版本 id 已存在：$id")
                val version = config.snapshot(id, op.creatorString("name").ifBlank { config.name })
                config = config.copy(versions = config.versions + version)
                if (op.creatorBoolean("activate", true)) config = config.activate(version)
                descriptions += "创建变量版本 $id"
            }
            "patch_version" -> {
                val id = op.requiredId(index)
                if (config.versions.none { it.id == id }) invalid(index, "找不到版本：$id")
                val name = op.creatorString("name")
                if (name.isBlank()) invalid(index, "版本名称不能为空")
                config = config.copy(
                    name = if (config.activeVersionId == id) name else config.name,
                    versions = config.versions.map { if (it.id == id) it.copy(name = name) else it },
                )
                descriptions += "重命名变量版本 $id"
            }
            "switch_version" -> {
                val id = op.requiredId(index)
                val version = config.versions.firstOrNull { it.id == id } ?: invalid(index, "找不到版本：$id")
                config = config.activate(version)
                descriptions += "切换变量版本 $id"
            }
            "delete_version" -> {
                val id = op.requiredId(index)
                if (config.versions.none { it.id == id }) invalid(index, "找不到版本：$id")
                if (config.versions.size <= 1) invalid(index, "至少保留一个变量配置版本")
                val remaining = config.versions.filterNot { it.id == id }
                config = config.copy(versions = remaining)
                if (config.activeVersionId == id) config = config.activate(remaining.first())
                descriptions += "删除变量版本 $id"
            }
            else -> invalid(index, "不支持的操作：$kind")
        }
    }
    return VariableApplyResult(config, descriptions)
}

internal fun validateConfig(config: VariableConfig) {
    val objectIds = config.objects.map { it.id }
    if (objectIds.any(String::isBlank) || objectIds.distinct().size != objectIds.size) {
        throw CreatorAuthoringException("VALIDATION_FAILED", "变量对象 id 不能为空且不可重复")
    }
    val userObjects = config.objects.filterNot { it.isInitializationObject() }
    if (userObjects.any { it.name.isBlank() }) throw CreatorAuthoringException("VALIDATION_FAILED", "变量对象名称不能为空")
    if (userObjects.any { it.parentId.isNotBlank() && it.parentId !in objectIds }) {
        throw CreatorAuthoringException("VALIDATION_FAILED", "变量对象父级不存在")
    }
    userObjects.forEach { item ->
        if (item.id in descendantObjectIds(config.objects, item.id)) {
            throw CreatorAuthoringException("VALIDATION_FAILED", "变量对象层级存在循环：${item.id}")
        }
    }
    val variableIds = config.variables.map { it.id }
    if (variableIds.any(String::isBlank) || variableIds.distinct().size != variableIds.size) {
        throw CreatorAuthoringException("VALIDATION_FAILED", "变量 id 不能为空且不可重复")
    }
    if (config.variables.any { it.title.isBlank() }) throw CreatorAuthoringException("VALIDATION_FAILED", "变量标题不能为空")
    if (config.variables.any { it.objectId.isNotBlank() && it.objectId !in objectIds }) {
        throw CreatorAuthoringException("VALIDATION_FAILED", "变量所属对象不存在")
    }
    (listOf("") + userObjects.map { it.id }).forEach { parentId ->
        val keys = buildList {
            userObjects.filter { it.parentId == parentId }.forEach { add(it.name.trim()) }
            config.variables.filter { it.objectId == parentId }.forEach { add(it.title.trim()) }
        }.filter(String::isNotBlank)
        val duplicate = keys.groupingBy { it }.eachCount().entries.firstOrNull { it.value > 1 }?.key
        if (duplicate != null) {
            throw CreatorAuthoringException(
                "DUPLICATE_VARIABLE_PATH",
                "同一层级存在重复状态键“$duplicate”；请修改已有变量，不要再次创建同名变量",
            )
        }
    }
    val allowedTypes = VariableValueType.entries.filterNot { it == VariableValueType.Object }.map { it.raw }.toSet()
    if (config.variables.any { it.type.isNotBlank() && it.type !in allowedTypes }) {
        throw CreatorAuthoringException("VALIDATION_FAILED", "变量类型无效")
    }
    if (config.initialStateJson.isNotBlank()) {
        val parsed = runCatching { Json.parseToJsonElement(config.initialStateJson) }.getOrNull()
        if (parsed !is JsonObject) {
            throw CreatorAuthoringException("VALIDATION_FAILED", "初始化状态必须是有效的 JSON object")
        }
    }
    val versionIds = config.versions.map { it.id }
    if (versionIds.any(String::isBlank) || versionIds.distinct().size != versionIds.size) {
        throw CreatorAuthoringException("VALIDATION_FAILED", "版本 id 不能为空且不可重复")
    }
    if (config.versions.isNotEmpty() && config.activeVersionId !in versionIds) {
        throw CreatorAuthoringException("VALIDATION_FAILED", "活动变量版本不存在")
    }
}

private fun JsonObject.requiredId(index: Int): String = creatorString("id").ifBlank { invalid(index, "id 不能为空") }
private fun JsonObject.stringPatch(name: String, old: String): String = if (name in this) creatorString(name) else old
private fun JsonObject.rawStringPatch(name: String, old: String): String = if (name in this) creatorRawString(name) else old
private fun JsonObject.booleanPatch(name: String, old: Boolean): Boolean = if (name in this) creatorBoolean(name, old) else old
private fun JsonObject.intPatch(name: String, old: Int): Int = if (name in this) creatorInt(name, old) else old
private fun JsonObject.stringList(name: String): List<String> = creatorArray(name).orEmpty().mapNotNull {
    (it as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf(String::isNotBlank)
}.distinct()
private fun JsonObject.readMode(index: Int, default: VariableReadMode): VariableReadMode {
    val raw = creatorString("read_mode")
    if (raw.isBlank()) return default
    return VariableReadMode.entries.firstOrNull { it.storageValue == raw } ?: invalid(index, "read_mode 无效：$raw")
}

private fun descendantObjectIds(objects: List<VariableObjectConfig>, rootId: String): Set<String> {
    val result = linkedSetOf<String>()
    var frontier = setOf(rootId)
    while (frontier.isNotEmpty()) {
        val next = objects.filter { it.parentId in frontier && it.id !in result }.map { it.id }.toSet()
        result += next
        frontier = next
    }
    return result
}

private fun VariableConfig.snapshot(id: String, versionName: String) = VariableConfigVersion(
    id = id,
    name = versionName,
    initialStateJson = initialStateJson,
    schemaCode = schemaCode,
    objects = objects,
    variables = variables,
    expandedObjectIds = expandedObjectIds,
)

private fun VariableConfig.activate(version: VariableConfigVersion) = copy(
    name = version.name,
    initialStateJson = version.initialStateJson,
    schemaCode = version.schemaCode,
    objects = version.objects,
    variables = version.variables,
    expandedObjectIds = version.expandedObjectIds,
    activeVersionId = version.id,
)

internal fun VariableConfig.withResolvedInitialState(rebuildFromTree: Boolean): VariableConfig = copy(
    // For a static tree the variable metadata is the source of truth after a shape change.
    // Dynamic-key trees retain their explicit runtime-shaped template.
    initialStateJson = if (rebuildFromTree && objects.none { it.dynamicKey }) {
        generatedInitialStateJson(objects, variables)
    } else if (initialStateJson.isNotBlank()) {
        initialStateJson
    } else {
        generatedInitialStateJson(objects, variables)
    },
)

internal fun validateInitialStateShape(config: VariableConfig) {
    if (config.objects.any { it.dynamicKey }) return
    val actual = runCatching { Json.parseToJsonElement(config.initialStateJson) as? JsonObject }.getOrNull()
        ?: throw CreatorAuthoringException("VALIDATION_FAILED", "初始化状态必须是有效的 JSON object")
    val expected = Json.parseToJsonElement(generatedInitialStateJson(config.objects, config.variables)) as JsonObject
    val actualPaths = actual.stateKeyPaths()
    val expectedPaths = expected.stateKeyPaths()
    if (actualPaths == expectedPaths) return
    val missing = (expectedPaths - actualPaths).take(6)
    val unexpected = (actualPaths - expectedPaths).take(6)
    val details = buildList {
        if (missing.isNotEmpty()) add("缺少：${missing.joinToString()}")
        if (unexpected.isNotEmpty()) add("多出：${unexpected.joinToString()}")
    }.joinToString("；")
    throw CreatorAuthoringException(
        "INITIAL_STATE_SHAPE_MISMATCH",
        "initial_state_json 与变量树不一致（状态键来自对象 name 和变量 title，不来自内部 id）${details.takeIf(String::isNotBlank)?.let { "：$it" }.orEmpty()}",
    )
}

private fun JsonObject.stateKeyPaths(prefix: String = ""): Set<String> = buildSet {
    entries.forEach { (key, value) ->
        val path = if (prefix.isBlank()) key else "$prefix.$key"
        add(path)
        if (value is JsonObject) addAll(value.stateKeyPaths(path))
    }
}

internal fun VariableConfig.stateShape(): VariableStateShape = VariableStateShape(
    objects = objects.filterNot { it.isInitializationObject() }.map { item ->
        VariableObjectStateShape(
            id = item.id,
            name = item.name,
            parentId = item.parentId,
            enabled = item.enabled,
            dynamicKey = item.dynamicKey,
        )
    },
    variables = variables.map { item ->
        VariableItemStateShape(
            id = item.id,
            title = item.title,
            objectId = item.objectId,
            enabled = item.enabled,
            type = item.type,
            defaultValue = item.defaultValue,
        )
    },
)

private fun invalid(index: Int, message: String): Nothing =
    throw CreatorAuthoringException("INVALID_ARGUMENTS", "operations[$index] $message")

internal data class VariableApplyResult(val config: VariableConfig, val descriptions: List<String>)
internal data class VariableStateShape(
    val objects: List<VariableObjectStateShape>,
    val variables: List<VariableItemStateShape>,
)
internal data class VariableObjectStateShape(
    val id: String,
    val name: String,
    val parentId: String,
    val enabled: Boolean,
    val dynamicKey: Boolean,
)
internal data class VariableItemStateShape(
    val id: String,
    val title: String,
    val objectId: String,
    val enabled: Boolean,
    val type: String,
    val defaultValue: String,
)
