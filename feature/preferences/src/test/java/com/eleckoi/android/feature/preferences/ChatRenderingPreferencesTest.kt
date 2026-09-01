package com.eleckoi.android.feature.preferences

import org.junit.Assert.assertEquals
import org.junit.Test

class ChatRenderingPreferencesTest {
    @Test
    fun newInstallDefaultsToRoleplayWithRoleplayMetrics() {
        val preferences = UiPreferences()

        assertEquals(ChatLayoutMode.Roleplay, preferences.chatLayoutMode)
        assertEquals(ChatAvatarShape.Portrait, preferences.chatAvatarShape)
        assertEquals(RoleplayLayoutDefaults.AvatarSize, preferences.chatAvatarSize)
        assertEquals(RoleplayLayoutDefaults.TurnSpacing, preferences.chatTurnSpacing)
        assertEquals(10f, preferences.chatParagraphSpacing)
    }

    @Test
    fun renderingDefaultsPreserveCollapsedReasoningAndUseSimpleCode() {
        val preferences = UiPreferences()

        assertEquals(ChatReasoningDisplayMode.Collapsed, preferences.chatReasoningDisplayMode)
        assertEquals(ChatToolTimelineStyle.Codex, preferences.chatToolTimelineStyle)
        assertEquals(ChatCodeBlockStyle.Simple, preferences.chatCodeBlockStyle)
        assertEquals(false, preferences.chatCodeBlockWrapEnabled)
        assertEquals(false, preferences.chatCodeBlockShowAllEnabled)
        assertEquals(
            ChatTimelineThinkingAnimation.BigHead,
            preferences.chatTimelineThinkingAnimation,
        )
    }

    @Test
    fun unknownStoredRenderingValuesFallBackToDefaults() {
        assertEquals(
            ChatReasoningDisplayMode.Collapsed,
            ChatReasoningDisplayMode.fromStorageKey("unknown"),
        )
        assertEquals(
            ChatCodeBlockStyle.Simple,
            ChatCodeBlockStyle.fromStorageKey("unknown"),
        )
        assertEquals(
            ChatToolTimelineStyle.Codex,
            ChatToolTimelineStyle.fromStorageKey("unknown"),
        )
        assertEquals(
            ChatTimelineThinkingAnimation.BigHead,
            ChatTimelineThinkingAnimation.fromStorageKey("unknown"),
        )
    }

    @Test
    fun timelineBarsAnimationRoundTripsFromStorage() {
        assertEquals(
            ChatTimelineThinkingAnimation.Bars,
            ChatTimelineThinkingAnimation.fromStorageKey("bars"),
        )
    }

    @Test
    fun dshToolTimelineStyleRoundTripsFromStorage() {
        assertEquals(ChatToolTimelineStyle.Dsh, ChatToolTimelineStyle.fromStorageKey("dsh"))
    }
}
