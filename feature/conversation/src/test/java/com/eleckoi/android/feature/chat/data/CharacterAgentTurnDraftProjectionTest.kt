package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.feature.characters.model.CharacterCard
import com.eleckoi.android.feature.chat.model.ChatDraft
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatSession
import com.eleckoi.android.feature.chat.model.MessageRole
import org.junit.Assert.assertEquals
import org.junit.Test

class CharacterAgentTurnDraftProjectionTest {
    @Test
    fun preparesDependenciesOnceAcrossManyStreamSnapshots() {
        val session = ChatSession(
            id = "session",
            title = "title",
            characterId = "character",
            characterName = "character",
            characterAvatar = "",
            characterPersona = CharacterCard(),
            messages = emptyList(),
            updatedAt = "now",
        )
        val config = ModelConfig(id = "config", model = "model")
        var preparations = 0
        var projections = 0
        val turnProjection = CharacterAgentTurnDraftProjection(session, config) { _, preparedConfig ->
            preparations += 1
            { snapshot ->
                projections += 1
                ChatDraft(snapshot, preparedConfig, preparedConfig.model)
            }
        }

        repeat(10_000) { index ->
            turnProjection.project(
                session.copy(
                    messages = listOf(
                        ChatMessage(
                            id = "pending",
                            role = MessageRole.Assistant,
                            content = "delta-$index",
                            pending = true,
                        ),
                    ),
                ),
            )
        }

        assertEquals(1, preparations)
        assertEquals(10_000, projections)
    }
}
