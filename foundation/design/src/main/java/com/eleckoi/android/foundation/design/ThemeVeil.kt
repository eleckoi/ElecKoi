package com.eleckoi.android.foundation.design

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.hypot

internal class Veil(
    val angleDegrees: Float,
    val strength: Float,
    val start: Float,
    val mid: Float,
    val end: Float,
    // The veil carries the local colour of the image along its axis, so the end that sits over gold
    // hair is veiled in a warm white and the end over pink ribbons in a cool pink one.
    val startHue: Double,
    val startChroma: Double,
    val midHue: Double,
    val midChroma: Double,
    val endHue: Double,
    val endChroma: Double,
)

// ---------------------------------------------------------------------------------------------
// The veil
// ---------------------------------------------------------------------------------------------

/**
 * Fits the per-cell veil demand to a plane and emits it as a directional gradient. A single flat
 * alpha cannot serve an image whose two halves differ: whatever value rescues the dark side bleaches
 * the light side. This is the part you can see.
 */
internal fun fitVeil(reading: ImageReading, polarity: Polarity): Veil {
    val cells = reading.cells
    val alphas = polarity.alphas
    if (cells.isEmpty()) {
        return Veil(90f, 0.22f, 1f, 1f, 1f, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    }

    val mean = alphas.average()
    val overallTint = tintOf(cells, weights = DoubleArray(cells.size) { 1.0 })

    var sxx = 0.0
    var sxy = 0.0
    var syy = 0.0
    var sxa = 0.0
    var sya = 0.0
    val meanX = cells.sumOf { it.x } / cells.size
    val meanY = cells.sumOf { it.y } / cells.size
    cells.forEachIndexed { index, cell ->
        val dx = cell.x - meanX
        val dy = cell.y - meanY
        val da = alphas[index] - mean
        sxx += dx * dx
        sxy += dx * dy
        syy += dy * dy
        sxa += dx * da
        sya += dy * da
    }
    val determinant = sxx * syy - sxy * sxy
    var gx = 0.0
    var gy = 0.0
    if (abs(determinant) > 1e-9) {
        gx = (syy * sxa - sxy * sya) / determinant
        gy = (sxx * sya - sxy * sxa) / determinant
    }

    // How much of the variation the plane actually explains. A picture whose dark part is a blob in
    // one corner has no direction to speak of, and forcing a gradient onto it would tilt the veil
    // along an axis the image does not have.
    var residual = 0.0
    var variance = 0.0
    cells.forEachIndexed { index, cell ->
        val predicted = mean + gx * (cell.x - meanX) + gy * (cell.y - meanY)
        val actual = alphas[index]
        residual += (actual - predicted) * (actual - predicted)
        variance += (actual - mean) * (actual - mean)
    }
    val explained = if (variance < 1e-9) 0.0 else 1.0 - residual / variance

    val magnitude = hypot(gx, gy)
    val strength = mean.coerceIn(0.0, 1.0)
    if (magnitude < 0.06 || strength < 0.02 || explained < 0.5) {
        // Evenly lit, or lit unevenly in no particular direction. A flat veil is the honest answer,
        // just at a value that was measured rather than guessed.
        return Veil(
            angleDegrees = 90f,
            strength = strength.toFloat(),
            start = 1f, mid = 1f, end = 1f,
            startHue = overallTint.first, startChroma = overallTint.second,
            midHue = overallTint.first, midChroma = overallTint.second,
            endHue = overallTint.first, endChroma = overallTint.second,
        )
    }

    val ux = gx / magnitude
    val uy = gy / magnitude
    val corners = listOf(0.0 to 0.0, 1.0 to 0.0, 0.0 to 1.0, 1.0 to 1.0).map { (x, y) ->
        (x - meanX) * ux + (y - meanY) * uy
    }
    val low = corners.min()
    val high = corners.max()

    fun alphaAt(t: Double): Float {
        val projection = low + t * (high - low)
        return (mean + magnitude * projection).coerceIn(0.0, 1.0).toFloat()
    }

    val start = alphaAt(0.0)
    val mid = alphaAt(0.5)
    val end = alphaAt(1.0)
    val divisor = strength.toFloat().coerceAtLeast(0.02f)

    // Sample the image's own colour at each end of the veil axis. This is the part that keeps a
    // second colour alive: the end of the gradient lying over blonde hair veils in a warm white,
    // the end over pink ribbons in a pink one, instead of one averaged tint across the whole screen.
    val projections = cells.map { (it.x - meanX) * ux + (it.y - meanY) * uy }
    fun tintAt(t: Double): Pair<Double, Double> {
        val target = low + t * (high - low)
        val span = (high - low).coerceAtLeast(1e-6)
        val weights = DoubleArray(cells.size) { index ->
            val distance = abs(projections[index] - target) / span
            (1.0 - distance).coerceAtLeast(0.0).let { it * it }
        }
        return if (weights.sum() < 1e-6) overallTint else tintOf(cells, weights)
    }

    val startTint = tintAt(0.0)
    val midTint = tintAt(0.5)
    val endTint = tintAt(1.0)

    // Stops are stored relative to the overall strength so the user's reading-veil slider scales the
    // shape instead of flattening it. The headroom goes to 4x because a picture with one very dark
    // end has a low average demand and a high demand at that end; capping tighter would quietly
    // under-cover exactly the region that needed the veil most.
    return Veil(
        angleDegrees = Math.toDegrees(atan2(uy, ux)).toFloat(),
        strength = strength.toFloat(),
        start = (start / divisor).coerceIn(0f, ScrimStopCeiling),
        mid = (mid / divisor).coerceIn(0f, ScrimStopCeiling),
        end = (end / divisor).coerceIn(0f, ScrimStopCeiling),
        startHue = startTint.first, startChroma = startTint.second,
        midHue = midTint.first, midChroma = midTint.second,
        endHue = endTint.first, endChroma = endTint.second,
    )
}

/** Weighted mean hue and chroma of a set of cells, averaged in Oklab so opposing hues cancel rather
 *  than landing halfway round the wheel. */
private fun tintOf(cells: List<Cell>, weights: DoubleArray): Pair<Double, Double> {
    var a = 0.0
    var b = 0.0
    var total = 0.0
    cells.forEachIndexed { index, cell ->
        val weight = weights.getOrElse(index) { 0.0 }
        a += cell.a * weight
        b += cell.b * weight
        total += weight
    }
    if (total < 1e-9) return 0.0 to 0.0
    a /= total
    b /= total
    return atan2(b, a) to hypot(a, b)
}

