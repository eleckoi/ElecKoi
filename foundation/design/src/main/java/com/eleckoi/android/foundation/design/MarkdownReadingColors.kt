package com.eleckoi.android.foundation.design

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** Fully resolved colours for one message surface. */
@Immutable
data class MarkdownReadingColors(
    val text: Color,
    val italic: Color,
    val underline: Color,
    val quote: Color,
    val inlineCode: Color,
    val codeForeground: Color,
    val codeBackground: Color,
)

/**
 * Resolves reading colours against the bubble that will actually hold them. Theme-generated
 * values use the palette accent as a quiet tint. Explicit selections are intentionally exact:
 * choosing a reading colour is an authoring decision, not a suggestion for the theme generator.
 */
fun AppearanceTheme.markdownReadingColors(isUser: Boolean): MarkdownReadingColors {
    val text = if (isUser) mobileChatUserFg.opaque() else mobileChatMessageFg.opaque()
    val messageBackground = if (isUser) mobileChatUserBg.opaque() else mobileChatMessageBg.opaque()
    val accent = mobileBlue.opaque()
    val overrides = markdownReadingColors
    val codeBackground = overrides.codeBackground?.opaque() ?: DefaultCodeBlockBackground

    return MarkdownReadingColors(
        text = text,
        italic = readableOverrideOr(
            override = overrides.italic,
            generated = blend(text, accent, 0.24f),
            background = messageBackground,
            fallback = text,
        ),
        underline = readableOverrideOr(
            override = overrides.underline,
            generated = blend(text, accent, 0.50f),
            background = messageBackground,
            fallback = text,
        ),
        quote = readableOverrideOr(
            override = overrides.quote,
            generated = blend(text, accent, 0.68f),
            background = messageBackground,
            fallback = text,
        ),
        inlineCode = readableOverrideOr(
            override = overrides.inlineCode,
            generated = blend(text, accent, 0.38f),
            background = messageBackground,
            fallback = text,
        ),
        codeForeground = readableOverrideOr(
            override = overrides.codeForeground,
            generated = DefaultCodeBlockForeground,
            background = codeBackground,
            fallback = readableTextOn(codeBackground),
        ),
        codeBackground = codeBackground,
    )
}

private fun readableOverrideOr(
    override: Color?,
    generated: Color,
    background: Color,
    fallback: Color,
): Color {
    override?.opaque()?.let { return it }
    val preferred = generated.opaque()
    if (contrastRatio(preferred, background) >= MinReadingContrast) return preferred
    for (step in 1..10) {
        val adjusted = blend(preferred, fallback, step / 10f)
        if (contrastRatio(adjusted, background) >= MinReadingContrast) return adjusted
    }
    if (contrastRatio(fallback, background) >= MinReadingContrast) return fallback
    return readableTextOn(background)
}

private fun readableTextOn(background: Color): Color {
    val white = Color.White
    val ink = Color(0xFF14171F)
    return if (contrastRatio(white, background) >= contrastRatio(ink, background)) white else ink
}

private fun Color.opaque(): Color = Color(red = red, green = green, blue = blue, alpha = 1f)

private fun blend(from: Color, to: Color, amount: Float): Color {
    val t = amount.coerceIn(0f, 1f)
    return Color(
        red = from.red * (1f - t) + to.red * t,
        green = from.green * (1f - t) + to.green * t,
        blue = from.blue * (1f - t) + to.blue * t,
        alpha = 1f,
    )
}

private fun contrastRatio(first: Color, second: Color): Float {
    val lighter = max(first.relativeLuminance(), second.relativeLuminance())
    val darker = min(first.relativeLuminance(), second.relativeLuminance())
    return (lighter + 0.05f) / (darker + 0.05f)
}

private fun Color.relativeLuminance(): Float {
    fun channel(value: Float): Float = if (value <= 0.03928f) {
        value / 12.92f
    } else {
        ((value + 0.055f) / 1.055f).pow(2.4f)
    }
    return 0.2126f * channel(red) + 0.7152f * channel(green) + 0.0722f * channel(blue)
}

private const val MinReadingContrast = 3.0f

// Code is one shared reading surface across Social, Agent, and Roleplay layouts. Keeping its
// automatic base independent of message bubbles preserves the stable dark code treatment.
private val DefaultCodeBlockBackground = Color(0xFF232323)
private val DefaultCodeBlockForeground = Color(0xFFF3F1EC)
