package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode

/** Small process cache for completed messages, bounded by their source character count. */
internal object MarkdownDocumentCache {
    private const val MaxCachedCharacters = 256_000
    private const val MaxEntries = 24

    private data class Key(
        val ownerKey: String,
        val hash: Int,
        val length: Int,
        val prefix: String,
        val suffix: String,
    )

    private data class Entry(
        val markdown: String,
        val nodes: List<MarkdownNode>,
        val weight: Int,
    )

    private val entries = LinkedHashMap<Key, Entry>(16, 0.75f, true)
    private var cachedCharacters = 0

    @Synchronized
    fun get(ownerKey: String, markdown: String): List<MarkdownNode>? {
        val entry = entries[keyOf(ownerKey, markdown)] ?: return null
        return entry.nodes.takeIf { entry.markdown == markdown }
    }

    @Synchronized
    fun put(ownerKey: String, markdown: String, nodes: List<MarkdownNode>) {
        if (markdown.isEmpty() || markdown.length > MaxCachedCharacters / 2) return
        val key = keyOf(ownerKey, markdown)
        entries.remove(key)?.let { cachedCharacters -= it.weight }
        val stableSnapshot = nodes.toList()
        val entry = Entry(markdown = markdown, nodes = stableSnapshot, weight = markdown.length)
        entries[key] = entry
        cachedCharacters += entry.weight
        trim()
    }

    @Synchronized
    fun clear() {
        entries.clear()
        cachedCharacters = 0
    }

    @Synchronized
    fun removeScopes(scopeKeys: Set<String>) {
        if (scopeKeys.isEmpty()) return
        val iterator = entries.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (scopeKeys.none { scope -> entry.key.ownerKey.belongsToScope(scope) }) continue
            cachedCharacters -= entry.value.weight
            iterator.remove()
        }
    }

    private fun trim() {
        val iterator = entries.entries.iterator()
        while ((cachedCharacters > MaxCachedCharacters || entries.size > MaxEntries) && iterator.hasNext()) {
            cachedCharacters -= iterator.next().value.weight
            iterator.remove()
        }
    }

    private fun keyOf(ownerKey: String, markdown: String) = Key(
        ownerKey = ownerKey,
        hash = markdown.hashCode(),
        length = markdown.length,
        prefix = markdown.take(24),
        suffix = markdown.takeLast(24),
    )
}

private fun String.belongsToScope(scope: String): Boolean = this == scope || startsWith("$scope:")
