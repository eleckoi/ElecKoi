package com.eleckoi.android.engine.creator.capability

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Stable identity shared by every surface that exposes a creator capability. */
interface CreatorCapabilityDefinition {
    val capabilityId: String
}

/**
 * One executable creator operation, independent of whether its caller is HTML, DSH, or native UI.
 * The context type keeps surface-specific state outside the capability infrastructure itself.
 */
data class CreatorCapability<Context, Definition : CreatorCapabilityDefinition>(
    val definition: Definition,
    val handler: suspend (Context, JsonObject) -> JsonElement,
)

/**
 * The single indexing and duplicate-detection mechanism for creator capabilities.
 * Adapters may attach their own permissions and wire formats, but do not maintain another lookup.
 */
class CreatorCapabilityRegistry<Context, Definition : CreatorCapabilityDefinition>(
    capabilities: List<CreatorCapability<Context, Definition>>,
) {
    private val capabilitiesById: Map<String, CreatorCapability<Context, Definition>>

    init {
        val blankIds = capabilities.filter { it.definition.capabilityId.isBlank() }
        require(blankIds.isEmpty()) { "Creator capability id cannot be blank" }
        val duplicates = capabilities.groupBy { it.definition.capabilityId }
            .filterValues { it.size > 1 }
            .keys
        require(duplicates.isEmpty()) {
            "Duplicate creator capabilities: ${duplicates.sorted().joinToString()}"
        }
        capabilitiesById = capabilities.associateBy { it.definition.capabilityId }
    }

    val definitions: List<Definition>
        get() = capabilitiesById.values.map(CreatorCapability<Context, Definition>::definition)

    fun find(capabilityId: String): CreatorCapability<Context, Definition>? =
        capabilitiesById[capabilityId]
}

/** A surface-neutral failure that adapters can translate to their own response protocol. */
open class CreatorCapabilityException(
    val code: String,
    override val message: String,
) : IllegalArgumentException(message)
