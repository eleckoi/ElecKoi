package com.eleckoi.android.compatibility.mvu.importer

internal data class UpdateRules(
    val byPath: Map<String, String>,
    val byLeaf: Map<String, String>,
) {
    fun forPath(path: List<String>): String {
        val normalized = path.filter(String::isNotBlank).joinToString(".")
        return byPath[normalized] ?: byLeaf[path.lastOrNull().orEmpty()].orEmpty()
    }

    companion object {
        val Empty = UpdateRules(emptyMap(), emptyMap())
    }
}

internal fun parseUpdateRules(source: String): UpdateRules {
    if (source.isBlank()) return UpdateRules.Empty
    val lines = source.lines()
    val collected = linkedMapOf<String, MutableList<String>>()
    val path = mutableListOf<Pair<Int, String>>()
    var index = 0
    while (index < lines.size) {
        val line = lines[index]
        val trimmed = line.trim()
        if (trimmed.isBlank() || trimmed.startsWith('-') || ':' !in trimmed) {
            index++
            continue
        }
        val indent = line.leadingWhitespace()
        val key = trimmed.substringBefore(':').trim().trim('"', '\'')
        while (path.isNotEmpty() && indent <= path.last().first) path.removeAt(path.lastIndex)
        if (key == "check") {
            val end = generateSequence(index + 1) { it + 1 }
                .takeWhile { it < lines.size }
                .firstOrNull { next ->
                    lines[next].isNotBlank() && lines[next].leadingWhitespace() <= indent
                } ?: lines.size
            val checks = (index + 1 until end)
                .map { next -> lines[next].trim() }
                .filter(String::isNotBlank)
            val rulePath = path.map { segment -> segment.second }
                .filterNot { segment -> segment == "变量更新规则" }
                .joinToString(".")
            if (rulePath.isNotBlank() && checks.isNotEmpty()) {
                collected.getOrPut(rulePath) { mutableListOf() } += checks
            }
            index = end
            continue
        }
        if (trimmed.endsWith(':') && key !in setOf("变量更新规则", "type", "range")) {
            path += indent to key
        }
        index++
    }
    val byPath = collected.mapValues { (_, values) -> values.distinct().joinToString("\n") }
    val byLeaf = linkedMapOf<String, MutableList<String>>()
    byPath.forEach { (rulePath, rule) ->
        val leaf = rulePath.substringAfterLast('.').trim()
        if (leaf.isNotBlank()) byLeaf.getOrPut(leaf) { mutableListOf() } += rule
    }
    return UpdateRules(
        byPath = byPath,
        byLeaf = byLeaf.mapValues { (_, values) -> values.distinct().joinToString("\n") },
    )
}

private fun String.leadingWhitespace(): Int = indexOfFirst { !it.isWhitespace() }
    .takeIf { it >= 0 }
    ?: length
