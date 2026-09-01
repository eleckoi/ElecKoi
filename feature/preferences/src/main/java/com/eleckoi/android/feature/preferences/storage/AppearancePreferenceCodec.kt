package com.eleckoi.android.feature.preferences

import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.MarkdownReadingColorOverrides
import com.eleckoi.android.foundation.design.ScrimStopCeiling
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb

internal fun appearanceThemeFromPreferences(preferences: androidx.datastore.preferences.core.Preferences): AppearanceTheme {
    val defaults = AppearanceTheme()
    val textureImagePath = preferences[TextureImagePath].orEmpty()
    val mobileSearchBg = preferences.colorOr(MobileSearchBg, defaults.mobileSearchBg)
    val storedTopbarBg = preferences[MobileTopbarBg]?.let(::Color)
    val mobileTopbarBg = if (storedTopbarBg?.toArgb() == LegacyDefaultTopbarBg.toArgb()) {
        defaults.mobileTopbarBg
    } else {
        storedTopbarBg ?: defaults.mobileTopbarBg
    }
    val storedTabbarBg = preferences[MobileTabbarBg]?.let(::Color)
    val mobileTabbarBg = if (storedTabbarBg?.toArgb() == LegacyDefaultTabbarBg.toArgb()) {
        defaults.mobileTabbarBg
    } else {
        storedTabbarBg ?: defaults.mobileTabbarBg
    }
    val mobileChatBg = preferences.colorOr(MobileChatBg, defaults.mobileChatBg)
    return defaults.copy(
        mobileBg = preferences.colorOr(MobileBg, defaults.mobileBg),
        mobilePinnedBg = preferences.colorOr(MobilePinnedBg, defaults.mobilePinnedBg),
        mobileSurface = preferences.colorOr(MobileSurface, defaults.mobileSurface),
        mobileText = preferences.colorOr(MobileText, defaults.mobileText),
        mobileMuted = preferences.colorOr(MobileMuted, defaults.mobileMuted),
        mobileSoft = preferences.colorOr(MobileSoft, defaults.mobileSoft),
        mobileLine = preferences.colorOr(MobileLine, defaults.mobileLine),
        mobileSearchBg = mobileSearchBg,
        mobileTopbarBg = mobileTopbarBg,
        mobileTabbarBg = mobileTabbarBg,
        mobileChatBg = mobileChatBg,
        mobileChatHeaderBg = preferences.colorOr(MobileChatHeaderBg, defaults.mobileChatHeaderBg),
        mobileChatMessageBg = preferences.colorOr(MobileChatMessageBg, defaults.mobileChatMessageBg),
        mobileChatMessageFg = preferences.colorOr(MobileChatMessageFg, defaults.mobileChatMessageFg),
        mobileChatUserBg = preferences.colorOr(MobileChatUserBg, defaults.mobileChatUserBg),
        mobileChatUserFg = preferences.colorOr(MobileChatUserFg, defaults.mobileChatUserFg),
        mobileChatTextureScrim = preferences.colorOr(MobileChatTextureScrim, defaults.mobileChatTextureScrim),
        mobileComposerBg = preferences.colorOr(MobileComposerBg, defaults.mobileComposerBg),
        mobileInputBg = preferences.colorOr(MobileInputBg, defaults.mobileInputBg),
        mobileBlue = preferences.colorOr(MobileBlue, defaults.mobileBlue),
        mobileAccentFg = preferences.colorOr(MobileAccentFg, defaults.mobileAccentFg),
        rootBackgroundImagePath = preferences[RootBackgroundImagePath].orEmpty(),
        rootBackgroundOpacity = (preferences[RootBackgroundOpacity] ?: defaults.rootBackgroundOpacity)
            .coerceIn(0f, 1f),
        rootBackgroundBlur = (preferences[RootBackgroundBlur] ?: defaults.rootBackgroundBlur)
            .coerceIn(0f, 24f),
        rootBackgroundScrim = (preferences[RootBackgroundScrim] ?: defaults.rootBackgroundScrim)
            .coerceIn(0f, 1f),
        textureImagePath = textureImagePath,
        textureOpacity = (preferences[TextureOpacity] ?: defaults.textureOpacity).coerceIn(0f, 1f),
        textureBlur = (preferences[TextureBlur] ?: defaults.textureBlur).coerceIn(0f, 24f),
        textureScrim = (preferences[TextureScrim] ?: defaults.textureScrim).coerceIn(0f, 1f),
        isDark = preferences[AppearanceIsDark] ?: defaults.isDark,
        textureScrimAngle = preferences[TextureScrimAngle] ?: defaults.textureScrimAngle,
        textureScrimStart = (preferences[TextureScrimStart] ?: defaults.textureScrimStart).coerceIn(0f, ScrimStopCeiling),
        textureScrimMid = (preferences[TextureScrimMid] ?: defaults.textureScrimMid).coerceIn(0f, ScrimStopCeiling),
        textureScrimEnd = (preferences[TextureScrimEnd] ?: defaults.textureScrimEnd).coerceIn(0f, ScrimStopCeiling),
        textureScrimStartColor = preferences.colorOr(TextureScrimStartColor, defaults.textureScrimStartColor),
        textureScrimEndColor = preferences.colorOr(TextureScrimEndColor, defaults.textureScrimEndColor),
        markdownReadingColors = MarkdownReadingColorOverrides(
            italic = preferences.optionalColor(MarkdownItalicColor),
            underline = preferences.optionalColor(MarkdownUnderlineColor),
            quote = preferences.optionalColor(MarkdownQuoteColor),
            inlineCode = preferences.optionalColor(MarkdownInlineCodeColor),
            codeForeground = preferences.optionalColor(MarkdownCodeForegroundColor),
            codeBackground = preferences.optionalColor(MarkdownCodeBackgroundColor),
        ),
    )
}

internal fun androidx.datastore.preferences.core.MutablePreferences.writeAppearanceTheme(theme: AppearanceTheme) {
    this[AppearanceThemeStored] = true
    this[MobileBg] = theme.mobileBg.toArgb()
    this[MobilePinnedBg] = theme.mobilePinnedBg.toArgb()
    this[MobileSurface] = theme.mobileSurface.toArgb()
    this[MobileText] = theme.mobileText.toArgb()
    this[MobileMuted] = theme.mobileMuted.toArgb()
    this[MobileSoft] = theme.mobileSoft.toArgb()
    this[MobileLine] = theme.mobileLine.toArgb()
    this[MobileSearchBg] = theme.mobileSearchBg.toArgb()
    this[MobileTopbarBg] = theme.mobileTopbarBg.toArgb()
    this[MobileTabbarBg] = theme.mobileTabbarBg.toArgb()
    this[MobileChatBg] = theme.mobileChatBg.toArgb()
    this[MobileChatHeaderBg] = theme.mobileChatHeaderBg.toArgb()
    this[MobileChatMessageBg] = theme.mobileChatMessageBg.toArgb()
    this[MobileChatMessageFg] = theme.mobileChatMessageFg.toArgb()
    this[MobileChatUserBg] = theme.mobileChatUserBg.toArgb()
    this[MobileChatUserFg] = theme.mobileChatUserFg.toArgb()
    this[MobileChatTextureScrim] = theme.mobileChatTextureScrim.toArgb()
    this[MobileComposerBg] = theme.mobileComposerBg.toArgb()
    this[MobileInputBg] = theme.mobileInputBg.toArgb()
    this[MobileBlue] = theme.mobileBlue.toArgb()
    this[MobileAccentFg] = theme.mobileAccentFg.toArgb()
    this[RootBackgroundImagePath] = theme.rootBackgroundImagePath
    this[RootBackgroundOpacity] = theme.rootBackgroundOpacity.coerceIn(0f, 1f)
    this[RootBackgroundBlur] = theme.rootBackgroundBlur.coerceIn(0f, 24f)
    this[RootBackgroundScrim] = theme.rootBackgroundScrim.coerceIn(0f, 1f)
    this[TextureImagePath] = theme.textureImagePath
    this[TextureOpacity] = theme.textureOpacity.coerceIn(0f, 1f)
    this[TextureBlur] = theme.textureBlur.coerceIn(0f, 24f)
    this[TextureScrim] = theme.textureScrim.coerceIn(0f, 1f)
    this[AppearanceIsDark] = theme.isDark
    this[TextureScrimAngle] = theme.textureScrimAngle
    this[TextureScrimStart] = theme.textureScrimStart.coerceIn(0f, ScrimStopCeiling)
    this[TextureScrimMid] = theme.textureScrimMid.coerceIn(0f, ScrimStopCeiling)
    this[TextureScrimEnd] = theme.textureScrimEnd.coerceIn(0f, ScrimStopCeiling)
    this[TextureScrimStartColor] = theme.textureScrimStartColor.toArgb()
    this[TextureScrimEndColor] = theme.textureScrimEndColor.toArgb()
    writeOptionalColor(MarkdownItalicColor, theme.markdownReadingColors.italic)
    writeOptionalColor(MarkdownUnderlineColor, theme.markdownReadingColors.underline)
    writeOptionalColor(MarkdownQuoteColor, theme.markdownReadingColors.quote)
    writeOptionalColor(MarkdownInlineCodeColor, theme.markdownReadingColors.inlineCode)
    writeOptionalColor(MarkdownCodeForegroundColor, theme.markdownReadingColors.codeForeground)
    writeOptionalColor(MarkdownCodeBackgroundColor, theme.markdownReadingColors.codeBackground)
}

private val LegacyDefaultTopbarBg = Color(0xFFEEF4FE)
private val LegacyDefaultTabbarBg = Color(0xFFF5F5F9)

private fun androidx.datastore.preferences.core.Preferences.colorOr(
    key: androidx.datastore.preferences.core.Preferences.Key<Int>,
    fallback: Color,
): Color {
    return this[key]?.let(::Color) ?: fallback
}

private fun androidx.datastore.preferences.core.Preferences.optionalColor(
    key: androidx.datastore.preferences.core.Preferences.Key<Int>,
): Color? = this[key]?.let(::Color)

private fun androidx.datastore.preferences.core.MutablePreferences.writeOptionalColor(
    key: androidx.datastore.preferences.core.Preferences.Key<Int>,
    color: Color?,
) {
    if (color == null) remove(key) else this[key] = color.toArgb()
}
