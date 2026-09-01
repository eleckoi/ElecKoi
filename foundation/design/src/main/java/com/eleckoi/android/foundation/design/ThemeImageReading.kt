package com.eleckoi.android.foundation.design

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import kotlin.math.max
import kotlin.math.roundToInt

private const val SampleMaxSide = 144
private const val GridCols = 4
private const val GridRows = 6

/**
 * A deduplicated colour and how much of the frame it covers. This used to feed a k-means and a
 * scoring pass and carried the position data those needed; Celebi and Score own that job now, and
 * all that is still wanted here is the lightness histogram [choosePolarity] votes on.
 */
internal class WeightedLab(
    val l: Double,
    val a: Double,
    val b: Double,
    val weight: Double,
)

internal class Cell(
    val x: Double,
    val y: Double,
    val luminance: Double,
    val a: Double,
    val b: Double,
)

internal class ImageReading(
    val samples: List<WeightedLab>,
    val cells: List<Cell>,
    val colorfulness: Double,
    /** Opaque pixels in ARGB, exactly as the Celebi quantizer wants them. */
    val opaquePixels: IntArray,
)


// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

internal fun readImage(bitmap: Bitmap): ImageReading? {
    val sample = bitmap.scaledForAnalysis()
    val width = sample.width
    val height = sample.height
    if (width <= 0 || height <= 0) {
        if (sample !== bitmap) sample.recycle()
        return null
    }
    val pixels = IntArray(width * height)
    sample.getPixels(pixels, 0, width, 0, 0, width, height)
    if (sample !== bitmap) sample.recycle()

    val buckets = HashMap<Int, DoubleArray>(2048)
    val cellLuminance = DoubleArray(GridCols * GridRows)
    val cellA = DoubleArray(GridCols * GridRows)
    val cellB = DoubleArray(GridCols * GridRows)
    val cellCount = IntArray(GridCols * GridRows)
    var chromaSum = 0.0
    var total = 0.0
    val opaque = IntArray(width * height)
    var opaqueCount = 0

    for (y in 0 until height) {
        val row = y * width
        val gridY = ((y.toDouble() / height) * GridRows).toInt().coerceIn(0, GridRows - 1)
        for (x in 0 until width) {
            val pixel = pixels[row + x]
            if (AndroidColor.alpha(pixel) < 180) continue
            opaque[opaqueCount++] = pixel or (0xFF shl 24)
            val lab = oklabOf(pixel)

            val gridX = ((x.toDouble() / width) * GridCols).toInt().coerceIn(0, GridCols - 1)
            val cellIndex = gridY * GridCols + gridX
            cellLuminance[cellIndex] += wcagLuminance(pixel)
            cellA[cellIndex] += lab.a
            cellB[cellIndex] += lab.b
            cellCount[cellIndex] += 1

            chromaSum += lab.chroma
            total += 1.0

            // Dedup grid, collapsing identical-looking pixels so the lightness vote runs over a few
            // thousand weighted points rather than twenty thousand raw ones. Colour selection does
            // not come through here at all — Celebi quantizes the raw pixels itself.
            val lq = (lab.l * 31.0).roundToInt().coerceIn(0, 31)
            val aq = (lab.a * 128.0).roundToInt().coerceIn(-63, 63)
            val bq = (lab.b * 128.0).roundToInt().coerceIn(-63, 63)
            val key = ((lq * 128) + (aq + 64)) * 128 + (bq + 64)
            val bucket = buckets.getOrPut(key) { DoubleArray(4) }
            bucket[0] += lab.l
            bucket[1] += lab.a
            bucket[2] += lab.b
            bucket[3] += 1.0
        }
    }

    if (total <= 0.0) return null

    val samples = buckets.values.map { bucket ->
        WeightedLab(
            l = bucket[0] / bucket[3],
            a = bucket[1] / bucket[3],
            b = bucket[2] / bucket[3],
            weight = bucket[3],
        )
    }
    val cells = ArrayList<Cell>(GridCols * GridRows)
    for (index in cellLuminance.indices) {
        val count = cellCount[index]
        val gridX = index % GridCols
        val gridY = index / GridCols
        cells += Cell(
            x = (gridX + 0.5) / GridCols,
            y = (gridY + 0.5) / GridRows,
            luminance = if (count == 0) 0.5 else cellLuminance[index] / count,
            a = if (count == 0) 0.0 else cellA[index] / count,
            b = if (count == 0) 0.0 else cellB[index] / count,
        )
    }
    return ImageReading(samples, cells, chromaSum / total, opaque.copyOf(opaqueCount))
}

private fun Bitmap.scaledForAnalysis(): Bitmap {
    val longest = max(width, height)
    if (longest <= SampleMaxSide) return this
    val ratio = SampleMaxSide.toDouble() / longest
    return Bitmap.createScaledBitmap(
        this,
        max(1, (width * ratio).roundToInt()),
        max(1, (height * ratio).roundToInt()),
        true,
    )
}

