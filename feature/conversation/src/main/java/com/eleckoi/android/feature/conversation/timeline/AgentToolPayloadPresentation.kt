package com.eleckoi.android.feature.conversation.timeline

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

internal fun JsonObject?.pathsFromObjects(field: String): List<String> =
    (this?.get(field) as? JsonArray)
        .orEmpty()
        .mapNotNull { element ->
            (element as? JsonObject)?.string("path")
        }
        .filter(String::isNotBlank)
        .distinct()

internal fun JsonObject?.pathsFromStrings(field: String): List<String> =
    (this?.get(field) as? JsonArray)
        .orEmpty()
        .mapNotNull { element ->
            (element as? JsonPrimitive)?.contentOrNull
        }
        .filter(String::isNotBlank)
        .distinct()

internal fun JsonObject?.pathsFromOperations(): List<String> =
    (this?.get("operations") as? JsonArray)
        .orEmpty()
        .mapNotNull { element ->
            (element as? JsonObject)?.string("path")
        }
        .filter(String::isNotBlank)
        .distinct()

internal fun JsonObject?.patternTarget(fallback: String): String {
    val pattern = this?.string("pattern")?.takeIf(String::isNotBlank) ?: return fallback
    val count = (
        (get("matches") ?: get("paths") ?: get("entries")) as? JsonArray
        )?.size ?: 0
    return if (count > 0) "“$pattern” · $count 项" else "“$pattern” · 无匹配"
}

internal fun List<String>.summarizedPaths(fallback: String): String = when (size) {
    0 -> fallback
    1 -> first()
    2 -> joinToString("、")
    else -> "${take(2).joinToString("、")} 等 $size 项"
}
