package com.eleckoi.android.feature.chat.ui.layout

import com.eleckoi.android.feature.preferences.ChatLayoutDefaults

/** One typography calculation for every layout: the mode never scales a numeric font setting. */
fun resolveChatBodyFontSizeSp(value: Float): Float =
    value.coerceIn(
        ChatLayoutDefaults.MessageFontSizeMin,
        ChatLayoutDefaults.MessageFontSizeMax,
    )

fun resolveChatBodyLineHeightSp(
    fontSize: Float,
    multiplier: Float,
): Float = resolveChatBodyFontSizeSp(fontSize) *
    ChatLayoutDefaults.BodyLineHeightBaseMultiplier *
    multiplier.coerceIn(0.8f, 1.6f)
