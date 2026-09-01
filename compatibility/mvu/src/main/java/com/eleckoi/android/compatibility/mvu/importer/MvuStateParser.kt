package com.eleckoi.android.compatibility.mvu.importer

import org.json.JSONArray
import org.json.JSONObject

internal fun parseStateObject(source: String): JSONObject? {
    val trimmed = source.trim()
        .removePrefix("```yaml").removePrefix("```yml").removePrefix("```json")
        .removeSuffix("```").trim()
    if (trimmed.isBlank()) return null
    runCatching { return JSONObject(trimmed) }
    val root = JSONObject()
    val stack = mutableListOf(-1 to root)
    trimmed.lineSequence().forEach { raw ->
        val line = raw.substringBefore('#').trimEnd()
        if (line.isBlank() || ':' !in line) return@forEach
        val indent = line.indexOfFirst { !it.isWhitespace() }.coerceAtLeast(0)
        val key = line.trimStart().substringBefore(':').trim().trim('"', '\'')
        val text = line.trimStart().substringAfter(':').trim()
        while (stack.size > 1 && indent <= stack.last().first) stack.removeAt(stack.lastIndex)
        val parent = stack.last().second
        if (text.isBlank()) {
            val child = JSONObject()
            parent.put(key, child)
            stack += indent to child
        } else {
            parent.put(key, scalarValue(text))
        }
    }
    return root.takeIf { it.length() > 0 }
}

private fun scalarValue(text: String): Any {
    val value = text.trim()
    if (value == "{}") return JSONObject()
    if (value == "[]") return JSONArray()
    if (value.startsWith("[") && value.endsWith("]")) {
        runCatching { return JSONArray(value.replace('\'', '"')) }
    }
    if (value.equals("true", true)) return true
    if (value.equals("false", true)) return false
    if (value.equals("null", true)) return JSONObject.NULL
    return value.toLongOrNull() ?: value.toDoubleOrNull() ?: value.trim('"', '\'')
}
