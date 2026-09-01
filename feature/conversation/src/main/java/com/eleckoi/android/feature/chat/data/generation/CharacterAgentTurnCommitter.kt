package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.feature.chat.data.markdown.CompletedMarkdownDocumentLoader
import com.eleckoi.android.feature.chat.model.ChatSession
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import java.util.concurrent.CancellationException

internal class CharacterAgentTurnCommitter(
    private val generations: GenerationLeaseRegistry,
    private val sessions: ChatSessionStore,
    private val generationAttempts: GenerationAttemptRepository,
) {
    suspend fun commitActive(
        lease: GenerationLeaseRegistry.Lease,
        session: ChatSession,
        terminalAttemptId: String? = null,
        terminalAttemptState: GenerationAttemptState? = null,
        terminalAttemptError: String = "",
    ) {
        var attemptAccepted = terminalAttemptId == null
        val committed = generations.commitIfActive(lease) {
            if (terminalAttemptId != null && !generationAttempts.isCurrent(terminalAttemptId)) {
                return@commitIfActive
            }
            attemptAccepted = true
            persistCompletedTail(
                session = session,
                terminalAttemptId = terminalAttemptId,
                terminalAttemptState = terminalAttemptState,
                terminalAttemptError = terminalAttemptError,
            )
        }
        if (committed) sessions.applyHistorySavePolicy(session.characterId)
        if (!committed) ensureActive(lease)
        if (!attemptAccepted) {
            throw CancellationException("生成结果已被新的尝试替代")
        }
    }

    fun persistCompletedTail(
        session: ChatSession,
        terminalAttemptId: String? = null,
        terminalAttemptState: GenerationAttemptState? = null,
        terminalAttemptError: String = "",
    ) {
        val response = session.messages.lastOrNull()
        if (response?.role != MessageRole.Assistant || response.pending) {
            sessions.updateMetadata(session)
            finishAttempt(terminalAttemptId, terminalAttemptState, terminalAttemptError)
            return
        }
        val responseIndex = session.messages.lastIndex
        val user = session.messages.subList(0, responseIndex)
            .lastOrNull { it.role == MessageRole.User }
        if (user == null) {
            // Opening/system-only snapshots are import/bootstrap concerns, not generated turns.
            sessions.updateMetadata(session)
            finishAttempt(terminalAttemptId, terminalAttemptState, terminalAttemptError)
            return
        }
        sessions.commitAssistantResponse(
            session = session,
            userMessageId = user.id,
            response = response,
            terminalAttemptId = terminalAttemptId,
            terminalAttemptState = terminalAttemptState,
            terminalAttemptError = terminalAttemptError,
        )
        CompletedMarkdownDocumentLoader.warm(
            ownerKey = "chat:${session.id}:${response.id}",
            markdown = response.content,
        )
    }

    private fun finishAttempt(
        attemptId: String?,
        state: GenerationAttemptState?,
        errorMessage: String,
    ) {
        if (attemptId != null && state != null) {
            sessions.finishGenerationAttempt(
                attemptId = attemptId,
                state = state,
                errorMessage = errorMessage,
            )
        }
    }

    private fun ensureActive(lease: GenerationLeaseRegistry.Lease) {
        if (generations.isCancelled(lease)) throw ElecKoiDataException(GenerationCancelled)
    }
}
