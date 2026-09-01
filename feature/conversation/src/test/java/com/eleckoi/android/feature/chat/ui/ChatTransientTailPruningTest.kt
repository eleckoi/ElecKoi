package com.eleckoi.android.feature.chat.ui

import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.MessageRole
import org.junit.Assert.assertEquals
import org.junit.Test

class ChatTransientTailPruningTest {
    @Test
    fun `regeneration removes deleted suffix from transient tail`() {
        val retainedUser = message("user-retained", MessageRole.User)
        val replacementPending = message("assistant-new", MessageRole.Assistant, pending = true)
        val transientTail = linkedMapOf(
            "assistant-deleted" to message("assistant-deleted", MessageRole.Assistant),
            "user-deleted" to message("user-deleted", MessageRole.User),
            replacementPending.id to replacementPending,
        )

        pruneTransientTailToCurrentTimeline(
            transientTail = transientTail,
            current = listOf(retainedUser, replacementPending),
        )

        assertEquals(listOf(replacementPending.id), transientTail.keys.toList())
    }

    @Test
    fun `completed transient reply remains until its Room row can replace it`() {
        val completed = message("assistant-final", MessageRole.Assistant)
        val transientTail = linkedMapOf(completed.id to completed)

        pruneTransientTailToCurrentTimeline(
            transientTail = transientTail,
            current = listOf(completed),
        )

        assertEquals(listOf(completed.id), transientTail.keys.toList())
    }

    @Test
    fun `same response id cannot retain the old regeneration revision`() {
        val oldReply = message("assistant-stable", MessageRole.Assistant, content = "旧回复")
        val newReply = message("assistant-stable", MessageRole.Assistant, content = "新回复")
        val transientTail = linkedMapOf(oldReply.id to oldReply)

        pruneTransientTailToCurrentTimeline(
            transientTail = transientTail,
            current = listOf(newReply),
        )

        assertEquals(emptyList<String>(), transientTail.keys.toList())
    }

    @Test
    fun `stopped local reply remains authoritative over stale pending checkpoint`() {
        val stopped = message("assistant-1", MessageRole.Assistant, pending = false, content = "思考片段")
        val checkpoint = stopped.copy(pending = true)
        val transientTail = linkedMapOf<String, ChatMessage>()

        retainLocallySettledReplies(
            transientTail = transientTail,
            current = listOf(stopped),
            paged = listOf(checkpoint),
        )

        assertEquals(stopped, transientTail[stopped.id])
    }

    @Test
    fun `matching Room terminal reply does not need transient ownership`() {
        val stopped = message("assistant-1", MessageRole.Assistant, pending = false, content = "思考片段")
        val transientTail = linkedMapOf(stopped.id to stopped)

        retainLocallySettledReplies(
            transientTail = transientTail,
            current = listOf(stopped),
            paged = listOf(stopped),
        )
        transientTail.entries.removeAll { (id, message) ->
            !message.pending && listOf(stopped).associateBy(ChatMessage::id)[id] == message
        }

        assertEquals(emptyList<String>(), transientTail.keys.toList())
    }

    @Test
    fun `terminal handoff keeps settled assistant while Paging still exposes checkpoint`() {
        val opening = message("opening", MessageRole.Assistant, content = "开场")
        val user = message("user-1", MessageRole.User, content = "继续")
        val settled = message("assistant-1", MessageRole.Assistant, content = "最终回复")

        assertEquals(
            listOf(settled),
            settledTimelineHandoff(
                current = listOf(opening, user, settled),
                paged = listOf(opening, user),
            ),
        )
    }

    @Test
    fun `terminal handoff does not resurrect pending or non-tail rows`() {
        val opening = message("opening", MessageRole.Assistant, content = "开场")
        val user = message("user-1", MessageRole.User, content = "继续")
        val pending = message("assistant-pending", MessageRole.Assistant, pending = true)
        val laterSettled = message("assistant-2", MessageRole.Assistant, content = "后续")

        assertEquals(
            listOf(laterSettled),
            settledTimelineHandoff(
                current = listOf(opening, user, pending, laterSettled),
                paged = listOf(opening, user),
            ),
        )
    }

    @Test
    fun `terminal handoff keeps user and assistant suffix together`() {
        val opening = message("opening", MessageRole.Assistant, content = "开场")
        val firstUser = message("user-1", MessageRole.User, content = "第一问")
        val firstReply = message("assistant-1", MessageRole.Assistant, content = "第一答")
        val secondUser = message("user-2", MessageRole.User, content = "第二问")
        val secondReply = message("assistant-2", MessageRole.Assistant, content = "第二答")

        assertEquals(
            listOf(secondUser, secondReply),
            settledTimelineHandoff(
                current = listOf(opening, firstUser, firstReply, secondUser, secondReply),
                paged = listOf(opening, firstUser, firstReply),
            ),
        )
    }

    private fun message(
        id: String,
        role: MessageRole,
        pending: Boolean = false,
        content: String = id,
    ) = ChatMessage(
        id = id,
        role = role,
        content = content,
        pending = pending,
    )
}
