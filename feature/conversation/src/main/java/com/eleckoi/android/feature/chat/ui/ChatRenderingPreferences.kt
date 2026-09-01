package com.eleckoi.android.feature.chat.ui

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import com.eleckoi.android.feature.preferences.ChatCodeBlockStyle
import com.eleckoi.android.feature.preferences.ChatCodeBlockDefaults
import com.eleckoi.android.feature.preferences.ChatReasoningDisplayMode
import com.eleckoi.android.feature.preferences.ChatTimelineThinkingAnimation
import com.eleckoi.android.feature.preferences.ChatToolTimelineStyle

/** Rendering-only preferences shared by every surface that displays assistant Markdown. */
@Immutable
data class ChatRenderingPreferences(
    val reasoningDisplayMode: ChatReasoningDisplayMode = ChatReasoningDisplayMode.Default,
    val toolTimelineStyle: ChatToolTimelineStyle = ChatToolTimelineStyle.Default,
    val codeBlockStyle: ChatCodeBlockStyle = ChatCodeBlockStyle.Default,
    val codeBlockWrapEnabled: Boolean = ChatCodeBlockDefaults.WrapEnabled,
    val codeBlockShowAllEnabled: Boolean = ChatCodeBlockDefaults.ShowAllEnabled,
    val timelineThinkingAnimation: ChatTimelineThinkingAnimation =
        ChatTimelineThinkingAnimation.Default,
)

val LocalChatRenderingPreferences = staticCompositionLocalOf { ChatRenderingPreferences() }
