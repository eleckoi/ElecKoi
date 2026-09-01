package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.text

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.input.pointer.pointerInput
import com.eleckoi.android.feature.chat.ui.blocks.markdown.layout.MarkdownRenderBlock

/** Draws one immutable, precomputed Android StaticLayout exactly once. */
@Composable
internal fun MarkdownTextCanvas(
    block: MarkdownRenderBlock.Text,
) {
    val density = LocalDensity.current
    val uriHandler = LocalUriHandler.current
    Canvas(
        Modifier
            .width(with(density) { block.drawWidthPx.toDp() })
            .height(with(density) { block.layout.height.toDp() })
            .pointerInput(block.id, block.links) {
                if (block.links.isEmpty()) return@pointerInput
                detectTapGestures { position ->
                    val line = block.layout.getLineForVertical(position.y.toInt())
                    val offset = block.layout.getOffsetForHorizontal(line, position.x)
                    block.links.firstOrNull { offset in it.start until it.end }?.let { link ->
                        runCatching { uriHandler.openUri(link.destination) }
                    }
                }
            },
    ) {
        drawIntoCanvas { canvas ->
            drawRoundedInlineCodeBackgrounds(
                canvas = canvas.nativeCanvas,
                layout = block.layout,
                ranges = block.inlineCodeRanges,
                density = density.density,
            )
            block.layout.draw(canvas.nativeCanvas)
        }
    }
}
