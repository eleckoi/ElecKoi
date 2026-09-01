package com.eleckoi.android.foundation.design

import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.Immutable

/**
 * Ceiling on a single veil stop, as a multiple of [AppearanceTheme.textureScrim]. A picture with one
 * very dark end has a low average demand and a high demand at that end, so the stops need real
 * headroom above the average; capping tighter would quietly under-cover the region that needed the
 * veil most. The product is clamped to 1.0 at paint time regardless.
 */
const val ScrimStopCeiling = 4f

/**
 * Optional reading-colour overrides for Markdown message content. A missing value deliberately
 * means "follow the current theme", which lets a palette sampled from an image remain useful
 * without overwriting colours the reader explicitly chose.
 */
@Immutable
data class MarkdownReadingColorOverrides(
    val italic: Color? = null,
    val underline: Color? = null,
    val quote: Color? = null,
    val inlineCode: Color? = null,
    val codeForeground: Color? = null,
    val codeBackground: Color? = null,
)

data class AppearanceTheme(
    val mobileBg: Color = Color(0xFFF7F8FB),
    val mobilePinnedBg: Color = Color(0xFFF0F4FF),
    val mobileSurface: Color = Color.White,
    val mobileText: Color = Color(0xFF14171F),
    val mobileMuted: Color = Color(0xFF6A7280),
    val mobileSoft: Color = Color(0xFFB8BEC8),
    val mobileLine: Color = Color(0x10111827),
    val mobileSearchBg: Color = Color(0xFFF5F6FA),
    // Sampled from the QQ reference. Root chrome owns explicit colours so the glass never collapses
    // into the message surface when there is no wallpaper underneath it.
    val mobileTopbarBg: Color = Color(0xFFF0F4FF),
    val mobileTabbarBg: Color = Color(0xFFF3F3F8),
    val mobileChatBg: Color = Color.White,
    val mobileChatHeaderBg: Color = Color.White,
    val mobileChatMessageBg: Color = Color(0xFFEEF1F7),
    val mobileChatMessageFg: Color = Color(0xFF181B22),
    val mobileChatUserBg: Color = Color(0xFFF2F6FF),
    val mobileChatUserFg: Color = Color(0xFF14171F),
    val mobileChatTextureScrim: Color = Color.Transparent,
    val mobileComposerBg: Color = Color(0xFFF2F2F3),
    val mobileInputBg: Color = Color(0xFFFEFEFF),
    val mobileBlue: Color = Color(0xFF119CFF),
    val mobileAccentFg: Color = Color.White,
    val rootBackgroundImagePath: String = "",
    val rootBackgroundOpacity: Float = 1f,
    val rootBackgroundBlur: Float = 12f,
    val rootBackgroundScrim: Float = 0f,
    val textureImagePath: String = "",
    val textureOpacity: Float = 0.72f,
    val textureBlur: Float = 0f,
    val textureScrim: Float = 0.22f,
    // Whether the generated palette is a dark one. Derived colours used to infer this by measuring
    // mobileBg every time; now the analyzer states it once.
    val isDark: Boolean = false,
    // The reading veil is directional. `textureScrim` is its overall strength (and what the user's
    // slider drives); the three stops are multipliers on that strength along `textureScrimAngle`,
    // so dragging the slider scales the shape instead of flattening it. All 1.0 means a flat veil.
    val textureScrimAngle: Float = 90f,
    val textureScrimStart: Float = 1f,
    val textureScrimMid: Float = 1f,
    val textureScrimEnd: Float = 1f,
    // The veil also carries the picture's own colour along that axis: the end lying over blonde hair
    // veils in a warm white, the end over pink ribbons in a pink one. `mobileChatTextureScrim` is the
    // middle stop. Transparent means "no measurement, reuse the middle".
    val textureScrimStartColor: Color = Color.Transparent,
    val textureScrimEndColor: Color = Color.Transparent,
    val markdownReadingColors: MarkdownReadingColorOverrides = MarkdownReadingColorOverrides(),
)
