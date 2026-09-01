package com.eleckoi.android.engine.agent.creator

import com.eleckoi.android.engine.agent.api.AgentDynamicTool
import com.eleckoi.android.engine.agent.api.AgentDynamicToolResult
import com.eleckoi.android.engine.agent.api.AgentToolDefinition
import com.eleckoi.android.engine.creator.capability.CreatorCapabilityDefinition
import com.eleckoi.android.engine.creator.capability.CreatorCapabilityException
import com.eleckoi.android.engine.creator.capability.CreatorCapabilityRegistry
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Explicit opt-in mapping from a shared creator capability to one DSH host tool.
 *
 * The mapping deliberately lives on the agent side: adding a public API never silently grants an
 * agent a new mutation tool. Agent-only policies can still wrap the shared capability before it is
 * exposed (for example variable read-before-write and allowed-root checks).
 */
internal data class CreatorAgentCapabilityBinding(
    val capabilityId: String,
    val tool: AgentToolDefinition,
)

internal object CreatorCapabilityDshAdapter {
    fun <Context, Definition : CreatorCapabilityDefinition> bind(
        context: Context,
        bindings: List<CreatorAgentCapabilityBinding>,
        registry: CreatorCapabilityRegistry<Context, Definition>,
    ): List<AgentDynamicTool> {
        val duplicateNames = bindings.groupBy { it.tool.name }.filterValues { it.size > 1 }.keys
        require(duplicateNames.isEmpty()) {
            "Duplicate DSH tool bindings: ${duplicateNames.sorted().joinToString()}"
        }
        return bindings.map { binding ->
            val capability = checkNotNull(registry.find(binding.capabilityId)) {
                "Unknown creator capability: ${binding.capabilityId}"
            }
            AgentDynamicTool(
                definition = binding.tool,
                handler = { arguments ->
                    try {
                        AgentDynamicToolResult(
                            content = capability.handler(context, arguments).toString(),
                            success = true,
                        )
                    } catch (error: CreatorCapabilityException) {
                        AgentDynamicToolResult(
                            content = buildJsonObject {
                                put("status", "error")
                                put("code", error.code)
                                put("message", error.message)
                            }.toString(),
                            success = false,
                        )
                    } catch (error: CancellationException) {
                        throw error
                    } catch (_: Throwable) {
                        AgentDynamicToolResult(
                            content = buildJsonObject {
                                put("status", "error")
                                put("code", "INTERNAL_ERROR")
                                put("message", "创作能力调用失败")
                            }.toString(),
                            success = false,
                        )
                    }
                },
            )
        }
    }
}
