package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode

/**
 * Retains the last painted streaming AST long enough for another Compose owner to adopt it.
 *
 * A DSH answer can move from the process timeline into the final-answer slot in one state update.
 * Those are different composition locations even when [ownerKey] and source text are identical, so
 * the destination parser starts cold unless the already parsed nodes are handed across explicitly.
 * Entries are immutable references, not copies, and only the newest revision per owner is retained.
 */
internal object MarkdownLiveDocumentHandoffCache {
    private const val MaxEntries = 8
    private const val MaxCharacters = 128_000
    private const val MinRetainedEntries = 1

    private data class Entry(
        val markdown: String,
        val nodes: List<MarkdownNode>,
        val weight: Int,
    )

    private val entries = object : LinkedHashMap<String, Entry>(12, 0.75f, true) {}
    private var characters = 0

    @Synchronized
    fun get(ownerKey: String, markdown: String): List<MarkdownNode>? {
        val entry = entries[ownerKey] ?: return null
        return entry.nodes.takeIf { entry.markdown == markdown }
    }

    @Synchronized
    fun put(ownerKey: String, markdown: String, nodes: List<MarkdownNode>) {
        if (ownerKey.isBlank() || markdown.isEmpty() || nodes.isEmpty()) return
        entries.remove(ownerKey)?.let { characters -= it.weight }
        entries[ownerKey] = Entry(
            markdown = markdown,
            nodes = nodes,
            weight = markdown.length.coerceAtLeast(1),
        )
        characters += markdown.length.coerceAtLeast(1)
        trim()
    }

    @Synchronized
    fun clear() {
        entries.clear()
        characters = 0
    }

    @Synchronized
    fun removeScopes(scopeKeys: Set<String>) {
        if (scopeKeys.isEmpty()) return
        val iterator = entries.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            if (scopeKeys.none { scope -> entry.key.belongsToScope(scope) }) continue
            characters -= entry.value.weight
            iterator.remove()
        }
    }

    private fun trim() {
        val iterator = entries.entries.iterator()
        while (
            (entries.size > MaxEntries || characters > MaxCharacters) &&
                entries.size > MinRetainedEntries &&
                iterator.hasNext()
        ) {
            characters -= iterator.next().value.weight
            iterator.remove()
        }
    }
}

private fun String.belongsToScope(scope: String): Boolean = this == scope || startsWith("$scope:")
