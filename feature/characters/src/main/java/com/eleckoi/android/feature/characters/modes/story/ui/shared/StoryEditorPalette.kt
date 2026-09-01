package com.eleckoi.android.feature.characters.modes.story.ui.shared

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import com.eleckoi.android.foundation.design.AppearanceTheme

/**
 * The story editor pages' own tones.
 *
 * These pages were drawn straight from [AppearanceTheme]'s general values, which are tuned for the
 * list and chat surfaces: the page sat a shade too light for white cards to separate from it, and
 * every label reached for `mobileMuted`, a text colour dark enough to compete with the content it
 * was labelling.
 *
 * Every value here is derived from the theme rather than written down, so a custom appearance still
 * carries through — on the stock light theme the arithmetic lands exactly on the design's numbers,
 * which is how the two were reconciled.
 */
internal data class StoryEditorPalette(
    /** The page itself: one step down from the app background so white cards read as laid on it. */
    val pageBg: Color,
    /** Cards, fields, anything holding content. */
    val cardFace: Color,
    /** Section labels — deliberately lighter than body copy; a label is not the point of its row. */
    val label: Color,
    /** Body copy inside a card. */
    val bodyText: Color,
    /** Counts, placeholders, anything reporting rather than saying. */
    val meta: Color,
    /** Hairlines inside a card. */
    val divider: Color,
    /** A recessed track, for the segmented control's groove. */
    val track: Color,
)

@Composable
internal fun AppearanceTheme.storyEditorPalette(): StoryEditorPalette {
    val ink = mobileText
    val page = ink.copy(alpha = 0.015f).compositeOver(mobileBg)
    return StoryEditorPalette(
        pageBg = page,
        cardFace = mobileSurface,
        label = mobileBg.copy(alpha = 0.13f).compositeOver(mobileMuted),
        bodyText = ink,
        meta = mobileBg.copy(alpha = 0.22f).compositeOver(mobileMuted),
        divider = ink.copy(alpha = 0.07f),
        track = ink.copy(alpha = 0.068f).compositeOver(page),
    )
}
