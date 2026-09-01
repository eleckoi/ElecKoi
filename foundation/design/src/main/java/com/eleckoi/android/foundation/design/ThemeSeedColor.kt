package com.eleckoi.android.foundation.design

import com.materialkolor.quantize.QuantizerCelebi
import com.materialkolor.score.Score

// ---------------------------------------------------------------------------------------------
// Seed colour
// ---------------------------------------------------------------------------------------------

/**
 * The picture's seed colour, by way of Google's material-color-utilities — the same two steps
 * Android runs to theme itself from a wallpaper.
 *
 * Celebi quantizes the image down to a few dozen representative colours (Wu first, then weighted
 * k-means seeded from its output), and Score ranks those for how well each would serve as a theme
 * source: it wants area, it wants chroma, it throws out colours too close to grey to survive being
 * tinted, and it collapses hues that are already spoken for.
 *
 * This replaces a hand-rolled k-means and a scoring function of my own — area times root chroma
 * times a guess at how centred the colour was. That guess is what handed a monochrome drawing to
 * the sliver of skin tone in it, and it is exactly the part of the problem already solved better
 * elsewhere.
 */
internal fun seedColor(reading: ImageReading): Seed {
    if (reading.opaquePixels.isEmpty()) return Seed(FallbackSeed, achromatic = true)
    val counts = QuantizerCelebi.quantize(reading.opaquePixels, QuantizeMaxColors)
    if (counts.isEmpty()) return Seed(FallbackSeed, achromatic = true)

    val top = Score.score(counts).firstOrNull() ?: FallbackSeed
    // Score answers with a stock Google blue when nothing in the picture is colourful enough to
    // theme from, and that answer is not one of the colours it was handed. Taking it at face value
    // paints a black-and-white drawing blue. The honest reading is that the picture is monochrome:
    // keep its dominant tone as the seed and let [buildTheme] pick a scheme that says so.
    if (counts.containsKey(top)) return Seed(top, achromatic = false)
    val dominant = counts.maxByOrNull { it.value }?.key ?: FallbackSeed
    return Seed(dominant, achromatic = true)
}

internal class Seed(val argb: Int, val achromatic: Boolean)

/** What Score itself falls back to when a picture holds nothing worth theming from. */
private const val FallbackSeed: Int = 0xFF4285F4.toInt()

/**
 * Celebi's own recommendation. Fewer starves Score of candidates on a busy illustration; more costs
 * time on every crop without changing which colour comes out on top.
 */
private const val QuantizeMaxColors = 128

