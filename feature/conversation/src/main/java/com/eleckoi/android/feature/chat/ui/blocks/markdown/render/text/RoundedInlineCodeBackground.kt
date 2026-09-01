package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.text

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.text.StaticLayout
import com.eleckoi.android.feature.chat.ui.blocks.markdown.layout.MarkdownInlineCodeRange
import kotlin.math.max
import kotlin.math.min

/**
 * Draws inline-code backgrounds separately from StaticLayout so code can keep normal wrapping
 * while receiving rounded corners. Android's BackgroundColorSpan only supports sharp rectangles.
 */
internal fun drawRoundedInlineCodeBackgrounds(
    canvas: Canvas,
    layout: StaticLayout,
    ranges: List<MarkdownInlineCodeRange>,
    density: Float,
) {
    if (ranges.isEmpty() || layout.lineCount == 0) return

    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val radius = 3.5f * density
    val horizontalPadding = 1.5f * density
    val verticalInset = 1f * density
    val text = layout.text

    ranges.forEach { range ->
        val start = range.start.coerceIn(0, text.length)
        val end = range.end.coerceIn(start, text.length)
        if (start == end) return@forEach

        paint.color = range.backgroundColorArgb
        val firstLine = layout.getLineForOffset(start)
        val lastLine = layout.getLineForOffset((end - 1).coerceAtLeast(start))
        for (line in firstLine..lastLine) {
            val lineStart = layout.getLineStart(line)
            var visibleLineEnd = layout.getLineEnd(line)
            while (
                visibleLineEnd > lineStart &&
                (text[visibleLineEnd - 1] == '\n' || text[visibleLineEnd - 1] == '\r')
            ) {
                visibleLineEnd -= 1
            }

            val segmentStart = max(start, lineStart)
            val segmentEnd = min(end, visibleLineEnd)
            if (segmentEnd <= segmentStart) continue

            val startX = if (segmentStart == lineStart) {
                layout.getLineLeft(line)
            } else {
                layout.getPrimaryHorizontal(segmentStart)
            }
            val endX = if (segmentEnd == visibleLineEnd) {
                layout.getLineRight(line)
            } else {
                layout.getPrimaryHorizontal(segmentEnd)
            }
            val left = min(startX, endX) -
                if (segmentStart == start) horizontalPadding else 0f
            val right = max(startX, endX) +
                if (segmentEnd == end) horizontalPadding else 0f
            val top = layout.getLineTop(line) + verticalInset
            val bottom = layout.getLineBottom(line) - verticalInset
            if (right > left && bottom > top) {
                canvas.drawRoundRect(RectF(left, top, right, bottom), radius, radius, paint)
            }
        }
    }
}
