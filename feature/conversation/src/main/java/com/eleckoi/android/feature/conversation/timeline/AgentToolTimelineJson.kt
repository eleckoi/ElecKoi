package com.eleckoi.android.feature.conversation.timeline

import com.eleckoi.android.foundation.serialization.ElecKoiJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

internal fun String.jsonObjectOrNull(): JsonObject? {
    val value = trim()
    if (value.isBlank()) return null
    return runCatching {
        ElecKoiJson.parseToJsonElement(value) as? JsonObject
    }.getOrNull()
}

internal fun String.withLineNumbersRemoved(): String = lineSequence()
    .joinToString("\n") { line ->
        val separator = line.indexOf('\t')
        if (separator > 0 && line.substring(0, separator).all(Char::isDigit)) {
            line.substring(separator + 1)
        } else {
            line
        }
    }


internal fun JsonObject.string(name: String): String? =
    (get(name) as? JsonPrimitive)?.contentOrNull

internal fun JsonObject.primitive(name: String): JsonPrimitive? =
    get(name) as? JsonPrimitive

internal fun JsonObject.displayValue(name: String): String? = when (val value = get(name)) {
    null -> null
    is JsonPrimitive -> value.contentOrNull ?: value.toString()
    else -> value.toString()
}
