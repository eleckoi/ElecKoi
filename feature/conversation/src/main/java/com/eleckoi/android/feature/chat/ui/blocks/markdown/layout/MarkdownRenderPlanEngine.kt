package com.eleckoi.android.feature.chat.ui.blocks.markdown.layout

import android.graphics.Typeface
import android.os.Looper
import android.os.Trace
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.Layout
import android.text.style.LeadingMarginSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableIntStateOf
import android.text.style.UnderlineSpan
import com.eleckoi.android.feature.chat.model.markdown.MarkdownBlockType
import com.eleckoi.android.feature.chat.model.markdown.MarkdownInlineSegment
import com.eleckoi.android.feature.chat.model.markdown.MarkdownInlineStyle
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableAlignment
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableContent

internal object MarkdownRenderPlanEngine {

    // Chat bodies are drawn with TextPaint onto a Canvas rather than by Compose's Text, so
    // LocalTextStyle never reaches them and the user's font has to be handed over directly.
    // Cached StaticLayouts already have the previous typeface measured into them, so switching
    // fonts has to throw those away or the old metrics keep being reused.
    @Volatile
    private var bodyTypeface: Typeface? = null

    // Clearing the caches is not enough on its own: a message already on screen is holding the plan
    // it was given, and nothing about its key changed, so it never asks for a new one — it keeps the
    // old typeface until it scrolls out of the viewport and back. This revision goes into the key so
    // a font change invalidates the plans in use, not just the ones in the cache.
    private val typefaceRevisionState = mutableIntStateOf(0)
    val bodyTypefaceRevision: Int
        @Composable get() = typefaceRevisionState.intValue

    fun applyBodyTypeface(typeface: Typeface?) {
        if (bodyTypeface == typeface) return
        bodyTypeface = typeface
        com.eleckoi.android.feature.chat.ui.blocks.markdown.MarkdownRebuildableCaches.clear()
        typefaceRevisionState.intValue += 1
    }
    fun build(key: MarkdownRenderPlanKey): MarkdownRenderPlan {
        check(Looper.myLooper() != Looper.getMainLooper()) {
            "Markdown RenderPlan must be built away from the main thread"
        }
        Trace.beginSection("ElecKoi.MarkdownRenderPlan")
        try {
            val cacheableDocument = key.nodes.all { it.stable }
            if (cacheableDocument) MarkdownRenderPlanCache.get(key)?.let { return it }
            val blocks = key.nodes.mapNotNull { node -> buildBlock(key, node) }
            val plan = MarkdownRenderPlan(
                key = key,
                blocks = blocks,
                characterWeight = key.nodes.sumOf(::nodeCharacterWeight).coerceAtLeast(1),
                accessibilityText = buildAccessibilityText(key),
            )
            if (cacheableDocument) MarkdownRenderPlanCache.put(plan)
            return plan
        } finally {
            Trace.endSection()
        }
    }

    private fun buildAccessibilityText(key: MarkdownRenderPlanKey): String = buildString {
        for (node in key.nodes) {
            if (isNotEmpty()) append("\n\n")
            val remaining = MaxAccessibilityCharacters - length
            if (remaining <= 0) break
            val value = node.code?.accessibilityText(remaining)
                ?: displayText(node.type, node.source)
            append(value, 0, value.length.coerceAtMost(remaining))
        }
    }

    private fun buildBlock(
        documentKey: MarkdownRenderPlanKey,
        node: com.eleckoi.android.feature.chat.model.markdown.MarkdownNode,
    ): MarkdownRenderBlock? {
        val key = MarkdownRenderBlockKey(
            cacheOwnerKey = documentKey.cacheOwnerKey,
            node = node,
            widthPx = documentKey.widthPx,
            textColorArgb = documentKey.textColorArgb,
            quoteColorArgb = documentKey.quoteColorArgb,
            inlineColors = documentKey.inlineColors,
            fontSizeBits = documentKey.fontSizeBits,
            lineHeightBits = documentKey.lineHeightBits,
            letterSpacingBits = documentKey.letterSpacingBits,
            typefaceRevision = documentKey.typefaceRevision,
        )
        if (node.stable) MarkdownRenderBlockCache.get(key)?.let { return it }
        val block = when {
            // An unfinished table or formula changes structure on almost every chunk. Keep it on
            // the cheap text Canvas until the parser marks the node stable, then hand it to the
            // specialized renderer once. Code is different: its indexed visible-line Canvas is
            // intentionally designed for an append-only unstable tail.
            !node.stable && (
                node.type == MarkdownBlockType.Table ||
                    node.type == MarkdownBlockType.MathBlock
                ) -> buildTextBlock(documentKey, node)

            else -> when (node.type) {
                MarkdownBlockType.CodeFence -> node.code?.let {
                    if (node.stable && it.language.equals("mermaid", ignoreCase = true)) {
                        MarkdownRenderBlock.Mermaid(
                            id = node.id,
                            source = it.accessibilityText(it.textLength),
                        )
                    } else {
                        MarkdownRenderBlock.Code(
                            id = node.id,
                            content = it,
                            copyEnabled = node.stable,
                        )
                    }
                }
                MarkdownBlockType.Table -> node.table?.let {
                    buildTable(documentKey, node.id, it)
                } ?: buildTextBlock(documentKey, node)
                MarkdownBlockType.MathBlock -> buildLatex(node.id, node.source)
                MarkdownBlockType.HorizontalRule -> MarkdownRenderBlock.Rule(node.id)
                else -> buildTextBlock(documentKey, node)
            }
        }
        if (block != null && node.stable) MarkdownRenderBlockCache.put(key, block)
        return block
    }

    private fun buildTextBlock(
        documentKey: MarkdownRenderPlanKey,
        node: com.eleckoi.android.feature.chat.model.markdown.MarkdownNode,
    ): MarkdownRenderBlock.Text {
        val scale = headingScale(node.type, node.metadata)
        val color = if (node.type == MarkdownBlockType.Quote) {
            documentKey.quoteColorArgb
        } else {
            documentKey.textColorArgb
        }
        val styled = if (node.inlineSegments.isEmpty()) {
            StyledTextResult(
                text = displayText(node.type, node.source),
                links = emptyList(),
                inlineCodeRanges = emptyList(),
            )
        } else {
            styledText(
                segments = node.inlineSegments,
                colorArgb = color,
                inlineColors = documentKey.inlineColors,
                textSizePx = Float.fromBits(documentKey.fontSizeBits) * scale,
                hangingListIndent = node.type == MarkdownBlockType.OrderedList ||
                    node.type == MarkdownBlockType.UnorderedList,
            )
        }
        val layout = createLayout(
            text = styled.text,
            colorArgb = color,
            textSizePx = Float.fromBits(documentKey.fontSizeBits) * scale,
            lineHeightPx = Float.fromBits(documentKey.lineHeightBits) * scale,
            letterSpacingPx = Float.fromBits(documentKey.letterSpacingBits),
            widthPx = documentKey.widthPx,
            bold = node.type == MarkdownBlockType.Heading,
            monospace = node.type == MarkdownBlockType.MathBlock,
        )
        return MarkdownRenderBlock.Text(
            id = node.id,
            layout = layout,
            drawWidthPx = layout.visibleWidthPx(),
            links = styled.links,
            inlineCodeRanges = styled.inlineCodeRanges,
        )
    }

    private fun buildTable(
        key: MarkdownRenderPlanKey,
        id: String,
        table: MarkdownTableContent,
    ): MarkdownRenderBlock.Table {
        val columnCount = maxOf(
            table.alignments.size,
            table.rows.maxOfOrNull { it.cells.size } ?: 0,
            1,
        )
        val padding = (Float.fromBits(key.fontSizeBits) * 0.35f).coerceAtLeast(4f)
        val tableTextSize = Float.fromBits(key.fontSizeBits) * 0.92f
        val measurePaint = TextPaint().apply { textSize = tableTextSize }
        val naturalWidths = IntArray(columnCount) { column ->
            val contentWidth = table.rows.maxOfOrNull { row ->
                row.cells.getOrNull(column)?.segments
                    ?.joinToString(separator = "") { it.text }
                    ?.lineSequence()
                    ?.maxOfOrNull { measurePaint.measureText(it).toInt() }
                    ?: 0
            } ?: 0
            contentWidth + (padding * 2f).toInt()
        }
        val columnWidths = distributeTableWidths(
            naturalWidths = naturalWidths,
            widthPx = key.widthPx,
            minimumWidthPx = (Float.fromBits(key.fontSizeBits) * 3.5f).toInt().coerceAtLeast(1),
        )
        val rows = table.rows.map { row ->
            List(columnCount) { column ->
                val styled = styledText(
                    segments = row.cells.getOrNull(column)?.segments.orEmpty(),
                    colorArgb = key.textColorArgb,
                    inlineColors = key.inlineColors,
                    textSizePx = tableTextSize,
                    hangingListIndent = false,
                )
                MarkdownTableCellLayout(
                    layout = createLayout(
                        text = styled.text,
                        colorArgb = key.textColorArgb,
                        textSizePx = tableTextSize,
                        lineHeightPx = Float.fromBits(key.lineHeightBits),
                        letterSpacingPx = Float.fromBits(key.letterSpacingBits),
                        widthPx = (columnWidths[column] - (padding * 2f).toInt()).coerceAtLeast(1),
                        alignment = table.alignments.getOrNull(column).toLayoutAlignment(),
                    ),
                    links = styled.links,
                    inlineCodeRanges = styled.inlineCodeRanges,
                )
            }
        }
        val rowHeights = IntArray(rows.size) { row ->
            (rows[row].maxOfOrNull { it.layout.height } ?: 0) + (padding * 2f).toInt()
        }
        val rowOffsets = IntArray(rows.size + 1)
        for (index in rowHeights.indices) {
            rowOffsets[index + 1] = rowOffsets[index] + rowHeights[index]
        }
        return MarkdownRenderBlock.Table(
            id = id,
            rows = rows,
            headerRows = BooleanArray(table.rows.size) { table.rows[it].header },
            columnWidthsPx = columnWidths,
            rowHeightsPx = rowHeights,
            rowOffsetsPx = rowOffsets,
            rowPaddingPx = padding,
        )
    }

    private fun buildLatex(id: String, source: String): MarkdownRenderBlock.Latex {
        val expression = stripGrokDisplayMathDelimiters(source)
        return MarkdownRenderBlock.Latex(id = id, expression = expression)
    }

    private fun createLayout(
        text: CharSequence,
        colorArgb: Int,
        textSizePx: Float,
        lineHeightPx: Float,
        letterSpacingPx: Float,
        widthPx: Int,
        bold: Boolean = false,
        monospace: Boolean = false,
        alignment: Layout.Alignment = Layout.Alignment.ALIGN_NORMAL,
    ): StaticLayout {
        // Monospace stays monospace whatever the body font is: code and logs rely on equal widths.
        val base = bodyTypeface ?: Typeface.DEFAULT
        val typeface = when {
            monospace && bold -> Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
            monospace -> Typeface.MONOSPACE
            bold -> Typeface.create(base, Typeface.BOLD)
            else -> base
        }
        val paint = TextPaint(TextPaint.ANTI_ALIAS_FLAG).apply {
            color = colorArgb
            this.textSize = textSizePx
            this.typeface = typeface
            letterSpacing = if (textSizePx > 0f) letterSpacingPx / textSizePx else 0f
            isSubpixelText = true
        }
        val naturalHeight = paint.fontMetrics.descent - paint.fontMetrics.ascent
        val extra = (lineHeightPx - naturalHeight).coerceAtLeast(0f)
        return StaticLayout.Builder.obtain(text, 0, text.length, paint, widthPx.coerceAtLeast(1))
            .setIncludePad(false)
            .setAlignment(alignment)
            .setLineSpacing(extra, 1f)
            .build()
    }

    private fun styledText(
        segments: List<MarkdownInlineSegment>,
        colorArgb: Int,
        inlineColors: MarkdownInlineColorPalette,
        textSizePx: Float,
        hangingListIndent: Boolean,
    ): StyledTextResult {
        val output = SpannableStringBuilder()
        val links = mutableListOf<MarkdownLinkRange>()
        val inlineCodeRanges = mutableListOf<MarkdownInlineCodeRange>()
        segments.forEach { segment ->
            val start = output.length
            output.append(segment.text)
            val end = output.length
            if (start == end) return@forEach
            fun span(value: Any) = output.setSpan(value, start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            if (segment.style and MarkdownInlineStyle.Bold != 0) span(StyleSpan(Typeface.BOLD))
            if (segment.style and MarkdownInlineStyle.Italic != 0) span(StyleSpan(Typeface.ITALIC))
            if (segment.style and MarkdownInlineStyle.Strike != 0) span(StrikethroughSpan())
            if (segment.style and (MarkdownInlineStyle.Link or MarkdownInlineStyle.Underline) != 0) {
                span(UnderlineSpan())
            }
            if (segment.style and MarkdownInlineStyle.Code != 0) {
                span(TypefaceSpan("monospace"))
            }
            if (segment.style and MarkdownInlineStyle.Math != 0) span(StyleSpan(Typeface.ITALIC))
            val foreground = when {
                segment.style and MarkdownInlineStyle.Code != 0 -> inlineColors.inlineCodeArgb
                segment.style and MarkdownInlineStyle.Quote != 0 -> inlineColors.quoteArgb
                segment.style and MarkdownInlineStyle.Underline != 0 -> inlineColors.underlineArgb
                segment.style and MarkdownInlineStyle.Italic != 0 -> inlineColors.italicArgb
                else -> null
            }
            foreground?.let(::ForegroundColorSpan)?.let(::span)
            if (segment.style and MarkdownInlineStyle.Code != 0) {
                val alpha = 0x1A
                inlineCodeRanges += MarkdownInlineCodeRange(
                    start = start,
                    end = end,
                    backgroundColorArgb = (alpha shl 24) or (inlineColors.inlineCodeArgb and 0x00FFFFFF),
                )
            }
            segment.destination?.takeIf { segment.style and MarkdownInlineStyle.Link != 0 }?.let {
                links += MarkdownLinkRange(start = start, end = end, destination = it)
            }
        }
        if (hangingListIndent) applyListHangingIndents(output, textSizePx)
        return StyledTextResult(output, links, inlineCodeRanges)
    }

    private fun displayText(type: MarkdownBlockType, raw: String): String = when (type) {
        MarkdownBlockType.Heading -> raw.trim().dropWhile { it == '#' }.trimStart()
        MarkdownBlockType.Quote -> raw.lineSequence().joinToString("\n", transform = ::grokQuoteLine)
        MarkdownBlockType.MathBlock -> stripGrokDisplayMathDelimiters(raw)
        else -> raw.trimEnd()
    }

    private fun grokQuoteLine(source: String): String {
        var remaining = source.trimStart()
        val output = StringBuilder()
        while (remaining.startsWith('>')) {
            output.append("│ ")
            remaining = remaining.drop(1).trimStart()
        }
        return output.append(remaining).toString()
    }

    private fun stripGrokDisplayMathDelimiters(source: String): String {
        val trimmed = source.trim()
        return when {
            trimmed.startsWith("$$") && trimmed.endsWith("$$") ->
                trimmed.removePrefix("$$").removeSuffix("$$").trim()
            trimmed.startsWith("\\[") && trimmed.endsWith("\\]") ->
                trimmed.removePrefix("\\[").removeSuffix("\\]").trim()
            trimmed.startsWith("\\begin{equation*}") && trimmed.endsWith("\\end{equation*}") ->
                trimmed.removePrefix("\\begin{equation*}").removeSuffix("\\end{equation*}").trim()
            trimmed.startsWith("\\begin{equation}") && trimmed.endsWith("\\end{equation}") ->
                trimmed.removePrefix("\\begin{equation}").removeSuffix("\\end{equation}").trim()
            else -> trimmed
        }
    }

    private fun headingScale(type: MarkdownBlockType, metadata: Int): Float {
        if (type != MarkdownBlockType.Heading) return 1f
        return when (metadata.coerceIn(1, 6)) {
            1 -> 1.28f
            2 -> 1.18f
            3 -> 1.10f
            4 -> 1.04f
            else -> 1f
        }
    }

    private const val MaxAccessibilityCharacters = 20_000
}

private data class StyledTextResult(
    val text: CharSequence,
    val links: List<MarkdownLinkRange>,
    val inlineCodeRanges: List<MarkdownInlineCodeRange>,
)

private fun MarkdownTableAlignment?.toLayoutAlignment(): Layout.Alignment = when (this) {
    MarkdownTableAlignment.Center -> Layout.Alignment.ALIGN_CENTER
    MarkdownTableAlignment.Right -> Layout.Alignment.ALIGN_OPPOSITE
    else -> Layout.Alignment.ALIGN_NORMAL
}

private fun distributeTableWidths(
    naturalWidths: IntArray,
    widthPx: Int,
    minimumWidthPx: Int,
): IntArray {
    val count = naturalWidths.size.coerceAtLeast(1)
    val budget = widthPx.coerceAtLeast(count)
    val equalFloor = (budget / count).coerceAtLeast(1)
    val minimums = IntArray(count) { index ->
        minOf(naturalWidths[index].coerceAtLeast(1), minimumWidthPx, equalFloor)
    }
    val result = minimums.copyOf()
    var remaining = budget - result.sum()
    while (remaining > 0) {
        val candidates = result.indices.filter { result[it] < naturalWidths[it] }
        if (candidates.isEmpty()) break
        val totalWant = candidates.sumOf { naturalWidths[it] - result[it] }.coerceAtLeast(1)
        var consumed = 0
        for (index in candidates) {
            val want = naturalWidths[index] - result[index]
            val share = maxOf(1, (remaining.toLong() * want / totalWant).toInt())
                .coerceAtMost(want)
                .coerceAtMost(remaining - consumed)
            if (share <= 0) break
            result[index] += share
            consumed += share
        }
        if (consumed == 0) break
        remaining -= consumed
    }
    var index = 0
    while (remaining > 0) {
        result[index % count] += 1
        index += 1
        remaining -= 1
    }
    return result
}

private fun applyListHangingIndents(text: SpannableStringBuilder, textSizePx: Float) {
    val marker = Regex("^(\\s*)(?:•|☐|☑|\\d+[.)])\\s+")
    var lineStart = 0
    while (lineStart < text.length) {
        val lineEnd = text.indexOf('\n', lineStart).let { if (it < 0) text.length else it }
        val match = marker.find(text.substring(lineStart, lineEnd))
        if (match != null) {
            val continuationIndent = (match.value.length * textSizePx * 0.56f).toInt().coerceAtLeast(1)
            text.setSpan(
                LeadingMarginSpan.Standard(0, continuationIndent),
                lineStart,
                lineEnd,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
        }
        lineStart = lineEnd + 1
    }
}

private fun StaticLayout.visibleWidthPx(): Int {
    var width = 1f
    for (line in 0 until lineCount) width = maxOf(width, getLineWidth(line))
    return kotlin.math.ceil(width).toInt().coerceIn(1, this.width)
}

internal fun nodeCharacterWeight(node: com.eleckoi.android.feature.chat.model.markdown.MarkdownNode): Int =
    node.code?.textLength ?: node.source.length
