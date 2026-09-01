package com.eleckoi.android.engine.creator.capability

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

enum class CreatorCapabilityEffect {
    Read,
    Preview,
    Write,
}

data class CreatorToolsetDefinition(
    val id: String,
    val title: String,
    val description: String,
)

data class CreatorOperationDefinition(
    override val capabilityId: String,
    val toolsetId: String,
    val title: String,
    val description: String,
    val effect: CreatorCapabilityEffect,
    val inputSchema: JsonObject = buildJsonObject {
        put("type", kotlinx.serialization.json.JsonPrimitive("object"))
    },
) : CreatorCapabilityDefinition

/** Toolset metadata and executable operations exposed through the three stable meta-tools. */
class CreatorToolsetCatalog<Context>(
    toolsets: List<CreatorToolsetDefinition>,
    capabilities: List<CreatorCapability<Context, CreatorOperationDefinition>>,
) {
    private val toolsetsById = toolsets.associateBy(CreatorToolsetDefinition::id)
    val registry = CreatorCapabilityRegistry(capabilities)

    init {
        require(toolsetsById.size == toolsets.size) { "Duplicate creator toolset ids" }
        val unknownToolsets = registry.definitions.map { it.toolsetId }.toSet() - toolsetsById.keys
        require(unknownToolsets.isEmpty()) { "Unknown creator toolsets: ${unknownToolsets.sorted()}" }
    }

    val toolsetDefinitions: List<CreatorToolsetDefinition>
        get() = toolsetsById.values.toList()

    fun toolset(id: String): CreatorToolsetDefinition? = toolsetsById[id]

    fun operations(toolsetId: String): List<CreatorOperationDefinition> =
        registry.definitions.filter { it.toolsetId == toolsetId }
}
