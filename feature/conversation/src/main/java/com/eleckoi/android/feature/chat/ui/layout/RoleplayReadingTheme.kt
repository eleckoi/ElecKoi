package com.eleckoi.android.feature.chat.ui.layout

import androidx.compose.ui.graphics.Color
import com.eleckoi.android.foundation.design.AppearanceTheme

// A neutral near-black veil and a warm white foreground.
// Keeping this independent from the app palette prevents a light app theme from painting a white
// veil over character art and then switching the roleplay transcript back to black text.
internal val RoleplayScrimColor = Color(0xFF171717)
internal val RoleplayTextColor = Color(0xFFF5F5F2)
internal val RoleplayMutedTextColor = Color(0xFFB8B8B2)
internal val RoleplaySoftTextColor = Color(0xFF92928D)
internal val RoleplayPanelColor = Color(0xFF3C3C3C)

fun AppearanceTheme.asRoleplayReadingTheme(): AppearanceTheme = copy(
    mobileBg = RoleplayScrimColor,
    mobilePinnedBg = Color(0xFF292929),
    mobileSurface = Color(0xFF242425),
    mobileText = RoleplayTextColor,
    mobileMuted = RoleplayMutedTextColor,
    mobileSoft = RoleplaySoftTextColor,
    mobileLine = Color.White.copy(alpha = 0.18f),
    mobileSearchBg = Color(0xFF303031),
    mobileChatBg = RoleplayScrimColor,
    mobileChatHeaderBg = RoleplayScrimColor,
    mobileChatMessageBg = RoleplayPanelColor,
    mobileChatMessageFg = RoleplayTextColor,
    mobileChatUserBg = RoleplayPanelColor,
    mobileChatUserFg = RoleplayTextColor,
    mobileChatTextureScrim = RoleplayScrimColor,
    mobileBlue = Color(0xFFB7D8FF),
    mobileAccentFg = RoleplayScrimColor,
    isDark = true,
)
