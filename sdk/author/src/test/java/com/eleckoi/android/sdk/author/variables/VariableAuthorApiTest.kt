package com.eleckoi.android.sdk.author.variables

import com.eleckoi.android.sdk.author.AuthorApiCallException
import com.eleckoi.android.sdk.author.AuthorApiErrorCode
import com.eleckoi.android.sdk.author.AuthorMessageSnapshot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VariableAuthorApiTest {
    @Test
    fun `inline message resolves its own snapshot instead of latest runtime state`() {
        val selection = resolveVariableState(
            scopedMessage = message("older", "{\"favor\":2}"),
            requestedMessageId = "",
            chatSession = null,
            runtimeStateJson = "{\"favor\":99}",
            initialStateJson = "{\"favor\":0}",
        )

        assertEquals("{\"favor\":2}", selection.rawState)
        assertEquals("message", selection.source)
        assertEquals("older", selection.messageId)
    }

    @Test
    fun `inline message without snapshot reports unavailable instead of inventing a state`() {
        val selection = resolveVariableState(
            scopedMessage = message("legacy", ""),
            requestedMessageId = "",
            chatSession = null,
            runtimeStateJson = "{\"favor\":99}",
            initialStateJson = "{\"favor\":0}",
        )

        assertEquals(null, selection.rawState)
        assertEquals("unavailable", selection.source)
        assertEquals("legacy", selection.messageId)
        assertTrue(!selection.available)
    }

    @Test
    fun `inline message cannot request another message snapshot`() {
        val error = runCatching {
            resolveVariableState(
                scopedMessage = message("owned", "{}"),
                requestedMessageId = "other",
                chatSession = null,
                runtimeStateJson = "{}",
                initialStateJson = "{}",
            )
        }.exceptionOrNull()

        assertTrue(error is AuthorApiCallException)
        assertEquals(AuthorApiErrorCode.PermissionDenied, (error as AuthorApiCallException).code)
    }

    private fun message(id: String, state: String) = AuthorMessageSnapshot(
        id = id,
        role = "assistant",
        content = "[变量状态栏]",
        reasoningContent = "",
        provider = "",
        model = "",
        createdAt = "",
        pending = false,
        variableStateJson = state,
    )
}
