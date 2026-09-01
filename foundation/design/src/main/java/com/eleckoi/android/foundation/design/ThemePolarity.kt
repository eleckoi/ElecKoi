package com.eleckoi.android.foundation.design

// The wallpaper is painted at this opacity over the theme background, so a cell is never as dark or
// as bright as its raw pixels. Budgeting the veil against the raw image over-corrects every time.
private const val AssumedTextureOpacity = 0.72

// Oklab lightness bounds for "this pixel reads as dark" and "this pixel reads as light". Mid grey
// sits at 0.60, so the band between them is genuinely ambiguous territory and votes for neither.
private const val DarkTone = 0.45
private const val LightTone = 0.72

// How far one side has to outweigh the other before area alone decides the theme.
//
// This was 1.6, which almost nothing clears, so nearly every picture fell through to the veil-cost
// tie-break — and that tie-break is not neutral. Brightening a dark cell uses a near-white veil and
// costs little; darkening a bright one needs near-full opacity. Light is free across 71% of the
// luminance range and dark across 19%, so a single bright patch is enough to price the dark theme
// out. A monochrome picture that is plainly dark to look at was still coming back light.
//
// The area vote is the one that matches what a person sees at a glance, so it is given the wider
// mandate and the cost function only breaks genuine ties.
private const val DecisiveMajority = 1.15

internal class Polarity(val dark: Boolean, val alphas: DoubleArray)

// ---------------------------------------------------------------------------------------------
// Light or dark
// ---------------------------------------------------------------------------------------------

/**
 * Picks the polarity that needs less veil, instead of thresholding an average. An image that is
 * half black and half white averages to mid grey — a value that describes no part of it — and the
 * old code decided the entire theme on which side of 0.43 that meaningless number landed.
 */
internal fun choosePolarity(reading: ImageReading): Polarity {
    val lightAlphas = DoubleArray(reading.cells.size)
    val darkAlphas = DoubleArray(reading.cells.size)
    var lightCost = 0.0
    var darkCost = 0.0

    reading.cells.forEachIndexed { index, cell ->
        val overLight = blendTowards(cell.luminance, 0.90)
        val overDark = blendTowards(cell.luminance, 0.02)
        val light = neededAlpha(overLight, target = 0.46, veil = 0.93, brighten = true)
        val dark = neededAlpha(overDark, target = 0.14, veil = 0.012, brighten = false)
        lightAlphas[index] = light
        darkAlphas[index] = dark
        lightCost += light * light
        darkCost += dark * dark
    }

    val count = reading.cells.size.coerceAtLeast(1)
    lightCost /= count
    darkCost /= count

    // Veil cost alone gets obviously dark pictures wrong. A near-black illustration with one pale
    // face has a bright minority that is expensive to darken, so the arithmetic prefers a light
    // theme for a picture nobody would call light.
    //
    // So ask the simpler question first: how much of the frame is dark and how much is light. This
    // is a vote by area, which is what a person does at a glance, and it is immune to the trap that
    // sank the original code — a mean would drag a half-black half-white picture to a mid grey that
    // describes none of it, whereas two masses can simply both be large and say "it depends".
    var darkMass = 0.0
    var lightMass = 0.0
    for (sample in reading.samples) {
        if (sample.l < DarkTone) darkMass += sample.weight
        if (sample.l > LightTone) lightMass += sample.weight
    }

    val dark = when {
        darkMass > lightMass * DecisiveMajority -> true
        lightMass > darkMass * DecisiveMajority -> false
        // Genuinely mixed. Fall back to whichever polarity needs less veil to become readable, with
        // a small bias towards light so a nudge of the crop cannot flip the whole UI.
        else -> darkCost < lightCost * 0.92
    }
    return Polarity(dark, if (dark) darkAlphas else lightAlphas)
}

private fun blendTowards(luminance: Double, base: Double): Double {
    return AssumedTextureOpacity * luminance + (1.0 - AssumedTextureOpacity) * base
}

internal fun neededAlpha(luminance: Double, target: Double, veil: Double, brighten: Boolean): Double {
    if (brighten) {
        if (luminance >= target) return 0.0
        val span = veil - luminance
        if (span <= 0.0) return 1.0
        return ((target - luminance) / span).coerceIn(0.0, 1.0)
    }
    if (luminance <= target) return 0.0
    val span = luminance - veil
    if (span <= 0.0) return 1.0
    return ((luminance - target) / span).coerceIn(0.0, 1.0)
}

