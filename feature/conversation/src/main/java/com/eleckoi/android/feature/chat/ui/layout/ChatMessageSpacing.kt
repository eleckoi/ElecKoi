package com.eleckoi.android.feature.chat.ui.layout

import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.preferences.ChatLayoutMode

internal fun chatMessageSpacingAfter(
    layoutMode: ChatLayoutMode,
    currentRole: MessageRole,
    nextRole: MessageRole?,
    replySpacing: Float,
    turnSpacing: Float,
): Float {
    if (nextRole == null) return 0f
    // Social is a chronological message stream and Roleplay is a transcript. Neither has a visual
    // reply pair, so every neighbouring message uses the same predictable gap.
    if (layoutMode != ChatLayoutMode.Agent) return turnSpacing.coerceAtLeast(0f)
    return when {
        currentRole == MessageRole.User && nextRole == MessageRole.Assistant -> replySpacing
        currentRole == MessageRole.Assistant && nextRole == MessageRole.User -> turnSpacing
        else -> replySpacing
    }.coerceAtLeast(0f)
}
