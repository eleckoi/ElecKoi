package com.eleckoi.android.engine.agent.adapter

import com.eleckoi.android.foundation.serialization.ElecKoiJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

internal fun parseCustomToolInput(arguments: String): String? {
    val parsed = runCatching { ElecKoiJson.parseToJsonElement(arguments) }.getOrNull()
    val input = when (parsed) {
        is JsonPrimitive -> parsed.contentOrNull
        is JsonObject -> CustomToolInputAliases.firstNotNullOfOrNull { name ->
            (parsed[name] as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)
        }
        else -> null
    } ?: arguments.takeIf { it.trimStart().startsWith("*** Begin Patch") }
    return input
        ?.removePrefix("apply_patch\n")
        ?.removePrefix("apply_patch\r\n")
        ?.takeIf(String::isNotBlank)
}

internal fun safeToolName(value: String): String = value
    .filter { it.isLetterOrDigit() || it == '_' || it == '-' || it == '.' }
    .take(MaxDiagnosticToolNameChars)
    .ifBlank { "<empty>" }

internal fun JsonObject.stringOrNull(name: String): String? =
    (get(name) as? JsonPrimitive)?.contentOrNull

internal fun JsonObject.reasoningField(): Pair<String, String>? =
    ReasoningFields.firstNotNullOfOrNull { name ->
        get(name).reasoningValueText().takeIf(String::isNotEmpty)?.let { name to it }
    }

private fun JsonElement?.reasoningValueText(): String = when (this) {
    is JsonPrimitive -> contentOrNull.orEmpty()
    is JsonArray -> joinToString(separator = "") { it.reasoningValueText() }
    is JsonObject -> ReasoningObjectFields.firstNotNullOfOrNull { name ->
        get(name).reasoningValueText().takeIf(String::isNotEmpty)
    }.orEmpty()
    else -> ""
}

private const val MaxDiagnosticToolNameChars = 96
private val CustomToolInputAliases = listOf("input", "patch", "command")
private val ReasoningFields = listOf(
    "reasoning_content",
    "reasoning",
    "analysis",
    "thinking",
    "reasoning_details",
)
private val ReasoningObjectFields = listOf("text", "content", "summary")
