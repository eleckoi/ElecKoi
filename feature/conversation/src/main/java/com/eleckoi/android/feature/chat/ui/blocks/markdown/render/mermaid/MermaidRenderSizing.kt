package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.mermaid

import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Pixel size used for the off-main-thread Mermaid raster pass. */
internal data class MermaidRasterSize(
    val widthPx: Int,
    val heightPx: Int,
)

/**
 * Keeps the existing bounded inline display height while exposing its exact aspect ratio early.
 * The bound is a UI decision; raster resolution is reduced independently below.
 */
internal fun calculateMermaidDisplayHeightPx(
    intrinsicWidth: Float,
    intrinsicHeight: Float,
    targetWidthPx: Int,
    maxDisplayHeightPx: Int,
): Int {
    if (
        !intrinsicWidth.isFinite() || intrinsicWidth <= 0f ||
        !intrinsicHeight.isFinite() || intrinsicHeight <= 0f
    ) {
        return targetWidthPx.coerceAtLeast(1)
    }
    return (targetWidthPx.coerceAtLeast(1) * intrinsicHeight / intrinsicWidth)
        .roundToInt()
        .coerceIn(1, maxDisplayHeightPx.coerceAtLeast(1))
}

/**
 * Caps allocation and texture-upload cost without changing the diagram's on-screen geometry.
 * Both raster axes use the same scale, so Compose can stretch the result into the exact box.
 */
internal fun calculateMermaidRasterSize(
    displayWidthPx: Int,
    displayHeightPx: Int,
    maxRasterPixels: Int,
): MermaidRasterSize {
    val width = displayWidthPx.coerceAtLeast(1)
    val height = displayHeightPx.coerceAtLeast(1)
    val pixels = width.toLong() * height.toLong()
    if (pixels <= maxRasterPixels.coerceAtLeast(1).toLong()) {
        return MermaidRasterSize(widthPx = width, heightPx = height)
    }

    val scale = sqrt(maxRasterPixels.coerceAtLeast(1).toDouble() / pixels.toDouble())
    return MermaidRasterSize(
        // Truncation is deliberate: independently rounding both axes can exceed the hard budget
        // by a thin row or column on boundary values.
        widthPx = (width * scale).toInt().coerceAtLeast(1),
        heightPx = (height * scale).toInt().coerceAtLeast(1),
    )
}

internal fun calculateMermaidContainerHeightPx(
    layoutWidthPx: Int,
    framePaddingPx: Float,
    aspectRatio: Float,
): Float? {
    if (!aspectRatio.isFinite() || aspectRatio <= 0f) return null
    val contentWidthPx = (layoutWidthPx - framePaddingPx).coerceAtLeast(1f)
    return contentWidthPx / aspectRatio + framePaddingPx
}

/** The aspect-specific result wins; otherwise preserve the exact outer layout reservation. */
internal fun resolveRetainedMermaidHeightPx(
    aspectHeightPx: Float?,
    persistedLayoutHeightPx: Int?,
): Float? = aspectHeightPx?.takeIf { it.isFinite() && it > 0f }
    ?: persistedLayoutHeightPx?.takeIf { it > 0 }?.toFloat()
