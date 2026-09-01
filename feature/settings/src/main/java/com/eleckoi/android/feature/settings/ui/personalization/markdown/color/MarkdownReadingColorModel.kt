package com.eleckoi.android.feature.settings.ui.personalization.markdown

import android.graphics.Color as AndroidColor
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.MarkdownReadingColorOverrides

internal enum class MarkdownReadingColorRole(val label: String) {
    Italic("斜体文本"),
    Underline("下划线文本"),
    Quote("引用文本"),
    InlineCode("行内代码"),
    CodeForeground("代码块文字"),
    CodeBackground("代码块背景");

    fun overrideIn(overrides: MarkdownReadingColorOverrides): Color? = when (this) {
        Italic -> overrides.italic
        Underline -> overrides.underline
        Quote -> overrides.quote
        InlineCode -> overrides.inlineCode
        CodeForeground -> overrides.codeForeground
        CodeBackground -> overrides.codeBackground
    }

    fun resolvedIn(colors: com.eleckoi.android.foundation.design.MarkdownReadingColors): Color = when (this) {
        Italic -> colors.italic
        Underline -> colors.underline
        Quote -> colors.quote
        InlineCode -> colors.inlineCode
        CodeForeground -> colors.codeForeground
        CodeBackground -> colors.codeBackground
    }
}

internal fun AppearanceTheme.withMarkdownReadingColor(
    role: MarkdownReadingColorRole,
    color: Color?,
): AppearanceTheme = copy(
    markdownReadingColors = markdownReadingColors.let { current ->
        when (role) {
            MarkdownReadingColorRole.Italic -> current.copy(italic = color)
            MarkdownReadingColorRole.Underline -> current.copy(underline = color)
            MarkdownReadingColorRole.Quote -> current.copy(quote = color)
            MarkdownReadingColorRole.InlineCode -> current.copy(inlineCode = color)
            MarkdownReadingColorRole.CodeForeground -> current.copy(codeForeground = color)
            MarkdownReadingColorRole.CodeBackground -> current.copy(codeBackground = color)
        }
    },
)

internal fun Color.toHsv(): FloatArray = FloatArray(3).also { AndroidColor.colorToHSV(toArgb(), it) }

internal fun Color.hex(): String = "#%06X".format(toArgb() and 0x00FFFFFF)

internal fun String.toColorOrNull(): Color? =
    takeIf { length == 6 }?.let { value ->
        runCatching { Color(AndroidColor.parseColor("#$value")) }.getOrNull()
    }

internal fun hueColor(hue: Float): Color = Color(
    AndroidColor.HSVToColor(floatArrayOf(hue.coerceIn(0f, 360f), 0.82f, 0.92f)),
)
