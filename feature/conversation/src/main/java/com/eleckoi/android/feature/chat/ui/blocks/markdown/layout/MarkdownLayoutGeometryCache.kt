package com.eleckoi.android.feature.chat.ui.blocks.markdown.layout

import android.content.Context

/**
 * Lightweight scroll geometry retained after heavyweight layouts are evicted.
 *
 * The key deliberately contains no Markdown source, nodes, spans or Android layouts. A retained
 * entry is one owner string, scalar style fields and one measured height, allowing an old message
 * to hold its LazyColumn anchor while its real document is rebuilt in the background.
 */
internal data class MarkdownLayoutGeometryKey(
    val cacheOwnerKey: String,
    val sourceHash: Int,
    val sourceLength: Int,
    val widthPx: Int,
    val fontSizeBits: Int,
    val lineHeightBits: Int,
    val letterSpacingBits: Int,
    val paragraphSpacingBits: Int,
    // Line heights are measured with the typeface in hand, so cached geometry from a previous font
    // reports the wrong height and the message either clips or leaves a gap.
    val typefaceRevision: Int = 0,
    // Code style, wrapping and full-height mode all change a document's measured height without
    // changing its Markdown source.
    val codeBlockLayoutRevision: Int = 0,
)

internal object MarkdownLayoutGeometryCache {
    private const val MaxEntries = 1_024
    private const val PreferenceName = "markdown_layout_geometry_v1"
    private const val StoredKeysEntry = "__stored_keys__"

    private val entries = object : LinkedHashMap<MarkdownLayoutGeometryKey, Int>(128, 0.75f, true) {
        override fun removeEldestEntry(
            eldest: MutableMap.MutableEntry<MarkdownLayoutGeometryKey, Int>?,
        ): Boolean = size > MaxEntries
    }

    /** In-process lookup retained for callers and tests that do not need disk restoration. */
    @Synchronized
    fun get(key: MarkdownLayoutGeometryKey): Int? = entries[key]

    /** In-process update retained for transient or streaming layouts. */
    @Synchronized
    fun put(key: MarkdownLayoutGeometryKey, heightPx: Int) {
        if (heightPx <= 0) return
        entries[key] = heightPx
    }

    @Synchronized
    fun get(context: Context, key: MarkdownLayoutGeometryKey): Int? {
        entries[key]?.let { return it }
        val stored = context.getSharedPreferences(PreferenceName, Context.MODE_PRIVATE)
            .getInt(key.persistentStorageKey(), 0)
            .takeIf { it > 0 }
            ?: return null
        entries[key] = stored
        return stored
    }

    @Synchronized
    fun put(
        context: Context,
        key: MarkdownLayoutGeometryKey,
        heightPx: Int,
        persistAcrossProcessRestart: Boolean,
    ) {
        if (heightPx <= 0) return
        entries[key] = heightPx
        if (!persistAcrossProcessRestart) return

        val preferences = context.getSharedPreferences(PreferenceName, Context.MODE_PRIVATE)
        val storageKey = key.persistentStorageKey()
        if (preferences.getInt(storageKey, 0) == heightPx) return
        val storedKeys = preferences.getStringSet(StoredKeysEntry, emptySet())
            .orEmpty()
            .toMutableSet()
        storedKeys += storageKey
        val editor = preferences.edit().putInt(storageKey, heightPx)
        while (storedKeys.size > MaxEntries) {
            val evicted = storedKeys.firstOrNull { it != storageKey } ?: break
            storedKeys.remove(evicted)
            editor.remove(evicted)
        }
        editor.putStringSet(StoredKeysEntry, storedKeys.toSet()).apply()
    }

    @Synchronized
    fun clear() {
        entries.clear()
    }
}

/** Exact style/content key; no Markdown source or rendered layout is persisted. */
private fun MarkdownLayoutGeometryKey.persistentStorageKey(): String = buildString {
    append("v1:")
    append(cacheOwnerKey.length)
    append(':')
    append(cacheOwnerKey)
    append(':')
    append(sourceHash)
    append(':')
    append(sourceLength)
    append(':')
    append(widthPx)
    append(':')
    append(fontSizeBits)
    append(':')
    append(lineHeightBits)
    append(':')
    append(letterSpacingBits)
    append(':')
    append(paragraphSpacingBits)
    append(':')
    append(typefaceRevision)
    append(':')
    append(codeBlockLayoutRevision)
}
