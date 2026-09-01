package com.eleckoi.android.feature.chat.ui.message

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatRichHandoffTest {
    @Test
    fun `native layer remains visible until rich document is ready`() {
        assertTrue(
            shouldKeepNativeLayerDuringRichHandoff(
                richDocumentAvailable = false,
                richReady = false,
            ),
        )
        assertTrue(
            shouldKeepNativeLayerDuringRichHandoff(
                richDocumentAvailable = true,
                richReady = false,
            ),
        )
        assertFalse(
            shouldKeepNativeLayerDuringRichHandoff(
                richDocumentAvailable = true,
                richReady = true,
            ),
        )
    }
}
