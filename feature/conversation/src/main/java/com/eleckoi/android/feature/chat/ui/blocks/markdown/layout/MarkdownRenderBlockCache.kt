package com.eleckoi.android.feature.chat.ui.blocks.markdown.layout

import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode

internal data class MarkdownRenderBlockKey(
    val cacheOwnerKey: String,
    val node: MarkdownNode,
    val widthPx: Int,
    val textColorArgb: Int,
    val quoteColorArgb: Int,
    val inlineColors: MarkdownInlineColorPalette,
    val fontSizeBits: Int,
    val lineHeightBits: Int,
    val letterSpacingBits: Int,
    val typefaceRevision: Int,
)

/** Stable Markdown blocks survive document-tail changes without being laid out again. */
internal object MarkdownRenderBlockCache {
    private const val MaxEntries = 64
    private const val MaxCharacters = 192_000
    private const val MinRetainedEntries = 2

    private data class Entry(val block: MarkdownRenderBlock, val weight: Int)
    private val entries = object : LinkedHashMap<MarkdownRenderBlockKey, Entry>(32, 0.75f, true) {}
    private var characters = 0

    @Synchronized
    fun get(key: MarkdownRenderBlockKey): MarkdownRenderBlock? = entries[key]?.block

    @Synchronized
    fun put(key: MarkdownRenderBlockKey, block: MarkdownRenderBlock) {
        entries.remove(key)?.let { characters -= it.weight }
        val entry = Entry(block, nodeCharacterWeight(key.node).coerceAtLeast(1))
        entries[key] = entry
        characters += entry.weight
        val iterator = entries.entries.iterator()
        // Do not discard a just-built oversized block. Two MRU blocks cover the boundary between
        // adjacent long sections while the normal count/weight limits still bound older content.
        while (
            (entries.size > MaxEntries || characters > MaxCharacters) &&
                entries.size > MinRetainedEntries &&
                iterator.hasNext()
        ) {
            characters -= iterator.next().value.weight
            iterator.remove()
        }
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
            if (scopeKeys.none { scope -> entry.key.cacheOwnerKey.belongsToScope(scope) }) continue
            characters -= entry.value.weight
            iterator.remove()
        }
    }
}

private fun String.belongsToScope(scope: String): Boolean = this == scope || startsWith("$scope:")
