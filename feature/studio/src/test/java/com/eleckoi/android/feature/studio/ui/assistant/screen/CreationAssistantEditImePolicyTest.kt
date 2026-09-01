package com.eleckoi.android.feature.studio.ui.assistant.screen

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CreationAssistantEditImePolicyTest {
    @Test
    fun editorUsesOverlayImeWithoutResizingConversationRoot() {
        assertTrue(
            shouldKeepCreationWindowUnresized(
                conversationComposerVisible = false,
                editingUserMessageOpen = true,
            ),
        )
        assertFalse(
            shouldApplyCreationRootImePadding(
                conversationComposerVisible = false,
                editingUserMessageOpen = true,
            ),
        )
    }

    @Test
    fun conversationImeLiftStaysSuppressedWhileEditorIsOpen() {
        assertTrue(
            shouldSuppressCreationConversationImeLift(
                wasSuppressed = false,
                editorOpen = true,
                imeBottomPx = 900,
            ),
        )
    }

    @Test
    fun conversationImeLiftStaysSuppressedWhileEditorKeyboardIsClosing() {
        assertTrue(
            shouldSuppressCreationConversationImeLift(
                wasSuppressed = true,
                editorOpen = false,
                imeBottomPx = 420,
            ),
        )
    }

    @Test
    fun conversationImeLiftResumesAfterEditorKeyboardIsGone() {
        assertFalse(
            shouldSuppressCreationConversationImeLift(
                wasSuppressed = true,
                editorOpen = false,
                imeBottomPx = 0,
            ),
        )
    }
}
