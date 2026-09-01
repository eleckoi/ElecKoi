package com.eleckoi.android.foundation.design.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp

/**
 * Small semantic glyphs used by the Agent tool timeline.
 *
 * The wrench reproduces DeepSeek Harness' inline `ToolWrenchIcon` geometry. SearchSetting is a
 * purpose-built closed-book/search glyph whose lens replaces the book's lower-right corner rather
 * than being laid beside or painted over a complete book.
 *
 * Keep these together instead of falling back to unrelated Material symbols in each screen. The
 * upstream DSH icon package currently exposes roughly seventy glyphs; only glyphs that ElecKoi
 * actually assigns a product meaning should be ported into this object.
 */
object DshTimelineIcons {
    /** Closed role-setting book with a structurally integrated lower-right search lens. */
    val SearchSetting: ImageVector by lazy {
        ImageVector.Builder(
            name = "DshSearchSetting",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            // Outer cover. The right and bottom strokes terminate exactly on the lens arc, so the
            // lens becomes the missing lower-right book corner instead of floating beside it.
            path(
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.75f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                moveTo(5.2f, 3.5f)
                lineTo(14.7f, 3.5f)
                curveTo(15.63f, 3.5f, 16.1f, 3.97f, 16.1f, 4.9f)
                lineTo(16.1f, 12.23f)

                moveTo(5.2f, 3.5f)
                curveTo(4.27f, 3.5f, 3.8f, 3.97f, 3.8f, 4.9f)
                lineTo(3.8f, 18.2f)
                curveTo(3.8f, 19.2f, 4.3f, 19.7f, 5.3f, 19.7f)
                lineTo(14f, 19.7f)
            }

            // A compact ribbon preserves the visual language of the selected closed-book glyph.
            path(
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.65f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                moveTo(7f, 3.5f)
                lineTo(7f, 9f)
                lineTo(8.8f, 7.8f)
                lineTo(10.6f, 9f)
                lineTo(10.6f, 3.5f)
            }

            // Lens center (16.6, 16.4), radius 4.2. Its upper-left and lower-left arc points meet
            // the two open cover strokes above; the handle continues the same visual stroke.
            path(
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.75f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                moveTo(20.8f, 16.4f)
                arcTo(4.2f, 4.2f, 0f, true, true, 12.4f, 16.4f)
                arcTo(4.2f, 4.2f, 0f, true, true, 20.8f, 16.4f)
                moveTo(19.57f, 19.37f)
                lineTo(22f, 21.8f)
            }
        }.build()
    }

    val ToolWrench: ImageVector by lazy {
        ImageVector.Builder(
            name = "DshToolWrench",
            defaultWidth = 16.dp,
            defaultHeight = 16.dp,
            viewportWidth = 16f,
            viewportHeight = 16f,
        ).apply {
            path(
                fill = null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.5f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ) {
                moveTo(14f, 3.3f)
                arcToRelative(3.8f, 3.8f, 0f, false, true, -4.8f, 4.8f)
                lineToRelative(-5.1f, 5.1f)
                arcToRelative(1.6f, 1.6f, 0f, true, true, -2.3f, -2.3f)
                lineToRelative(5.1f, -5.1f)
                arcTo(3.8f, 3.8f, 0f, false, true, 11.7f, 1f)
                lineToRelative(-2.3f, 2.3f)
                lineToRelative(2.3f, 2.3f)
                lineTo(14f, 3.3f)
                close()
            }
        }.build()
    }

}
