package com.eleckoi.android.engine.agent.adapter.request

import com.eleckoi.android.engine.agent.adapter.ProviderWireFormat
import com.eleckoi.android.engine.agent.api.AgentNativeWebSearchBridgeTool
import com.eleckoi.android.engine.agent.api.AgentWebSearchTool
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.isOfficialDeepSeekEndpoint
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/**
 * Projects DSH/pi-ai's function-only vocabulary into provider-native web search at the last
 * request boundary. No provider ever receives the internal bridge marker.
 */
internal object ProviderNativeWebSearchProjector {
    fun project(
        request: JsonObject,
        format: ProviderWireFormat,
        modelConfig: ModelConfig,
    ): JsonObject {
        val tools = request["tools"] as? JsonArray ?: return request.withoutBridgeChoice(format)
        return when (format) {
            ProviderWireFormat.Responses -> projectResponses(request, tools, modelConfig)
            ProviderWireFormat.ChatCompletions -> request.withTools(
                format = format,
                tools = JsonArray(tools.filterNot(::isChatBridgeTool)),
                removedNames = setOf(AgentNativeWebSearchBridgeTool),
            )
            ProviderWireFormat.AnthropicMessages -> request.withTools(
                format = format,
                tools = JsonArray(tools.filterNot(::isDirectBridgeTool)),
                removedNames = setOf(AgentNativeWebSearchBridgeTool),
            )
            ProviderWireFormat.GoogleGemini -> request.withTools(
                format = format,
                tools = removeGoogleBridgeTools(tools),
                removedNames = setOf(AgentNativeWebSearchBridgeTool),
            )
        }
    }

    private fun projectResponses(
        request: JsonObject,
        tools: JsonArray,
        modelConfig: ModelConfig,
    ): JsonObject {
        val officialDeepSeek = modelConfig.isOfficialDeepSeekEndpoint()
        val nativeSearchEnabled = officialDeepSeek && tools.any { tool ->
            tool.directToolName() == AgentNativeWebSearchBridgeTool ||
                tool.directToolType() in NativeWebSearchTypes
        }
        val retained = tools.filterNot { tool ->
            tool.directToolName() == AgentNativeWebSearchBridgeTool ||
                (nativeSearchEnabled && (
                    tool.directToolName() == AgentWebSearchTool ||
                        tool.directToolType() in NativeWebSearchTypes
                    ))
        }.toMutableList()
        if (nativeSearchEnabled) {
            retained += buildJsonObject { put("type", NativeWebSearchType) }
        }
        val removed = buildSet {
            add(AgentNativeWebSearchBridgeTool)
            if (nativeSearchEnabled) add(AgentWebSearchTool)
        }
        return request.withTools(
            format = ProviderWireFormat.Responses,
            tools = JsonArray(retained),
            removedNames = removed,
            replaceRemovedChoiceWithNativeSearch = nativeSearchEnabled,
        )
    }

    private fun JsonObject.withTools(
        format: ProviderWireFormat,
        tools: JsonArray,
        removedNames: Set<String>,
        replaceRemovedChoiceWithNativeSearch: Boolean = false,
    ): JsonObject = buildJsonObject {
        this@withTools.forEach { (key, value) ->
            when {
                key == "tools" -> if (tools.isNotEmpty()) put(key, tools)
                key in format.choiceFields && (
                    tools.isEmpty() || value.containsAnyString(removedNames)
                    ) -> {
                    if (replaceRemovedChoiceWithNativeSearch && key == "tool_choice") {
                        put(key, buildJsonObject { put("type", NativeWebSearchType) })
                    }
                }
                else -> put(key, value)
            }
        }
    }

    private fun JsonObject.withoutBridgeChoice(format: ProviderWireFormat): JsonObject {
        if (format.choiceFields.none { field -> this[field]?.containsAnyString(setOf(AgentNativeWebSearchBridgeTool)) == true }) {
            return this
        }
        return JsonObject(filterKeys { it !in format.choiceFields })
    }

    private fun removeGoogleBridgeTools(tools: JsonArray): JsonArray = JsonArray(
        tools.mapNotNull { element ->
            val declaration = element as? JsonObject ?: return@mapNotNull element
            val functions = declaration["functionDeclarations"] as? JsonArray
                ?: return@mapNotNull declaration
            val retained = JsonArray(functions.filterNot { function ->
                function.directToolName() == AgentNativeWebSearchBridgeTool
            })
            when {
                retained.isNotEmpty() -> buildJsonObject {
                    declaration.forEach { (key, value) -> put(key, value) }
                    put("functionDeclarations", retained)
                }
                declaration.size > 1 -> JsonObject(declaration - "functionDeclarations")
                else -> null
            }
        },
    )

    private fun isDirectBridgeTool(element: JsonElement): Boolean =
        element.directToolName() == AgentNativeWebSearchBridgeTool

    private fun isChatBridgeTool(element: JsonElement): Boolean =
        ((element as? JsonObject)?.get("function") as? JsonObject)
            ?.string("name") == AgentNativeWebSearchBridgeTool

    private fun JsonElement.directToolName(): String? =
        (this as? JsonObject)?.string("name")

    private fun JsonElement.directToolType(): String? =
        (this as? JsonObject)?.string("type")

    private fun JsonElement.containsAnyString(targets: Set<String>): Boolean = when (this) {
        is JsonPrimitive -> contentOrNull in targets
        is JsonArray -> any { it.containsAnyString(targets) }
        is JsonObject -> values.any { it.containsAnyString(targets) }
    }

    private fun JsonObject.string(name: String): String? =
        (get(name) as? JsonPrimitive)?.contentOrNull

    private val ProviderWireFormat.choiceFields: Set<String>
        get() = when (this) {
            ProviderWireFormat.Responses,
            ProviderWireFormat.ChatCompletions,
            -> setOf("tool_choice")
            ProviderWireFormat.AnthropicMessages -> setOf("tool_choice")
            ProviderWireFormat.GoogleGemini -> setOf("toolConfig")
        }

    private val NativeWebSearchTypes = setOf("web_search", "web_search_2025_08_26")
    private const val NativeWebSearchType = "web_search"
}
