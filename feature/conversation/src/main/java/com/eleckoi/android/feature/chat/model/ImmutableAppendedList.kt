package com.eleckoi.android.feature.chat.model

import java.util.RandomAccess

/**
 * Immutable view over a stable history prefix and one changing tail item.
 *
 * Streaming layers can pass this through projection boundaries without copying every history
 * reference for each frame. Consumers that understand the shape may project [prefix] once and
 * only update [tail]; ordinary List consumers still see normal indexed list semantics.
 */
class ImmutableAppendedList<T>(
    val prefix: List<T>,
    val tail: T,
) : AbstractList<T>(), RandomAccess {
    override val size: Int = prefix.size + 1

    override fun get(index: Int): T = when {
        index < 0 || index >= size -> throw IndexOutOfBoundsException("index=$index, size=$size")
        index < prefix.size -> prefix[index]
        else -> tail
    }
}
