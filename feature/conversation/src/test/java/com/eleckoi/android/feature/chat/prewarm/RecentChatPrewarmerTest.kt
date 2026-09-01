package com.eleckoi.android.feature.chat.prewarm

import com.eleckoi.android.feature.chat.model.ChatListItem
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.MessageRole
import java.time.Duration
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Test
import kotlinx.coroutines.runBlocking

class RecentChatPrewarmerTest {
    private val now = Instant.parse("2026-07-20T10:00:00Z")

    @Test
    fun `warms user and assistant messages with the exact UI owner key`() = runBlocking {
        val loaded = mutableListOf<Pair<String, String>>()

        prewarmCompletedMessageDocuments(
            messages = listOf(
                ChatMessage("user-1", MessageRole.User, "你好"),
                ChatMessage("assistant-1", MessageRole.Assistant, "普通短回复"),
                ChatMessage("pending", MessageRole.Assistant, "未完成", pending = true),
            ),
            cacheScopeKey = "chat:session-1",
            load = { ownerKey, markdown -> loaded += ownerKey to markdown },
        )

        assertEquals(
            listOf(
                "chat:session-1:assistant-1" to "普通短回复",
                "chat:session-1:user-1" to "你好",
            ),
            loaded,
        )
    }

    @Test
    fun `selects each role active conversation inside rolling day`() {
        val chats = listOf(
            chat("current", "current-role", now.minusSeconds(60)),
            chat("a-newer", "role-a", now.minusSeconds(60 * 60)),
            chat("a-active", "role-a", now.minusSeconds(2 * 60 * 60)),
            chat("b-latest", "role-b", now.minusSeconds(3 * 60 * 60)),
            chat("old", "role-old", now.minus(Duration.ofHours(25))),
            chat("invalid-time", "role-invalid", null),
        )

        val result = recentChatPrewarmTargets(
            chats = chats,
            activeChatSessionIds = mapOf("role-a" to "a-active"),
            currentSessionId = "current",
            now = now,
        )

        assertEquals(listOf("a-active", "b-latest"), result.map(ChatListItem::id))
    }

    @Test
    fun `keeps the rolling day boundary without a role count cap`() {
        val chats = buildList {
            repeat(30) { index ->
                add(chat("recent-$index", "role-$index", now.minusSeconds(index.toLong() + 1)))
            }
            add(
            chat("newest", "role-newest", now),
            )
            add(
            chat("boundary", "role-boundary", now.minus(Duration.ofHours(24))),
            )
            add(
            chat("older", "role-older", now.minus(Duration.ofHours(24)).minusSeconds(1)),
            )
        }

        val result = recentChatPrewarmTargets(
            chats = chats,
            activeChatSessionIds = emptyMap(),
            currentSessionId = "",
            now = now,
        )

        assertEquals(32, result.size)
        assertEquals("newest", result.first().id)
        assertEquals("boundary", result.last().id)
    }

    @Test
    fun `deleted active conversation falls back only to a remaining recent conversation`() {
        val result = recentChatPrewarmTargets(
            chats = listOf(
                chat("remaining", "role-a", now.minusSeconds(60)),
                chat("too-old", "role-b", now.minus(Duration.ofHours(25))),
            ),
            activeChatSessionIds = mapOf(
                "role-a" to "deleted-active",
                "role-b" to "deleted-active-b",
            ),
            currentSessionId = "",
            now = now,
        )

        assertEquals(listOf("remaining"), result.map(ChatListItem::id))
    }

    private fun chat(
        id: String,
        characterId: String,
        updatedAt: Instant?,
    ) = ChatListItem(
        id = id,
        title = id,
        characterId = characterId,
        characterName = characterId,
        characterAvatar = "",
        summary = "",
        updatedAt = updatedAt?.toString().orEmpty(),
        messageCount = 2,
    )
}
