package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.feature.chat.model.ChatDraft
import com.eleckoi.android.feature.chat.model.ChatSession

/**
 * Freezes the display/configuration dependencies for one model turn.
 *
 * Stream snapshots may arrive every frame. Preparing their projector once keeps repository and
 * Room reads out of that hot path while still allowing the pending session tail to change.
 */
internal class CharacterAgentTurnDraftProjection(
    initialSession: ChatSession,
    config: ModelConfig,
    prepare: (ChatSession, ModelConfig) -> (ChatSession) -> ChatDraft,
) {
    private val projectSession = prepare(initialSession, config)

    fun project(session: ChatSession): ChatDraft = projectSession(session)
}
