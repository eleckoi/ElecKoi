package com.eleckoi.android.feature.chat.model.markdown

import androidx.compose.runtime.Immutable

enum class MarkdownBlockType {
    Paragraph,
    Heading,
    Quote,
    OrderedList,
    UnorderedList,
    CodeFence,
    MathBlock,
    Table,
    HorizontalRule,
}

@Immutable
data class MarkdownNode(
    val id: String,
    val type: MarkdownBlockType,
    val source: String,
    val start: Int,
    val end: Int,
    val metadata: Int = 0,
    val stable: Boolean,
    val inlineSegments: List<MarkdownInlineSegment> = emptyList(),
    val code: MarkdownCodeContent? = null,
    val table: MarkdownTableContent? = null,
)

enum class MarkdownTableAlignment {
    None,
    Left,
    Center,
    Right,
}

@Immutable
data class MarkdownTableContent(
    val alignments: List<MarkdownTableAlignment>,
    val rows: List<MarkdownTableRow>,
)

@Immutable
data class MarkdownTableRow(
    val header: Boolean,
    val cells: List<MarkdownTableCell>,
)

@Immutable
data class MarkdownTableCell(
    val segments: List<MarkdownInlineSegment>,
)

@Immutable
class MarkdownCodeContent(
    val language: String,
    val text: String,
    private val bodyStart: Int,
    private val bodyEnd: Int,
    private val lineStarts: IntArray,
    private val indexedLineCount: Int,
    val maxVisualColumns: Int,
    val highlights: List<MarkdownCodeHighlightSpan> = emptyList(),
) {
    internal val bodyStartOffset: Int
        get() = bodyStart

    internal val bodyEndOffset: Int
        get() = bodyEnd

    val lineCount: Int
        get() = indexedLineCount

    val textLength: Int
        get() = bodyEnd - bodyStart

    fun accessibilityText(maxCharacters: Int): String = text.substring(
        bodyStart,
        (bodyStart + maxCharacters.coerceAtLeast(0)).coerceAtMost(bodyEnd),
    )

    fun lineAt(index: Int): String {
        require(index in 0 until indexedLineCount)
        return text.substring(lineStartAt(index), lineEndAt(index))
    }

    fun lineStartAt(index: Int): Int {
        require(index in 0 until indexedLineCount)
        return lineStarts[index]
    }

    fun lineEndAt(index: Int): Int {
        require(index in 0 until indexedLineCount)
        val start = lineStarts[index]
        var end = if (index == indexedLineCount - 1) bodyEnd else lineStarts[index + 1] - 1
        while (end > start && (text[end - 1] == '\r' || text[end - 1] == '\n')) end -= 1
        return end.coerceAtLeast(start)
    }

    /** Attaches theme-independent Grok syntax spans while retaining the immutable line index. */
    internal fun withHighlights(highlights: List<MarkdownCodeHighlightSpan>) = MarkdownCodeContent(
        language = language,
        text = text,
        bodyStart = bodyStart,
        bodyEnd = bodyEnd,
        lineStarts = lineStarts,
        indexedLineCount = indexedLineCount,
        maxVisualColumns = maxVisualColumns,
        highlights = highlights,
    )

    companion object {
        fun indexed(
            language: String,
            body: String,
        ): MarkdownCodeContent = indexed(language, body, 0, body.length)

        fun indexed(
            language: String,
            source: String,
            bodyStart: Int,
            bodyEnd: Int,
        ): MarkdownCodeContent {
            require(bodyStart in 0..bodyEnd && bodyEnd <= source.length)
            var lineCount = 1
            for (index in bodyStart until bodyEnd) if (source[index] == '\n') lineCount += 1
            if (bodyEnd > bodyStart && source[bodyEnd - 1] == '\n' && lineCount > 1) lineCount -= 1
            val starts = IntArray(lineCount.coerceAtLeast(1))
            starts[0] = bodyStart
            var nextLine = 1
            var maxColumns = 0
            var currentColumns = 0
            var index = bodyStart
            while (index < bodyEnd) {
                val codePoint = source.codePointAt(index)
                if (codePoint == '\n'.code) {
                    maxColumns = maxOf(maxColumns, currentColumns)
                    currentColumns = 0
                    if (nextLine < starts.size) starts[nextLine++] = index + 1
                } else {
                    currentColumns += when {
                        codePoint == '\t'.code -> 4
                        codePoint >= 0x1100 -> 2
                        else -> 1
                    }
                }
                index += Character.charCount(codePoint)
            }
            maxColumns = maxOf(maxColumns, currentColumns, 1)
            return MarkdownCodeContent(
                language = language,
                text = source,
                bodyStart = bodyStart,
                bodyEnd = bodyEnd,
                lineStarts = starts,
                indexedLineCount = starts.size,
                maxVisualColumns = maxColumns,
                highlights = emptyList(),
            )
        }

        internal fun indexedSnapshot(
            language: String,
            source: String,
            bodyStart: Int,
            bodyEnd: Int,
            lineStarts: IntArray,
            lineCount: Int,
            maxVisualColumns: Int,
        ) = MarkdownCodeContent(
            language = language,
            text = source,
            bodyStart = bodyStart,
            bodyEnd = bodyEnd,
            lineStarts = lineStarts,
            indexedLineCount = lineCount,
            maxVisualColumns = maxVisualColumns.coerceAtLeast(1),
            highlights = emptyList(),
        )
    }
}

@Immutable
data class MarkdownCodeHighlightSpan(
    val start: Int,
    val end: Int,
    val lightColorArgb: Int,
    val darkColorArgb: Int,
    val brightColorArgb: Int,
    val fontStyle: Int,
)

object MarkdownCodeFontStyle {
    const val Bold = 1
    const val Italic = 1 shl 1
    const val Underline = 1 shl 2
}

object MarkdownInlineStyle {
    const val Bold = 1 shl 0
    const val Italic = 1 shl 1
    const val Strike = 1 shl 2
    const val Code = 1 shl 3
    const val Link = 1 shl 4
    const val Image = 1 shl 5
    const val Math = 1 shl 6
    const val Underline = 1 shl 7
    const val Quote = 1 shl 8
}

@Immutable
data class MarkdownInlineSegment(
    val text: String,
    val style: Int,
    val destination: String? = null,
)
