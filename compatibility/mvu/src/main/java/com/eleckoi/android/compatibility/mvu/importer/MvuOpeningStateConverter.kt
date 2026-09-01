package com.eleckoi.android.compatibility.mvu.importer

import org.json.JSONArray
import org.json.JSONObject

internal fun patchedOpeningState(baseState: String, opening: String): String {
    val inlineInitialState = Regex(
        "<initvar(?:\\s[^>]*)?>([\\s\\S]*?)</initvar>",
        RegexOption.IGNORE_CASE,
    ).find(opening)?.groupValues?.getOrNull(1)?.let(::parseStateObject)
    val seededState = JSONObject(baseState.ifBlank { "{}" }).also { state ->
        inlineInitialState?.let { initial -> mergeState(state, initial) }
    }
    val patch = Regex("<JSONPatch>([\\s\\S]*?)</JSONPatch>", RegexOption.IGNORE_CASE)
        .find(opening)?.groupValues?.getOrNull(1)?.trim().orEmpty()
    if (patch.isBlank()) {
        return if (inlineInitialState != null) seededState.toString(2) else ""
    }
    val normalized = runCatching {
        val source = JSONArray(patch)
        JSONArray().also { output ->
            for (index in 0 until source.length()) {
                val item = source.optJSONObject(index) ?: continue
                val path = item.optString("path")
                output.put(
                    JSONObject(item.toString()).put(
                        "path",
                        when {
                            path == "/stat_data" -> ""
                            path.startsWith("/stat_data/") -> path.removePrefix("/stat_data")
                            else -> path
                        },
                    ),
                )
            }
        }
    }.getOrNull() ?: return ""
    return runCatching { applyOpeningPatch(seededState.toString(), normalized).toString(2) }
        .getOrDefault("")
}

private fun mergeState(target: JSONObject, source: JSONObject) {
    source.keys().forEach { key ->
        val incoming = source.opt(key)
        val existing = target.optJSONObject(key)
        if (incoming is JSONObject && existing != null) {
            mergeState(existing, incoming)
        } else {
            target.put(key, incoming)
        }
    }
}

private fun applyOpeningPatch(baseState: String, operations: JSONArray): JSONObject {
    var state = JSONObject(baseState.ifBlank { "{}" })
    for (index in 0 until operations.length()) {
        val operation = operations.optJSONObject(index) ?: continue
        val path = operation.optString("path")
        val value = operation.opt("value")
        if (path.isBlank()) {
            if (value is JSONObject) state = JSONObject(value.toString())
            continue
        }
        val segments = path.removePrefix("/").split('/').filter(String::isNotBlank).map {
            it.replace("~1", "/").replace("~0", "~")
        }
        if (segments.isEmpty()) continue
        var parent = state
        segments.dropLast(1).forEach { segment ->
            parent = parent.optJSONObject(segment) ?: JSONObject().also { parent.put(segment, it) }
        }
        val key = segments.last()
        when (operation.optString("op").lowercase()) {
            "remove" -> parent.remove(key)
            "delta" -> {
                val current = parent.opt(key) as? Number ?: 0
                val change = value as? Number ?: 0
                parent.put(key, current.toDouble() + change.toDouble())
            }

            "add", "insert", "replace" -> if (value != null) parent.put(key, value)
        }
    }
    return state
}
