package com.eleckoi.android.feature.chat.ui.roleplay.web.host

import com.eleckoi.android.feature.chat.ui.roleplay.web.model.RoleplayTranscriptOrigin
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RoleplayWebChatHostNavigationTest {
    @Test
    fun `authored subframes stay inside the WebView`() {
        listOf(
            "blob:https://eleckoi.local/embedded-app",
            "about:srcdoc",
            "data:text/html,<p>embedded</p>",
            "https://frontend.example/embedded.html",
        ).forEach { url ->
            assertTrue(
                url,
                shouldKeepRoleplayNavigationInWebView(
                    isForMainFrame = false,
                    url = url,
                ),
            )
        }
    }

    @Test
    fun `main transcript stays inside while external main pages do not`() {
        assertTrue(
            shouldKeepRoleplayNavigationInWebView(
                isForMainFrame = true,
                url = "$RoleplayTranscriptOrigin/",
            ),
        )
        assertFalse(
            shouldKeepRoleplayNavigationInWebView(
                isForMainFrame = true,
                url = "https://frontend.example/top-level.html",
            ),
        )
        assertFalse(
            shouldKeepRoleplayNavigationInWebView(
                isForMainFrame = true,
                url = "blob:https://eleckoi.local/replacement-page",
            ),
        )
    }
}
