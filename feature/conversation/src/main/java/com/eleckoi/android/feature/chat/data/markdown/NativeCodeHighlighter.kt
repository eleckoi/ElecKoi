package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeHighlightSpan

/** Owns Grok Build's incremental syntect state for the current Markdown document. */
internal class NativeCodeHighlighter : AutoCloseable {
    private var handle: Long = nativeCreate()

    @Synchronized
    fun highlight(
        fenceInfo: String,
        startInTail: Int,
        bodyReachesEof: Boolean,
        text: String,
        bodyStartOffset: Int,
    ): List<MarkdownCodeHighlightSpan> {
        check(handle != 0L) { "Code highlighter is closed" }
        val payload = nativeHighlight(handle, fenceInfo, startInTail, bodyReachesEof, text)
        if (payload.isEmpty()) return emptyList()
        val declaredCount = payload[0].coerceAtLeast(0)
        val count = minOf(declaredCount, (payload.size - 1) / PayloadWidth)
        return List(count) { index ->
            val base = 1 + index * PayloadWidth
            MarkdownCodeHighlightSpan(
                start = bodyStartOffset + payload[base],
                end = bodyStartOffset + payload[base + 1],
                lightColorArgb = payload[base + 2],
                darkColorArgb = payload[base + 3],
                brightColorArgb = payload[base + 4],
                fontStyle = payload[base + 5],
            )
        }
    }

    @Synchronized
    fun reset() {
        check(handle != 0L) { "Code highlighter is closed" }
        nativeReset(handle)
    }

    @Synchronized
    override fun close() {
        val current = handle
        if (current == 0L) return
        handle = 0L
        nativeDestroy(current)
    }

    private external fun nativeCreate(): Long
    private external fun nativeHighlight(
        handle: Long,
        fenceInfo: String,
        startInTail: Int,
        bodyReachesEof: Boolean,
        text: String,
    ): IntArray
    private external fun nativeReset(handle: Long)
    private external fun nativeDestroy(handle: Long)

    private companion object {
        const val PayloadWidth = 6

        init {
            NativeMarkdownRuntime.ensureLoaded()
        }
    }
}
