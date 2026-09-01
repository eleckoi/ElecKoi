package com.eleckoi.android.feature.chat.data.stream

import com.eleckoi.android.feature.chat.model.content.ChatContentBlock

internal object ChatContentBlockCache {
    private const val MaxEntries = 24
    private const val MaxCharacters = 256_000

    private data class Key(
        val ownerKey: String,
        val hash: Int,
        val length: Int,
        val prefix: String,
        val suffix: String,
    )
    private data class Entry(val source: String, val blocks: List<ChatContentBlock>)
    private val entries = object : LinkedHashMap<Key, Entry>(16, 0.75f, true) {}
    private var characters = 0

    @Synchronized
    fun get(ownerKey: String, source: String): List<ChatContentBlock>? {
        val entry = entries[key(ownerKey, source)] ?: return null
        return entry.blocks.takeIf { entry.source == source }
    }

    @Synchronized
    fun put(ownerKey: String, source: String, blocks: List<ChatContentBlock>) {
        if (source.isEmpty() || source.length > MaxCharacters / 2) return
        val key = key(ownerKey, source)
        entries.remove(key)?.let { characters -= it.source.length }
        entries[key] = Entry(source = source, blocks = blocks.toList())
        characters += source.length
        val iterator = entries.entries.iterator()
        while ((entries.size > MaxEntries || characters > MaxCharacters) && iterator.hasNext()) {
            characters -= iterator.next().value.source.length
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
            if (scopeKeys.none { scope -> entry.key.ownerKey.belongsToScope(scope) }) continue
            characters -= entry.value.source.length
            iterator.remove()
        }
    }

    private fun key(ownerKey: String, source: String) = Key(
        ownerKey = ownerKey,
        hash = source.hashCode(),
        length = source.length,
        prefix = source.take(20),
        suffix = source.takeLast(20),
    )
}

private fun String.belongsToScope(scope: String): Boolean = this == scope || startsWith("$scope:")
