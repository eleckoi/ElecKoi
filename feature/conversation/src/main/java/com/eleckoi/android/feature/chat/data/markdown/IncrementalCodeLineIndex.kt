package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeContent

/** Append-only code line index used only by the growing Markdown tail. */
internal class IncrementalCodeLineIndex {
    private var eventStart = -1
    private var scannedUntil = 0
    private var bodyStart = 0
    private var language = ""
    private var starts = IntArray(32)
    private var lineCount = 1
    private var currentColumns = 0
    private var maxColumns = 0

    fun update(eventStart: Int, source: String, blockEnd: Int): MarkdownCodeContent {
        if (this.eventStart != eventStart || scannedUntil > blockEnd) reset(eventStart, source, blockEnd)
        scan(source, scannedUntil, blockEnd)
        scannedUntil = blockEnd
        return MarkdownCodeContent.indexedSnapshot(
            language = language,
            source = source,
            bodyStart = bodyStart,
            bodyEnd = blockEnd,
            lineStarts = starts,
            lineCount = lineCount,
            maxVisualColumns = maxOf(maxColumns, currentColumns, 1),
        )
    }

    fun clear() {
        eventStart = -1
        scannedUntil = 0
        bodyStart = 0
        language = ""
        starts = IntArray(32)
        lineCount = 1
        currentColumns = 0
        maxColumns = 0
    }

    private fun reset(eventStart: Int, source: String, blockEnd: Int) {
        clear()
        this.eventStart = eventStart
        val firstLineEnd = source.indexOf('\n', eventStart).let { if (it < 0 || it > blockEnd) blockEnd else it }
        val firstLine = source.substring(eventStart, firstLineEnd).trim()
        val marker = when {
            firstLine.startsWith("```") -> "```"
            firstLine.startsWith("~~~") -> "~~~"
            else -> ""
        }
        language = if (marker.isEmpty()) "" else firstLine.removePrefix(marker).trim()
        bodyStart = if (marker.isEmpty()) eventStart else (firstLineEnd + 1).coerceAtMost(blockEnd)
        starts[0] = bodyStart
        scannedUntil = bodyStart
    }

    private fun scan(source: String, from: Int, to: Int) {
        var index = from.coerceAtLeast(bodyStart)
        while (index < to) {
            val codePoint = source.codePointAt(index)
            if (codePoint == '\n'.code) {
                maxColumns = maxOf(maxColumns, currentColumns)
                currentColumns = 0
                ensureCapacity(lineCount + 1)
                starts[lineCount++] = index + 1
            } else {
                currentColumns += when {
                    codePoint == '\t'.code -> 4
                    codePoint >= 0x1100 -> 2
                    else -> 1
                }
            }
            index += Character.charCount(codePoint)
        }
    }

    private fun ensureCapacity(required: Int) {
        if (required <= starts.size) return
        starts = starts.copyOf(maxOf(required, starts.size * 2))
    }
}
