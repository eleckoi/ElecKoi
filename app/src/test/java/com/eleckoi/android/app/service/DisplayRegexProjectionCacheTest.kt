package com.eleckoi.android.app.service

import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleTarget
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ImmutableAppendedList
import com.eleckoi.android.feature.chat.model.MessageRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class DisplayRegexProjectionCacheTest {
    @Test
    fun sharesAnIdenticalProjectionAcrossConversationSources() {
        val cache = DisplayRegexProjectionCache()
        var transformations = 0

        repeat(3) {
            cache.project(
                characterId = "character",
                regexRevision = 4L,
                messageId = "message",
                target = RegexRuleTarget.AiOutput,
                content = "source",
                reasoningContent = "reasoning",
            ) {
                transformations += 1
                DisplayRegexProjection("display", "display reasoning")
            }
        }

        assertEquals(1, transformations)
    }

    @Test
    fun contentOrRuleRevisionInvalidatesTheProjection() {
        val cache = DisplayRegexProjectionCache()
        var transformations = 0

        fun project(content: String, revision: Long) {
            cache.project(
                characterId = "character",
                regexRevision = revision,
                messageId = "message",
                target = RegexRuleTarget.AiOutput,
                content = content,
                reasoningContent = "",
            ) {
                transformations += 1
                DisplayRegexProjection(content.uppercase(), "")
            }
        }

        project("first", 1L)
        project("second", 1L)
        project("second", 2L)

        assertEquals(3, transformations)
    }

    @Test
    fun variableSnapshotOrAssistantCompletionInvalidatesTheProjection() {
        val cache = DisplayRegexProjectionCache()
        var transformations = 0

        fun project(variableStateJson: String, completedAssistant: Boolean) {
            cache.project(
                characterId = "character",
                regexRevision = 1L,
                messageId = "assistant",
                target = RegexRuleTarget.AiOutput,
                content = "unchanged",
                reasoningContent = "",
                variableStateJson = variableStateJson,
                completedAssistant = completedAssistant,
            ) {
                transformations += 1
                DisplayRegexProjection("display-$transformations", "")
            }
        }

        project("{\"hp\":1}", completedAssistant = false)
        project("{\"hp\":2}", completedAssistant = false)
        project("{\"hp\":2}", completedAssistant = true)
        project("{\"hp\":2}", completedAssistant = true)

        assertEquals(3, transformations)
    }

    @Test
    fun oversizedProjectionIsReturnedButNotRetained() {
        val cache = DisplayRegexProjectionCache(
            maxRetainedCharacters = 32,
            maxEntryCharacters = 16,
        )
        var transformations = 0

        repeat(2) {
            val projection = cache.project(
                characterId = "character",
                regexRevision = 1L,
                messageId = "giant",
                target = RegexRuleTarget.AiOutput,
                content = "source-content",
                reasoningContent = "",
            ) {
                transformations += 1
                DisplayRegexProjection("display-content", "")
            }
            assertEquals("display-content", projection.content)
        }

        assertEquals(2, transformations)
    }

    @Test
    fun characterBudgetEvictsLeastRecentlyUsedProjection() {
        val cache = DisplayRegexProjectionCache(
            maxEntries = 10,
            maxRetainedCharacters = 16,
            maxEntryCharacters = 16,
        )
        var transformations = 0

        fun project(messageId: String) {
            cache.project(
                characterId = "character",
                regexRevision = 1L,
                messageId = messageId,
                target = RegexRuleTarget.AiOutput,
                content = "src!",
                reasoningContent = "",
            ) {
                transformations += 1
                DisplayRegexProjection("view", "")
            }
        }

        project("first")
        project("second")
        project("third")
        project("first")

        assertEquals(4, transformations)
    }

    @Test
    fun streamedTailReusesTheProjectedHistoryPrefix() {
        val projector = DisplayRegexMessageListProjector()
        val history = List(1_000) { index ->
            ChatMessage("message-$index", MessageRole.User, "history-$index")
        }
        var transformations = 0
        fun project(tail: ChatMessage): List<ChatMessage> = projector.project(
            messages = ImmutableAppendedList(history, tail),
            characterId = "character",
            regexRevision = 3L,
        ) { message ->
            transformations += 1
            message.copy(content = message.content.uppercase())
        }

        val first = project(ChatMessage("tail", MessageRole.Assistant, "a", pending = true))
        val second = project(ChatMessage("tail", MessageRole.Assistant, "ab", pending = true))

        assertEquals(1_002, transformations)
        val firstAppended = first as ImmutableAppendedList
        val secondAppended = second as ImmutableAppendedList
        assertSame(firstAppended.prefix, secondAppended.prefix)
        assertEquals("AB", second.last().content)
    }
}
