package com.eleckoi.android.foundation.design

import android.graphics.Color as AndroidColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

// Oklab. HSL was the previous basis and it lies about lightness — pure yellow and pure blue both
// report l = 0.5 while one is six times brighter than the other. Every "is this image dark?"
// decision built on that is wrong for saturated images. Oklab's L is perceptually even, so a tone
// number means the same thing at every hue, which is what makes a tonal ramp possible at all.
internal data class Oklab(val l: Double, val a: Double, val b: Double) {
    val chroma: Double get() = hypot(a, b)
    val hue: Double get() = atan2(b, a)
}

internal fun oklabOf(argb: Int): Oklab {
    return linearToOklab(
        srgbToLinear(AndroidColor.red(argb) / 255.0),
        srgbToLinear(AndroidColor.green(argb) / 255.0),
        srgbToLinear(AndroidColor.blue(argb) / 255.0),
    )
}

internal fun oklabOf(color: Color): Oklab = oklabOf(color.toArgb())

/**
 * Builds a colour at an exact lightness and hue, reducing chroma until it fits in sRGB. Clamping
 * RGB instead would shift the hue and the tone, and the contrast guarantees downstream depend on
 * the tone actually being what we asked for.
 */
internal fun oklchToArgb(tone: Double, chroma: Double, hue: Double): Int {
    val l = tone.coerceIn(0.0, 1.0)
    val requested = max(0.0, chroma)
    if (requested <= 0.0) return oklabToArgbClamped(Oklab(l, 0.0, 0.0))

    if (inGamut(Oklab(l, cos(hue) * requested, sin(hue) * requested))) {
        return oklabToArgbClamped(Oklab(l, cos(hue) * requested, sin(hue) * requested))
    }
    var low = 0.0
    var high = requested
    repeat(14) {
        val mid = (low + high) / 2.0
        if (inGamut(Oklab(l, cos(hue) * mid, sin(hue) * mid))) low = mid else high = mid
    }
    return oklabToArgbClamped(Oklab(l, cos(hue) * low, sin(hue) * low))
}

internal fun oklchColor(tone: Double, chroma: Double, hue: Double): Color = Color(oklchToArgb(tone, chroma, hue))

internal fun wcagLuminance(argb: Int): Double {
    return 0.2126 * srgbToLinear(AndroidColor.red(argb) / 255.0) +
        0.7152 * srgbToLinear(AndroidColor.green(argb) / 255.0) +
        0.0722 * srgbToLinear(AndroidColor.blue(argb) / 255.0)
}

internal fun wcagLuminance(color: Color): Double = wcagLuminance(color.toArgb())

internal fun wcagContrast(a: Color, b: Color): Double {
    val ya = wcagLuminance(a)
    val yb = wcagLuminance(b)
    return (max(ya, yb) + 0.05) / (min(ya, yb) + 0.05)
}

/** Flattens a translucent colour onto an opaque one so contrast is measured on what is actually seen. */
internal fun compositeOver(top: Color, bottom: Color): Color {
    val alpha = top.alpha.coerceIn(0f, 1f)
    if (alpha >= 1f) return top.copy(alpha = 1f)
    return Color(
        red = top.red * alpha + bottom.red * (1f - alpha),
        green = top.green * alpha + bottom.green * (1f - alpha),
        blue = top.blue * alpha + bottom.blue * (1f - alpha),
        alpha = 1f,
    )
}

/**
 * Moves a colour along its own tone axis until it clears [ratio] against [background], keeping hue
 * and chroma. The old code hoped a hardcoded lightness clamp would be readable; when it wasn't, the
 * call sites fell back to pure white or near-black and the extracted palette visibly evaporated.
 */
internal fun ensureContrast(foreground: Color, background: Color, ratio: Double): Color {
    val opaqueBg = background.copy(alpha = 1f)
    if (wcagContrast(compositeOver(foreground, opaqueBg), opaqueBg) >= ratio) return foreground

    val lab = oklabOf(foreground)
    val chroma = lab.chroma
    val hue = lab.hue
    val darken = wcagLuminance(opaqueBg) > 0.32
    val step = if (darken) -0.02 else 0.02

    var best = foreground
    var bestRatio = wcagContrast(compositeOver(foreground, opaqueBg), opaqueBg)
    var tone = lab.l
    repeat(52) {
        tone += step
        if (tone in 0.0..1.0) {
            val candidate = Color(oklchToArgb(tone, chroma, hue)).copy(alpha = foreground.alpha)
            val achieved = wcagContrast(compositeOver(candidate, opaqueBg), opaqueBg)
            if (achieved > bestRatio) {
                bestRatio = achieved
                best = candidate
            }
        }
    }
    if (bestRatio >= ratio) {
        // Walk back to the closest tone that still passes, so text does not overshoot to pure black.
        var tone2 = lab.l
        repeat(52) {
            tone2 += step
            if (tone2 in 0.0..1.0) {
                val candidate = Color(oklchToArgb(tone2, chroma, hue)).copy(alpha = foreground.alpha)
                if (wcagContrast(compositeOver(candidate, opaqueBg), opaqueBg) >= ratio) return candidate
            }
        }
    }
    return best
}

internal fun readableOn(background: Color, hue: Double, chroma: Double, ratio: Double = 4.5): Color {
    val start = if (wcagLuminance(background) > 0.42) 0.22 else 0.96
    return ensureContrast(Color(oklchToArgb(start, min(chroma, 0.03), hue)), background, ratio)
}

internal fun smoothstep(edge0: Double, edge1: Double, value: Double): Double {
    if (edge1 <= edge0) return if (value >= edge1) 1.0 else 0.0
    val t = ((value - edge0) / (edge1 - edge0)).coerceIn(0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)
}

/** Shortest signed distance between two hue angles, in radians. */
internal fun hueDistance(a: Double, b: Double): Double {
    var delta = abs(a - b) % (2.0 * Math.PI)
    if (delta > Math.PI) delta = 2.0 * Math.PI - delta
    return delta
}

private fun srgbToLinear(channel: Double): Double {
    return if (channel <= 0.04045) channel / 12.92 else ((channel + 0.055) / 1.055).pow(2.4)
}

private fun linearToSrgb(channel: Double): Double {
    return if (channel <= 0.0031308) channel * 12.92 else 1.055 * channel.pow(1.0 / 2.4) - 0.055
}

private fun linearToOklab(r: Double, g: Double, b: Double): Oklab {
    val l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    val m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    val s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    val lRoot = Math.cbrt(l)
    val mRoot = Math.cbrt(m)
    val sRoot = Math.cbrt(s)
    return Oklab(
        l = 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
        a = 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
        b = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot,
    )
}

private fun oklabToLinear(lab: Oklab): DoubleArray {
    val lRoot = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b
    val mRoot = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b
    val sRoot = lab.l - 0.0894841775 * lab.a - 1.2914855480 * lab.b
    val l = lRoot * lRoot * lRoot
    val m = mRoot * mRoot * mRoot
    val s = sRoot * sRoot * sRoot
    return doubleArrayOf(
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )
}

private fun inGamut(lab: Oklab): Boolean {
    val linear = oklabToLinear(lab)
    return linear.all { it >= -0.0015 && it <= 1.0015 }
}

private fun oklabToArgbClamped(lab: Oklab): Int {
    val linear = oklabToLinear(lab)
    return AndroidColor.rgb(
        (linearToSrgb(linear[0]) * 255.0).roundToInt().coerceIn(0, 255),
        (linearToSrgb(linear[1]) * 255.0).roundToInt().coerceIn(0, 255),
        (linearToSrgb(linear[2]) * 255.0).roundToInt().coerceIn(0, 255),
    )
}
