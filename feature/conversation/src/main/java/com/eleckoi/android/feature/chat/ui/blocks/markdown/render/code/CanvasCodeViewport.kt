package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.code

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.MutatePriority
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.ScrollableDefaults
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.gestures.rememberScrollableState
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeContent
import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeHighlightSpan
import com.eleckoi.android.feature.chat.ui.blocks.markdown.LocalMarkdownHostScrollInProgress
import kotlin.math.ceil

private data class CodeMetrics(
    val paint: Paint,
    val lineHeightPx: Float,
    val baselineOffsetPx: Float,
    val contentWidthPx: Float,
    val cellWidthPx: Float,
)

private data class WrappedCodeRows(
    val sourceLineIndices: IntArray,
    val starts: IntArray,
    val ends: IntArray,
) {
    val size: Int get() = starts.size
}

private class GrowingIntArray(initialCapacity: Int) {
    private var values = IntArray(initialCapacity.coerceAtLeast(8))
    private var count = 0

    fun add(value: Int) {
        if (count == values.size) values = values.copyOf(values.size * 2)
        values[count++] = value
    }

    fun toIntArray(): IntArray = values.copyOf(count)
}

internal enum class CodeSyntaxColorScheme {
    Adaptive,
    Bright,
}

/**
 * Canvas-backed code viewport. By default it stays bounded and only draws visible rows; full
 * display mode deliberately expands to the complete content height for status-panel use cases.
 */
@Composable
internal fun CanvasCodeViewport(
    code: MarkdownCodeContent,
    color: Color,
    dark: Boolean,
    gutterColor: Color,
    gutterDividerColor: Color,
    showLineNumbers: Boolean = true,
    syntaxColorScheme: CodeSyntaxColorScheme = CodeSyntaxColorScheme.Adaptive,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    letterSpacing: TextUnit,
    maxViewportHeight: Dp = 360.dp,
    wrapLines: Boolean = false,
    showAll: Boolean = false,
    streaming: Boolean,
) {
    if (code.lineCount <= 0) return
    val density = LocalDensity.current
    val textSizePx = with(density) { fontSize.toPx() }
    val requestedLineHeightPx = with(density) { lineHeight.toPx() }
    val letterSpacingPx = with(density) { letterSpacing.toPx() }
    val sidePaddingPx = with(density) { 4.dp.toPx() }
    val gutterStartPaddingPx = with(density) { 6.dp.toPx() }
    val gutterEndPaddingPx = with(density) { 7.dp.toPx() }
    val gutterPaint = remember(gutterColor, textSizePx) {
        CanvasCodePaintPool.obtain(
            color = gutterColor.toArgb(),
            textSizePx = textSizePx * 0.86f,
            letterSpacingPx = 0f,
        )
    }
    val metrics = remember(color, textSizePx, requestedLineHeightPx, letterSpacingPx, sidePaddingPx, code.maxVisualColumns) {
        val paint = CanvasCodePaintPool.obtain(
            color = color.toArgb(),
            textSizePx = textSizePx,
            letterSpacingPx = letterSpacingPx,
        )
        val fontMetrics = paint.fontMetrics
        val naturalHeight = fontMetrics.descent - fontMetrics.ascent
        val resolvedLineHeight = requestedLineHeightPx.coerceAtLeast(naturalHeight)
        val baseline = (resolvedLineHeight - naturalHeight) / 2f - fontMetrics.ascent
        val cellWidth = maxOf(paint.measureText("M"), paint.measureText("国"))
        CodeMetrics(
            paint = paint,
            lineHeightPx = resolvedLineHeight,
            baselineOffsetPx = baseline,
            contentWidthPx = cellWidth * code.maxVisualColumns.coerceAtLeast(1) + sidePaddingPx * 2f,
            cellWidthPx = cellWidth,
        )
    }
    val measuredGutterWidthPx = remember(
        code.lineCount,
        gutterPaint,
        gutterStartPaddingPx,
        gutterEndPaddingPx,
    ) {
        gutterPaint.measureText(code.lineCount.toString()) +
            gutterStartPaddingPx + gutterEndPaddingPx
    }
    val gutterWidthPx = if (showLineNumbers) measuredGutterWidthPx else 0f
    var verticalOffsetPx by remember { mutableFloatStateOf(0f) }
    var horizontalOffsetPx by remember { mutableFloatStateOf(0f) }
    var previousMaxVerticalOffsetPx by remember { mutableFloatStateOf(0f) }
    val hostScrollInProgress = LocalMarkdownHostScrollInProgress.current

    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val viewportWidthPx = with(density) { maxWidth.toPx() }.coerceAtLeast(1f)
        val codeViewportWidthPx = (viewportWidthPx - gutterWidthPx).coerceAtLeast(1f)
        val wrappedRows = if (wrapLines) {
            remember(code, metrics.paint, codeViewportWidthPx, sidePaddingPx) {
                buildWrappedCodeRows(
                    code = code,
                    paint = metrics.paint,
                    maxWidthPx = (codeViewportWidthPx - sidePaddingPx * 2f)
                        .coerceAtLeast(metrics.cellWidthPx),
                )
            }
        } else {
            null
        }
        val visualRowCount = wrappedRows?.size ?: code.lineCount
        val contentHeightPx = metrics.lineHeightPx * visualRowCount.coerceAtLeast(1)
        val viewportHeightPx = if (showAll) {
            contentHeightPx
        } else {
            contentHeightPx.coerceAtMost(with(density) { maxViewportHeight.toPx() })
        }
        val contentWidthPx = if (wrapLines) {
            codeViewportWidthPx
        } else {
            metrics.contentWidthPx.coerceAtLeast(codeViewportWidthPx)
        }
        val maxVerticalOffsetPx = (contentHeightPx - viewportHeightPx).coerceAtLeast(0f)
        val maxHorizontalOffsetPx = (contentWidthPx - codeViewportWidthPx).coerceAtLeast(0f)
        val verticalScrollable = rememberScrollableState { delta ->
            val previous = verticalOffsetPx
            verticalOffsetPx = containedVerticalDragOffset(
                currentOffsetPx = previous,
                maxOffsetPx = maxVerticalOffsetPx,
                dragDelta = delta,
            )
            previous - verticalOffsetPx
        }
        val verticalDraggable = rememberDraggableState { delta ->
            verticalScrollable.dispatchRawDelta(delta)
        }
        val verticalFlingBehavior = ScrollableDefaults.flingBehavior()
        SideEffect {
            verticalOffsetPx = verticalOffsetPx.coerceIn(0f, maxVerticalOffsetPx)
            horizontalOffsetPx = horizontalOffsetPx.coerceIn(0f, maxHorizontalOffsetPx)
        }
        LaunchedEffect(maxVerticalOffsetPx, streaming) {
            val wasAtBottom = previousMaxVerticalOffsetPx <= 0f ||
                verticalOffsetPx >= previousMaxVerticalOffsetPx - metrics.lineHeightPx
            if (streaming && wasAtBottom) verticalOffsetPx = maxVerticalOffsetPx
            previousMaxVerticalOffsetPx = maxVerticalOffsetPx
        }
        val horizontalScrollable = rememberScrollableState { delta ->
            val previous = horizontalOffsetPx
            horizontalOffsetPx = (horizontalOffsetPx - delta).coerceIn(0f, maxHorizontalOffsetPx)
            previous - horizontalOffsetPx
        }

        var canvasModifier = Modifier
            .fillMaxWidth()
            .height(with(density) { viewportHeightPx.toDp() })
            .clipToBounds()
        if (!showAll && maxVerticalOffsetPx > 0f) {
            canvasModifier = canvasModifier
                // Keep local drag/fling out of nested scroll dispatch so no boundary remainder can
                // leak into the conversation. A moving host retains the current gesture instead.
                .draggable(
                    state = verticalDraggable,
                    orientation = Orientation.Vertical,
                    enabled = shouldCodeViewportOwnVerticalGesture(
                        hasVerticalRange = true,
                        hostScrollInProgress = hostScrollInProgress,
                    ),
                    startDragImmediately = verticalScrollable.isScrollInProgress,
                    onDragStarted = {
                        verticalScrollable.scroll(MutatePriority.UserInput) {}
                    },
                    onDragStopped = { velocity ->
                        verticalScrollable.scroll {
                            with(verticalFlingBehavior) {
                                performFling(velocity)
                            }
                        }
                    },
                )
        }
        if (!wrapLines) {
            canvasModifier = canvasModifier.scrollable(horizontalScrollable, Orientation.Horizontal)
        }

        Canvas(
            canvasModifier,
        ) {
            val firstRow = (verticalOffsetPx / metrics.lineHeightPx)
                .toInt()
                .coerceIn(0, visualRowCount - 1)
            val lastRow = ceil((verticalOffsetPx + viewportHeightPx) / metrics.lineHeightPx)
                .toInt()
                .coerceIn(firstRow, visualRowCount - 1)
            val x = gutterWidthPx + sidePaddingPx - if (wrapLines) 0f else horizontalOffsetPx
            drawIntoCanvas { canvas ->
                val nativeCanvas = canvas.nativeCanvas
                if (showLineNumbers) {
                    for (rowIndex in firstRow..lastRow) {
                        val sourceLineIndex = wrappedRows?.sourceLineIndices?.get(rowIndex) ?: rowIndex
                        val rowStart = wrappedRows?.starts?.get(rowIndex) ?: code.lineStartAt(sourceLineIndex)
                        if (rowStart != code.lineStartAt(sourceLineIndex)) continue
                        val baseline = rowIndex * metrics.lineHeightPx - verticalOffsetPx +
                            metrics.baselineOffsetPx
                        val number = (sourceLineIndex + 1).toString()
                        nativeCanvas.drawText(
                            number,
                            gutterWidthPx - gutterEndPaddingPx - gutterPaint.measureText(number),
                            baseline,
                            gutterPaint,
                        )
                    }
                    nativeCanvas.drawRect(
                        gutterWidthPx - 1f,
                        0f,
                        gutterWidthPx,
                        size.height,
                        CanvasCodePaintPool.obtain(
                            color = gutterDividerColor.toArgb(),
                            textSizePx = textSizePx,
                            letterSpacingPx = 0f,
                        ),
                    )
                }
                nativeCanvas.save()
                nativeCanvas.clipRect(gutterWidthPx, 0f, size.width, size.height)
                for (rowIndex in firstRow..lastRow) {
                    val sourceLineIndex = wrappedRows?.sourceLineIndices?.get(rowIndex) ?: rowIndex
                    val rowStart = wrappedRows?.starts?.get(rowIndex) ?: code.lineStartAt(sourceLineIndex)
                    val rowEnd = wrappedRows?.ends?.get(rowIndex) ?: code.lineEndAt(sourceLineIndex)
                    drawCodeRow(
                        canvas = nativeCanvas,
                        code = code,
                        start = rowStart,
                        end = rowEnd,
                        x = x,
                        baseline = rowIndex * metrics.lineHeightPx - verticalOffsetPx +
                            metrics.baselineOffsetPx,
                        basePaint = metrics.paint,
                        dark = dark,
                        syntaxColorScheme = syntaxColorScheme,
                        textSizePx = textSizePx,
                        letterSpacingPx = letterSpacingPx,
                    )
                }
                nativeCanvas.restore()
            }
        }
    }
}

internal fun containedVerticalDragOffset(
    currentOffsetPx: Float,
    maxOffsetPx: Float,
    dragDelta: Float,
): Float = (currentOffsetPx - dragDelta).coerceIn(0f, maxOffsetPx.coerceAtLeast(0f))

internal fun shouldCodeViewportOwnVerticalGesture(
    hasVerticalRange: Boolean,
    hostScrollInProgress: Boolean,
): Boolean = hasVerticalRange && !hostScrollInProgress

private fun buildWrappedCodeRows(
    code: MarkdownCodeContent,
    paint: Paint,
    maxWidthPx: Float,
): WrappedCodeRows {
    val sourceLines = GrowingIntArray(code.lineCount)
    val starts = GrowingIntArray(code.lineCount)
    val ends = GrowingIntArray(code.lineCount)
    for (lineIndex in 0 until code.lineCount) {
        val lineStart = code.lineStartAt(lineIndex)
        val lineEnd = code.lineEndAt(lineIndex)
        if (lineStart == lineEnd) {
            sourceLines.add(lineIndex)
            starts.add(lineStart)
            ends.add(lineEnd)
            continue
        }
        var rowStart = lineStart
        while (rowStart < lineEnd) {
            val measuredCount = paint.breakText(
                code.text,
                rowStart,
                lineEnd,
                true,
                maxWidthPx,
                null,
            )
            var rowEnd = (rowStart + measuredCount).coerceAtMost(lineEnd)
            if (
                rowEnd in (rowStart + 1) until lineEnd &&
                Character.isHighSurrogate(code.text[rowEnd - 1]) &&
                Character.isLowSurrogate(code.text[rowEnd])
            ) {
                rowEnd -= 1
            }
            if (rowEnd <= rowStart) {
                rowEnd = (rowStart + Character.charCount(code.text.codePointAt(rowStart)))
                    .coerceAtMost(lineEnd)
            }
            sourceLines.add(lineIndex)
            starts.add(rowStart)
            ends.add(rowEnd)
            rowStart = rowEnd
        }
    }
    return WrappedCodeRows(
        sourceLineIndices = sourceLines.toIntArray(),
        starts = starts.toIntArray(),
        ends = ends.toIntArray(),
    )
}

private fun drawCodeRow(
    canvas: android.graphics.Canvas,
    code: MarkdownCodeContent,
    start: Int,
    end: Int,
    x: Float,
    baseline: Float,
    basePaint: Paint,
    dark: Boolean,
    syntaxColorScheme: CodeSyntaxColorScheme,
    textSizePx: Float,
    letterSpacingPx: Float,
) {
    if (end > start) {
        drawStyledCodeRange(
            canvas = canvas,
            code = code,
            start = start,
            end = end,
            lineStart = start,
            x = x,
            baseline = baseline,
            basePaint = basePaint,
            dark = dark,
            syntaxColorScheme = syntaxColorScheme,
            textSizePx = textSizePx,
            letterSpacingPx = letterSpacingPx,
        )
    }
}

private fun drawStyledCodeRange(
    canvas: android.graphics.Canvas,
    code: MarkdownCodeContent,
    start: Int,
    end: Int,
    lineStart: Int,
    x: Float,
    baseline: Float,
    basePaint: Paint,
    dark: Boolean,
    syntaxColorScheme: CodeSyntaxColorScheme,
    textSizePx: Float,
    letterSpacingPx: Float,
) {
    var cursor = start
    var spanIndex = code.highlights.firstEndingAfter(start)
    while (cursor < end) {
        val span = code.highlights.getOrNull(spanIndex)
        if (span == null || span.start >= end) {
            drawCodePiece(canvas, code, cursor, end, lineStart, x, baseline, basePaint, basePaint)
            return
        }
        if (span.start > cursor) {
            val gapEnd = minOf(span.start, end)
            drawCodePiece(canvas, code, cursor, gapEnd, lineStart, x, baseline, basePaint, basePaint)
            cursor = gapEnd
            if (cursor >= end) return
        }
        val pieceStart = maxOf(cursor, span.start)
        val pieceEnd = minOf(end, span.end)
        if (pieceEnd > pieceStart) {
            val styledPaint = CanvasCodePaintPool.obtain(
                color = when (syntaxColorScheme) {
                    CodeSyntaxColorScheme.Adaptive ->
                        if (dark) span.darkColorArgb else span.lightColorArgb
                    CodeSyntaxColorScheme.Bright -> span.brightColorArgb
                },
                textSizePx = textSizePx,
                letterSpacingPx = letterSpacingPx,
                fontStyle = span.fontStyle,
            )
            drawCodePiece(
                canvas,
                code,
                pieceStart,
                pieceEnd,
                lineStart,
                x,
                baseline,
                basePaint,
                styledPaint,
            )
            cursor = pieceEnd
        }
        if (span.end <= cursor) spanIndex += 1
    }
}

private fun drawCodePiece(
    canvas: android.graphics.Canvas,
    code: MarkdownCodeContent,
    start: Int,
    end: Int,
    lineStart: Int,
    x: Float,
    baseline: Float,
    measuringPaint: Paint,
    drawingPaint: Paint,
) {
    val pieceX = x + measuringPaint.measureText(code.text, lineStart, start)
    canvas.drawText(code.text, start, end, pieceX, baseline, drawingPaint)
}

private fun List<MarkdownCodeHighlightSpan>.firstEndingAfter(offset: Int): Int {
    var low = 0
    var high = lastIndex
    while (low <= high) {
        val middle = (low + high).ushr(1)
        if (this[middle].end <= offset) low = middle + 1 else high = middle - 1
    }
    return low
}
