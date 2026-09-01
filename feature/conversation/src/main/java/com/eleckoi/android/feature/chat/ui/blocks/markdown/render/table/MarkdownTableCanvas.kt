package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.table

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.rememberScrollableState
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.chat.ui.blocks.markdown.layout.MarkdownRenderBlock
import com.eleckoi.android.feature.chat.ui.blocks.markdown.render.text.drawRoundedInlineCodeBackgrounds

/** A fixed-height, vertically virtualized Canvas for large Markdown tables. */
@Composable
internal fun MarkdownTableCanvas(
    block: MarkdownRenderBlock.Table,
    borderColor: Color,
) {
    val density = LocalDensity.current
    val uriHandler = LocalUriHandler.current
    val totalHeight = block.rowOffsetsPx.lastOrNull()?.coerceAtLeast(1) ?: 1
    val viewportHeightPx = totalHeight.toFloat().coerceAtMost(
        with(density) { MaxTableViewportHeight.toPx() },
    )
    val maxOffsetPx = (totalHeight - viewportHeightPx).coerceAtLeast(0f)
    var offsetPx by remember(block.id) { mutableFloatStateOf(0f) }
    LaunchedEffect(maxOffsetPx) {
        offsetPx = offsetPx.coerceIn(0f, maxOffsetPx)
    }
    val scrollState = rememberScrollableState { delta ->
        val previous = offsetPx
        offsetPx = (offsetPx - delta).coerceIn(0f, maxOffsetPx)
        previous - offsetPx
    }
    Canvas(
        Modifier
            .fillMaxWidth()
            .height(with(density) { viewportHeightPx.toDp() })
            .clipToBounds()
            .pointerInput(block.id, block.rows) {
                detectTapGestures { position ->
                    val rowIndex = block.rowOffsetsPx
                        .findRow((position.y + offsetPx).toInt())
                        .coerceAtMost(block.rows.lastIndex)
                    val row = block.rows.getOrNull(rowIndex) ?: return@detectTapGestures
                    var columnLeft = 0f
                    val columnIndex = block.columnWidthsPx.indexOfFirst { width ->
                        val hit = position.x >= columnLeft && position.x < columnLeft + width
                        if (!hit) columnLeft += width
                        hit
                    }
                    val cell = row.getOrNull(columnIndex) ?: return@detectTapGestures
                    val cellTop = block.rowOffsetsPx[rowIndex] - offsetPx
                    val localX = position.x - columnLeft - block.rowPaddingPx
                    val localY = position.y - cellTop - block.rowPaddingPx
                    if (localX < 0f || localY < 0f || localY > cell.layout.height) {
                        return@detectTapGestures
                    }
                    val line = cell.layout.getLineForVertical(localY.toInt())
                    val offset = cell.layout.getOffsetForHorizontal(line, localX)
                    cell.links.firstOrNull { offset in it.start until it.end }?.let { link ->
                        runCatching { uriHandler.openUri(link.destination) }
                    }
                }
            }
            .scrollable(scrollState, Orientation.Vertical),
    ) {
        val firstRow = block.rowOffsetsPx.findRow(offsetPx.toInt())
        val lastRow = block.rowOffsetsPx
            .findRow((offsetPx + viewportHeightPx).toInt())
            .coerceAtMost(block.rows.lastIndex)
        drawRect(borderColor, style = Stroke(width = 1f))
        drawIntoCanvas { canvas ->
            for (rowIndex in firstRow..lastRow) {
                val row = block.rows[rowIndex]
                val y = block.rowOffsetsPx[rowIndex] - offsetPx
                if (block.headerRows.getOrElse(rowIndex) { false }) {
                    drawRect(
                        color = borderColor.copy(alpha = borderColor.alpha * 0.28f),
                        topLeft = Offset(0f, y),
                        size = androidx.compose.ui.geometry.Size(size.width, block.rowHeightsPx[rowIndex].toFloat()),
                    )
                }
                var x = 0f
                row.forEachIndexed { columnIndex, cell ->
                    canvas.nativeCanvas.save()
                    canvas.nativeCanvas.translate(x + block.rowPaddingPx, y + block.rowPaddingPx)
                    drawRoundedInlineCodeBackgrounds(
                        canvas = canvas.nativeCanvas,
                        layout = cell.layout,
                        ranges = cell.inlineCodeRanges,
                        density = density.density,
                    )
                    cell.layout.draw(canvas.nativeCanvas)
                    canvas.nativeCanvas.restore()
                    x += block.columnWidthsPx[columnIndex]
                    if (columnIndex != row.lastIndex) {
                        drawLine(
                            borderColor,
                            start = Offset(x, y),
                            end = Offset(x, y + block.rowHeightsPx[rowIndex]),
                        )
                    }
                }
                val bottom = y + block.rowHeightsPx[rowIndex]
                drawLine(
                    borderColor,
                    start = Offset(0f, bottom),
                    end = Offset(size.width, bottom),
                )
            }
        }
    }
}

private fun IntArray.findRow(offset: Int): Int {
    if (size <= 1) return 0
    var low = 0
    var high = size - 2
    while (low <= high) {
        val middle = (low + high) ushr 1
        when {
            offset < this[middle] -> high = middle - 1
            offset >= this[middle + 1] -> low = middle + 1
            else -> return middle
        }
    }
    return low.coerceIn(0, size - 2)
}

private val MaxTableViewportHeight = 360.dp
