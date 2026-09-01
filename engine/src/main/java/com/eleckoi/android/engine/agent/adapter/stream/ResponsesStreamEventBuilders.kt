package com.eleckoi.android.engine.agent.adapter

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Protocol-only JSON builders kept separate from the stateful stream translator. */
internal fun responsesToolItem(
    state: ToolStreamState,
    value: String,
    status: String? = null,
): JsonObject = buildJsonObject {
    put(
        "type",
        if (state.route.kind == ResponsesToolKind.Custom) "custom_tool_call" else "function_call",
    )
    put("id", state.itemId)
    put("call_id", state.callId)
    state.route.namespace?.let { put("namespace", it) }
    put("name", state.route.responseName)
    if (state.route.kind == ResponsesToolKind.Custom) put("input", value) else put("arguments", value)
    status?.let { put("status", it) }
}

internal fun responsesReasoningItem(id: String, text: String): JsonObject = buildJsonObject {
    put("type", "reasoning")
    put("id", id)
    put("summary", JsonArray(emptyList()))
    put(
        "content",
        if (text.isEmpty()) {
            JsonArray(emptyList())
        } else {
            buildJsonArray {
                add(buildJsonObject {
                    put("type", "reasoning_text")
                    put("text", text)
                })
            }
        },
    )
    put("encrypted_content", JsonNull)
}

internal fun responsesMessageItem(
    id: String,
    text: String,
    phase: String?,
    includeTextPart: Boolean,
): JsonObject = buildJsonObject {
    put("type", "message")
    put("id", id)
    put("role", "assistant")
    phase?.let { put("phase", it) }
    put(
        "content",
        if (!includeTextPart) {
            JsonArray(emptyList())
        } else {
            buildJsonArray {
                add(buildJsonObject {
                    put("type", "output_text")
                    put("text", text)
                })
            }
        },
    )
}

internal fun responsesEvent(
    type: String,
    body: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit,
): ResponsesSseEvent = ResponsesSseEvent(type, buildJsonObject {
    put("type", type)
    body()
})

internal fun responsesUsage(
    upstreamUsage: ChatCompletionUsage?,
    estimatedInputTokens: Int,
    text: CharSequence,
    reasoning: CharSequence,
    toolCalls: Map<Int, ToolAccumulator>,
): JsonObject {
    val actual = upstreamUsage
    val inputTokens = actual?.promptTokens ?: estimatedInputTokens.coerceAtLeast(0)
    val outputTokens = actual?.completionTokens ?: approximateTokenCount(
        buildString {
            append(text)
            append(reasoning)
            toolCalls.values.forEach { call ->
                append(call.name)
                append(call.arguments)
            }
        },
    )
    val totalTokens = actual?.totalTokens ?: inputTokens.saturatingAdd(outputTokens)
    return buildJsonObject {
        put("input_tokens", inputTokens)
        put(
            "input_tokens_details",
            actual?.cacheReadTokens?.let { cachedTokens ->
                buildJsonObject { put("cached_tokens", cachedTokens) }
            } ?: JsonNull,
        )
        put("output_tokens", outputTokens)
        put("output_tokens_details", JsonNull)
        put("total_tokens", totalTokens)
    }
}
