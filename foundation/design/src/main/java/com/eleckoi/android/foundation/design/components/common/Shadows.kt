package com.eleckoi.android.foundation.design.components

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Shadows with the parameters a design actually specifies.
 *
 * `Modifier.shadow` draws the platform's elevation shadow: one number in, a fixed relationship
 * between blur, offset and opacity out. A design gives four independent values — colour, blur,
 * vertical offset, spread — and there is no elevation that satisfies an arbitrary set of them, so
 * matching a spec through `shadow` is guesswork that lands close at best.
 *
 * These draw the shadow directly through `setShadowLayer`, which takes exactly those parameters, so
 * a spec can be transcribed rather than approximated. Both take the same numbers a CSS `box-shadow`
 * does and produce the same picture.
 */
fun Modifier.dropShadow(
    shape: Shape,
    color: Color,
    blur: Dp,
    offsetY: Dp = 0.dp,
    offsetX: Dp = 0.dp,
    /** Negative values pull the shadow in behind the shape, as CSS's fourth length does. */
    spread: Dp = 0.dp,
): Modifier = drawBehind {
    if (color.alpha == 0f) return@drawBehind
    val spreadPx = spread.toPx()
    val spreadSize = Size(size.width + spreadPx * 2, size.height + spreadPx * 2)
    if (spreadSize.width <= 0f || spreadSize.height <= 0f) return@drawBehind
    val path = shapePath(shape, spreadSize).apply { translate(androidx.compose.ui.geometry.Offset(-spreadPx, -spreadPx)) }
    drawIntoCanvas { canvas ->
        val paint = Paint().asFrameworkPaint().apply {
            isAntiAlias = true
            this.color = android.graphics.Color.TRANSPARENT
            // CSS states blur as twice the Gaussian deviation; setShadowLayer takes the deviation.
            // Passing the CSS number straight through doubled every shadow, which is why a spec
            // meant to settle a card onto the page lifted it off instead.
            setShadowLayer(
                (blur.toPx() / 2f).coerceAtLeast(0.01f),
                offsetX.toPx(),
                offsetY.toPx(),
                color.toArgb(),
            )
        }
        canvas.nativeCanvas.drawPath(path.asAndroidPath(), paint)
    }
}

/**
 * The recess. Clips to the shape, then casts the shadow of everything outside it inwards — which is
 * what an inset shadow is and what a gradient down from the top edge is not: the gradient has no
 * blur, no offset, and nothing along the other three sides.
 */
fun Modifier.innerShadow(
    shape: Shape,
    color: Color,
    blur: Dp,
    offsetY: Dp = 0.dp,
    offsetX: Dp = 0.dp,
): Modifier = drawWithContent {
    drawContent()
    if (color.alpha == 0f) return@drawWithContent
    val path = shapePath(shape, size)
    val outside = Path().apply {
        addRect(Rect(-size.width, -size.height, size.width * 2f, size.height * 2f))
        op(this, path, PathOperation.Difference)
    }
    drawIntoCanvas { canvas ->
        canvas.save()
        canvas.clipPath(path)
        val paint = Paint().asFrameworkPaint().apply {
            isAntiAlias = true
            this.color = android.graphics.Color.TRANSPARENT
            // CSS states blur as twice the Gaussian deviation; setShadowLayer takes the deviation.
            // Passing the CSS number straight through doubled every shadow, which is why a spec
            // meant to settle a card onto the page lifted it off instead.
            setShadowLayer(
                (blur.toPx() / 2f).coerceAtLeast(0.01f),
                offsetX.toPx(),
                offsetY.toPx(),
                color.toArgb(),
            )
        }
        canvas.nativeCanvas.drawPath(outside.asAndroidPath(), paint)
        canvas.restore()
    }
}

private fun DrawScope.shapePath(shape: Shape, size: Size): Path {
    return Path().apply {
        when (val outline = shape.createOutline(size, layoutDirection, this@shapePath)) {
            is Outline.Rectangle -> addRect(outline.rect)
            is Outline.Rounded -> addOutline(outline)
            is Outline.Generic -> addPath(outline.path)
        }
    }
}
