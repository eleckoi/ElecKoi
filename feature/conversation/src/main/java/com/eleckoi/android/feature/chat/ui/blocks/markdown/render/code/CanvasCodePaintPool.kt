package com.eleckoi.android.feature.chat.ui.blocks.markdown.render.code

import android.graphics.Paint
import android.graphics.Typeface
import android.text.TextPaint
import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeFontStyle

/**
 * Small process-wide pool for immutable code paints.
 *
 * A paint returned here must never be mutated by a caller. Sharing is safe because Compose
 * drawing happens on the UI thread and native Canvas only reads these configured values.
 */
internal object CanvasCodePaintPool {
    private const val MaxEntries = 24

    private data class Key(
        val color: Int,
        val textSizeBits: Int,
        val letterSpacingBits: Int,
        val fontStyle: Int,
    )

    private val paints = object : LinkedHashMap<Key, TextPaint>(MaxEntries, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Key, TextPaint>?): Boolean =
            size > MaxEntries
    }

    @Synchronized
    fun obtain(
        color: Int,
        textSizePx: Float,
        letterSpacingPx: Float,
        fontStyle: Int = 0,
    ): TextPaint {
        val normalizedLetterSpacing = if (textSizePx > 0f) letterSpacingPx / textSizePx else 0f
        val key = Key(
            color = color,
            textSizeBits = textSizePx.toRawBits(),
            letterSpacingBits = normalizedLetterSpacing.toRawBits(),
            fontStyle = fontStyle,
        )
        return paints.getOrPut(key) {
            TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
                this.color = color
                this.textSize = textSizePx
                val bold = fontStyle and MarkdownCodeFontStyle.Bold != 0
                val italic = fontStyle and MarkdownCodeFontStyle.Italic != 0
                val typefaceStyle = when {
                    bold && italic -> Typeface.BOLD_ITALIC
                    bold -> Typeface.BOLD
                    italic -> Typeface.ITALIC
                    else -> Typeface.NORMAL
                }
                typeface = Typeface.create(Typeface.MONOSPACE, typefaceStyle)
                isUnderlineText = fontStyle and MarkdownCodeFontStyle.Underline != 0
                letterSpacing = normalizedLetterSpacing
            }
        }
    }

    @Synchronized
    fun clear() {
        paints.clear()
    }
}
