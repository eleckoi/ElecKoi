package com.eleckoi.android.feature.chat.ui

import com.eleckoi.android.feature.chat.ui.screen.shouldSuppressChatContentImePadding
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatEditImePolicyTest {
    @Test
    fun editorKeepsConversationIndependentFromIme() {
        assertTrue(
            shouldSuppressChatContentImePadding(
                wasSuppressed = false,
                editorOpen = true,
                imeBottomPx = 0,
            ),
        )
    }

    @Test
    fun suppressionSurvivesEditorDismissUntilImeIsGone() {
        assertTrue(
            shouldSuppressChatContentImePadding(
                wasSuppressed = true,
                editorOpen = false,
                imeBottomPx = 900,
            ),
        )
        assertFalse(
            shouldSuppressChatContentImePadding(
                wasSuppressed = true,
                editorOpen = false,
                imeBottomPx = 0,
            ),
        )
    }
}
