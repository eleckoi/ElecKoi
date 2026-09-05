package com.eleckoi.android.feature.preferences

import org.junit.Assert.assertEquals
import org.junit.Test

class ActiveChatSessionSelectionTest {
    @Test
    fun `bulk deletion clears all mode pointers and is idempotent`() {
        val deleted = (0 until 5_000).map { "session-$it" }
        val selection = ActiveChatSessionSelection(
            lastSessionId = deleted.last(),
            sessionIdsByContext = deleted.associateBy { "character-$it:story" } + ("retained:agent" to "keep"),
        )
        val result = selection.forgetAll(deleted)
        assertEquals("", result.lastSessionId)
        assertEquals(mapOf("retained:agent" to "keep"), result.sessionIdsByContext)
        assertEquals(result, result.forgetAll(deleted))
    }

    @Test
    fun `each character mode remembers its own selected chat`() {
        val selection = ActiveChatSessionSelection()
            .remember("character-a", "agent", "session-a-agent")
            .remember("character-a", "story", "session-a-story")
            .remember("character-b", "agent", "session-b-agent")

        assertEquals("session-a-story", selection.sessionIdFor("character-a"))
        assertEquals("session-a-agent", selection.sessionIdFor("character-a", "agent"))
        assertEquals("session-a-story", selection.sessionIdFor("character-a", "story"))
        assertEquals("session-b-agent", selection.sessionIdFor("character-b"))
        assertEquals("session-b-agent", selection.lastSessionId)
    }

    @Test
    fun `forget removes a deleted session without disturbing other chat contexts`() {
        val selection = ActiveChatSessionSelection()
            .remember("character-a", "story", "session-a")
            .remember("character-b", "agent", "session-b")
            .forget("session-b")

        assertEquals("session-a", selection.sessionIdFor("character-a"))
        assertEquals("session-a", selection.sessionIdFor("character-a", "story"))
        assertEquals("", selection.sessionIdFor("character-b"))
        assertEquals("", selection.sessionIdFor("character-b", "agent"))
        assertEquals("", selection.lastSessionId)
    }

    @Test
    fun `character level shortcut never substitutes a different mode selection`() {
        val selection = ActiveChatSessionSelection(
            sessionIdsByContext = mapOf(
                "character-a" to "session-story",
                "character-a:agent" to "session-agent",
                "character-a:story" to "session-story",
            ),
        )

        assertEquals("session-story", selection.sessionIdFor("character-a"))
        assertEquals("session-agent", selection.sessionIdFor("character-a", "agent"))
        assertEquals("session-story", selection.sessionIdFor("character-a", "story"))
        assertEquals("", selection.sessionIdFor("character-a", "missing"))
    }
}
