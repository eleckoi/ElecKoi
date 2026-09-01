package com.eleckoi.android.engine.agent.adapter

import java.util.UUID
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

internal class ResponsesAdapterException(message: String) : IllegalArgumentException(message)

internal enum class ResponsesToolKind {
    Function,
    Custom,
}

internal data class ResponsesToolRoute(
    val chatName: String,
    val namespace: String?,
    val responseName: String,
    val kind: ResponsesToolKind = ResponsesToolKind.Function,
)

internal data class ResponsesTranslationFailure(
    val code: String,
    val message: String,
    val fields: Map<String, Any?>,
)

internal data class ResponsesToolResultFailure(
    val callId: String,
    val toolName: String,
    val code: String,
    val message: String,
    val outputChars: Int,
)

internal data class AdaptedChatCompletionsRequest(
    val body: JsonObject,
    val toolRoutes: Map<String, ResponsesToolRoute>,
    val estimatedInputTokens: Int,
    val priorToolFailures: List<ResponsesToolResultFailure> = emptyList(),
)



internal fun approximateTokenCount(value: String): Int =
    ((value.toByteArray(Charsets.UTF_8).size + 3L) / 4L)
        .coerceAtMost(Int.MAX_VALUE.toLong())
        .toInt()

internal fun Int.saturatingAdd(other: Int): Int =
    (toLong() + other.toLong())
        .coerceAtMost(Int.MAX_VALUE.toLong())
        .toInt()
