package com.eleckoi.android.engine.story.variables.model

const val VariableInitializationObjectId: String = "fixed-variable-initialization-object"
const val VariableInitializationObjectName: String = "变量运行配置"

enum class VariableValueType(
    val raw: String,
) {
    Number("number"),
    String("string"),
    Boolean("boolean"),
    Object("object"),
    Array("array"),
}

enum class VariableReadMode(
    val storageValue: String,
    val label: String,
) {
    Required("required", "必读"),
    OnDemand("on_demand", "按需"),
}

fun variableTypeLabel(type: String): String {
    return VariableValueType.entries.firstOrNull { it.raw == type }?.raw ?: "未设置结构"
}

data class VariableObjectConfig(
    val id: String = "",
    val name: String = "",
    val parentId: String = "",
    val enabled: Boolean = true,
    val description: String = "",
    val updateRule: String = "",
    val dynamicKey: Boolean = false,
    val order: Int = 1,
    val treeViewOrder: Int = 0,
    val createdAt: String = "",
    val updatedAt: String = "",
)

data class VariableItemConfig(
    val id: String = "",
    val title: String = "",
    val objectId: String = "",
    val enabled: Boolean = true,
    val type: String = "",
    val defaultValue: String = "",
    val description: String = "",
    val updateRule: String = "",
    val readMode: VariableReadMode = VariableReadMode.OnDemand,
    val order: Int = 1,
    val treeViewOrder: Int = 0,
    val createdAt: String = "",
    val updatedAt: String = "",
)

data class VariableConfigVersion(
    val id: String = "",
    val name: String = "",
    val initialStateJson: String = "",
    val schemaCode: String = "",
    val objects: List<VariableObjectConfig> = emptyList(),
    val variables: List<VariableItemConfig> = emptyList(),
    val expandedObjectIds: List<String> = emptyList(),
    val createdAt: String = "",
    val updatedAt: String = "",
)

data class VariableConfig(
    val characterId: String,
    val name: String = "",
    val initialStateJson: String = "",
    val schemaCode: String = "",
    val objects: List<VariableObjectConfig> = emptyList(),
    val variables: List<VariableItemConfig> = emptyList(),
    val expandedObjectIds: List<String> = emptyList(),
    val activeVersionId: String = "",
    val versions: List<VariableConfigVersion> = emptyList(),
)

fun VariableObjectConfig.isInitializationObject(): Boolean {
    return id == VariableInitializationObjectId
}
