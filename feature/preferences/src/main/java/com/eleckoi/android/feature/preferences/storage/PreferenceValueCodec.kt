package com.eleckoi.android.feature.preferences

import com.eleckoi.android.foundation.serialization.ElecKoiJson
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.encodeToString

internal fun encodeStringList(values: List<String>): String {
    return ElecKoiJson.encodeToString(values.filter { it.isNotBlank() }.distinct())
}

internal fun decodeStringList(value: String): List<String> {
    return runCatching {
        ElecKoiJson.decodeFromString(
            ListSerializer(String.serializer()),
            value,
        ).filter { it.isNotBlank() }.distinct()
    }.getOrDefault(emptyList())
}

internal fun encodeStringMap(values: Map<String, String>): String {
    val normalized = values
        .mapKeys { (key, _) -> key.trim() }
        .mapValues { (_, value) -> value.trim() }
        .filter { (key, value) -> key.isNotBlank() && value.isNotBlank() }
    return ElecKoiJson.encodeToString(
        MapSerializer(String.serializer(), String.serializer()),
        normalized,
    )
}

internal fun decodeStringMap(value: String): Map<String, String> {
    return runCatching {
        ElecKoiJson.decodeFromString(
            MapSerializer(String.serializer(), String.serializer()),
            value,
        ).filter { (key, sessionId) -> key.isNotBlank() && sessionId.isNotBlank() }
    }.getOrDefault(emptyMap())
}

internal fun encodeBooleanMap(values: Map<String, Boolean>): String {
    val normalized = values.filterKeys { it.isNotBlank() }
    return ElecKoiJson.encodeToString(
        MapSerializer(String.serializer(), Boolean.serializer()),
        normalized,
    )
}

internal fun decodeBooleanMap(value: String): Map<String, Boolean> {
    return runCatching {
        ElecKoiJson.decodeFromString(
            MapSerializer(String.serializer(), Boolean.serializer()),
            value,
        ).filterKeys { it.isNotBlank() }
    }.getOrDefault(emptyMap())
}

internal fun normalizeHistoryMode(value: String): String {
    return if (value == "recent10") "recent10" else "all"
}

