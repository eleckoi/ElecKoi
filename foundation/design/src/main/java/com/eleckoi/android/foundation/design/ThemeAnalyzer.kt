package com.eleckoi.android.foundation.design

import android.graphics.Bitmap

/**
 * Derives a whole app palette from a wallpaper.
 *
 * Two images go in and they are not interchangeable:
 *  - [paletteSource] is the untouched upload. Hue and chroma come from here, because the crop can
 *    easily land on a corner that happens to be all sky and throw away the colour the picture is
 *    actually about.
 *  - [displayed] is the cropped image that really gets painted behind the chat. Light-versus-dark
 *    and the reading veil come from here, because a veil has to line up with the pixels underneath
 *    it or it is just a grey wash in the wrong place.
 */
fun analyzeAppearanceTheme(paletteSource: Bitmap, displayed: Bitmap = paletteSource): AppearanceTheme {
    val palettePixels = readImage(paletteSource) ?: return AppearanceTheme()
    val displayPixels = readImage(displayed) ?: palettePixels

    // The seed comes from the whole picture and the polarity and veil from the crop that is actually
    // shown, which is the same division of labour as before: what colour the picture *is* does not
    // depend on where it happens to be cut, but how much of it is dark, and where, entirely does.
    val polarity = choosePolarity(displayPixels)
    val seed = seedColor(palettePixels)
    val veil = fitVeil(displayPixels, polarity)
    return auditContrast(buildTheme(seed, polarity, veil))
}
