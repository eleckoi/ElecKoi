package com.eleckoi.android.feature.chat.data.stream

/**
 * Cheaply validates the append-only contract used by provider streams.
 *
 * A full prefix comparison on every delta makes a growing response quadratic. Streaming updates
 * only need deterministic boundary probes; equal-length edits still use exact equality, and any
 * detected correction resets the incremental consumer.
 */
internal fun isAppendOnlyUpdate(previous: String, current: String): Boolean {
    if (previous.isEmpty()) return true
    if (current.length < previous.length) return false
    if (current === previous) return true
    if (current.length == previous.length) return current == previous

    val sample = 24.coerceAtMost(previous.length)
    if (!current.regionMatches(0, previous, 0, sample)) return false
    if (!current.regionMatches(previous.length - sample, previous, previous.length - sample, sample)) {
        return false
    }
    if (previous.length > sample * 2) {
        val middle = previous.length / 2
        if (current[middle] != previous[middle]) return false
    }
    return true
}
