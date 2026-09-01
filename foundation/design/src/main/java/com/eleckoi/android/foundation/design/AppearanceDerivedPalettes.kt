package com.eleckoi.android.foundation.design

import androidx.compose.ui.graphics.Color
import com.eleckoi.android.foundation.design.AppearanceTheme
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

data class PaperCutPalette(
    val slot: Color,
    val face: Color,
    val selectedFace: Color,
    val pressedFace: Color,
    val actionFace: Color,
    val actionText: Color,
    val border: Color,
    val focusedBorder: Color,
    val shadow: Color,
    val text: Color,
    val pressedText: Color,
    val mutedText: Color,
    val icon: Color,
    val dot: Color,
)

data class FieldPalette(
    val container: Color,
    val border: Color,
    val focusedBorder: Color,
    val text: Color,
    val placeholder: Color,
    val icon: Color,
)

data class SelectionPalette(
    val activeContainer: Color,
    val inactiveContainer: Color,
    val activeText: Color,
    val text: Color,
    val mutedText: Color,
    val indicator: Color,
)

fun AppearanceTheme.selectionPalette(): SelectionPalette {
    val bg = mobileBg.opaque()
    val surface = mobileSurface.opaque()
    val text = readableText(mobileText.opaque(), surface)
    val muted = readableMuted(mobileMuted.opaque(), surface, text)

    return if (bg.isVisuallyDark()) {
        val active = mix(surface, text, 0.075f)
        SelectionPalette(
            activeContainer = active,
            inactiveContainer = Color.Transparent,
            activeText = readableText(text, active),
            text = text,
            mutedText = muted,
            indicator = mix(surface, text, 0.48f),
        )
    } else {
        val accent = if (textureImagePath.isBlank()) {
            mix(text, surface, 0.36f)
        } else {
            mobileBlue.opaque()
        }
        val active = mix(accent, surface, 0.88f)
        SelectionPalette(
            activeContainer = active,
            inactiveContainer = Color.Transparent,
            activeText = readableText(text, active),
            text = text,
            mutedText = muted,
            indicator = readableMuted(accent, active, text),
        )
    }
}

fun AppearanceTheme.overlayScrim(): Color {
    return Color.Black.copy(alpha = if (mobileBg.isVisuallyDark()) 0.34f else 0.18f)
}

fun AppearanceTheme.fieldPalette(): FieldPalette {
    val bg = mobileBg.opaque()
    val text = readableText(mobileText.opaque(), bg)
    val muted = mobileMuted.opaque()

    return if (bg.isVisuallyDark()) {
        val container = mix(bg, text, 0.055f)
        FieldPalette(
            container = container,
            border = mix(bg, text, 0.24f),
            focusedBorder = mix(bg, text, 0.42f),
            text = readableText(text, container),
            placeholder = readableMuted(muted, container, text),
            icon = readableMuted(muted, container, text),
        )
    } else {
        val container = mobileSearchBg.opaque()
        FieldPalette(
            container = container,
            border = mix(container, text, 0.10f),
            focusedBorder = mix(container, mobileBlue.opaque(), 0.36f),
            text = readableText(text, container),
            placeholder = readableMuted(muted, container, text),
            icon = readableMuted(muted, container, text),
        )
    }
}

fun AppearanceTheme.paperCutPalette(): PaperCutPalette {
    val bg = mobileBg.opaque()
    val surface = mobileSurface.opaque()
    val text = readableText(mobileText.opaque(), bg)
    val muted = mobileMuted.opaque()
    val dark = bg.isVisuallyDark()

    return if (dark) {
        val slot = mix(bg, text, 0.035f)
        val face = mix(bg, text, 0.055f)
        val selected = mix(bg, text, 0.13f)
        val pressed = mix(bg, text, 0.17f)
        val action = mix(bg, text, 0.16f)
        val border = mix(bg, text, 0.31f)
        val focusedBorder = mix(bg, text, 0.46f)
        val shadow = mix(bg, text, 0.21f)
        val dot = mix(bg, text, 0.52f)

        PaperCutPalette(
            slot = slot,
            face = face,
            selectedFace = selected,
            pressedFace = pressed,
            actionFace = action,
            actionText = readableText(text, action),
            border = border,
            focusedBorder = focusedBorder,
            shadow = shadow,
            text = readableText(text, face),
            pressedText = readableText(text, pressed),
            mutedText = readableMuted(muted, face, text),
            icon = readableMuted(muted, face, text),
            dot = dot,
        )
    } else {
        val face = surface
        val slot = mix(face, bg, 0.18f)
        val selected = mix(mobilePinnedBg.opaque(), face, 0.28f)
        val pressed = mix(selected, text, 0.045f)
        val action = selected
        val border = mix(face, text, 0.14f)
        val focusedBorder = mix(selected, mobileBlue.opaque(), 0.34f)
        val shadow = mix(bg, text, 0.10f)
        val dot = mix(selected, text, 0.34f)

        PaperCutPalette(
            slot = slot,
            face = face,
            selectedFace = selected,
            pressedFace = pressed,
            actionFace = action,
            actionText = readableText(text, action),
            border = border,
            focusedBorder = focusedBorder,
            shadow = shadow,
            text = readableText(text, face),
            pressedText = readableText(text, pressed),
            mutedText = readableMuted(muted, face, text),
            icon = readableMuted(muted, face, text),
            dot = dot,
        )
    }
}

fun Color.isVisuallyDark(): Boolean = relativeLuminance() < 0.42f

private fun Color.opaque(): Color = Color(red = red, green = green, blue = blue, alpha = 1f)

private fun mix(from: Color, to: Color, amount: Float): Color {
    val t = amount.coerceIn(0f, 1f)
    return Color(
        red = from.red * (1f - t) + to.red * t,
        green = from.green * (1f - t) + to.green * t,
        blue = from.blue * (1f - t) + to.blue * t,
        alpha = 1f,
    )
}

private fun readableText(preferred: Color, background: Color): Color {
    if (contrastRatio(preferred, background) >= 4.5f) return preferred
    val white = Color.White
    val black = Color(0xFF14171F)
    return if (contrastRatio(white, background) >= contrastRatio(black, background)) white else black
}

private fun readableMuted(preferred: Color, background: Color, strongText: Color): Color {
    if (contrastRatio(preferred, background) >= 3.0f) return preferred
    return mix(background, strongText, 0.62f)
}

private fun contrastRatio(a: Color, b: Color): Float {
    val l1 = a.relativeLuminance()
    val l2 = b.relativeLuminance()
    val lighter = max(l1, l2)
    val darker = min(l1, l2)
    return (lighter + 0.05f) / (darker + 0.05f)
}

private fun Color.relativeLuminance(): Float {
    fun channel(value: Float): Float {
        return if (value <= 0.03928f) {
            value / 12.92f
        } else {
            ((value + 0.055f) / 1.055f).pow(2.4f)
        }
    }
    return 0.2126f * channel(red) + 0.7152f * channel(green) + 0.0722f * channel(blue)
}
