package com.eleckoi.android.feature.chat.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.json.JSONArray
import org.json.JSONObject

internal fun JSONObject.variableValueAtPointerOrNull(pointer: String): Any {
    var current: Any = this
    pointer.removePrefix("/")
        .split("/")
        .filter(String::isNotEmpty)
        .forEach { rawToken ->
            val token = rawToken.fromVariableJsonPointerToken() ?: return JSONObject.NULL
            current = when (current) {
                is JSONObject -> if (current.has(token)) current.get(token) else return JSONObject.NULL
                is JSONArray -> {
                    val index = token.toIntOrNull() ?: return JSONObject.NULL
                    if (index in 0 until current.length()) current.get(index) else return JSONObject.NULL
                }
                else -> return JSONObject.NULL
            }
        }
    return current
}

internal fun JSONObject.containsVariablePointer(pointer: String): Boolean {
    var current: Any = this
    pointer.removePrefix("/")
        .split("/")
        .filter(String::isNotEmpty)
        .forEach { rawToken ->
            val token = rawToken.fromVariableJsonPointerToken() ?: return false
            current = when (current) {
                is JSONObject -> {
                    if (!current.has(token)) return false
                    current.get(token)
                }
                is JSONArray -> {
                    val index = token.toIntOrNull() ?: return false
                    if (index !in 0 until current.length()) return false
                    current.get(index)
                }
                else -> return false
            }
        }
    return true
}

internal fun JSONObject.variableObjectAtSegments(segments: List<String>): JSONObject? {
    var current: JSONObject = this
    segments.forEach { segment ->
        current = current.optJSONObject(segment) ?: return null
    }
    return current
}

internal fun Any?.inferredCharacterVariableType(): String = when (this) {
    null, JSONObject.NULL -> "null"
    is Boolean -> "boolean"
    is Number -> "number"
    is String -> "string"
    is JSONArray -> "array"
    is JSONObject -> "object"
    else -> "unknown"
}

internal fun String.variableJsonPointerLeaf(): String =
    substringAfterLast('/').fromVariableJsonPointerToken().orEmpty()

internal fun String.variableJsonPointerParent(): String =
    substringBeforeLast('/', missingDelimiterValue = "")

internal fun String.toVariableJsonPointerToken(): String = replace("~", "~0").replace("/", "~1")

internal fun String.fromVariableJsonPointerToken(): String? {
    val result = StringBuilder(length)
    var index = 0
    while (index < length) {
        if (this[index] != '~') {
            result.append(this[index++])
            continue
        }
        if (index + 1 >= length) return null
        result.append(
            when (this[index + 1]) {
                '0' -> '~'
                '1' -> '/'
                else -> return null
            },
        )
        index += 2
    }
    return result.toString()
}

internal fun normalizeVariableGroupPrefix(value: String): String? {
    val normalized = value.trim().trimEnd('/')
    if (normalized.isBlank() || normalized == "/") return ""
    val pointer = normalized.removePrefix("/")
    val segments = pointer.split('/').filter(String::isNotBlank)
    if (segments.isEmpty() || segments.any { it.fromVariableJsonPointerToken() == null }) return null
    return "/" + segments.joinToString("/")
}

internal fun JsonObject.variableString(name: String): String? =
    (get(name) as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)

internal fun JsonObject.variableBoolean(name: String, default: Boolean = false): Boolean =
    (get(name) as? JsonPrimitive)
        ?.contentOrNull
        ?.equals("true", ignoreCase = true)
        ?: default

internal fun JsonObject.variableStringArray(name: String): List<String> =
    (get(name) as? JsonArray)
        .orEmpty()
        .mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank) }
