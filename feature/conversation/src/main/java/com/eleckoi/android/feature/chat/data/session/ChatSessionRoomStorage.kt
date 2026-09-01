package com.eleckoi.android.feature.chat.data.session

import androidx.paging.PagingData
import com.eleckoi.android.engine.agent.eleckoi.conversation.PagedConversationTurn
import com.eleckoi.android.engine.agent.eleckoi.conversation.RoomConversationLedger
import com.eleckoi.android.feature.chat.data.chatSessionFromRoom
import com.eleckoi.android.feature.chat.data.ChatSessionNotFoundException
import com.eleckoi.android.feature.chat.data.toChatMessage
import com.eleckoi.android.feature.chat.data.toEntity
import com.eleckoi.android.feature.chat.data.toLedgerMessage
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatSession
import com.eleckoi.android.foundation.storage.room.ChatSessionEntity
import com.eleckoi.android.foundation.storage.room.ElecKoiDatabase
import kotlinx.coroutines.flow.Flow

/** The single Room/ledger boundary for persisted raw conversation messages. */
internal class ChatSessionRoomStorage(private val database: ElecKoiDatabase) {
    val dao = database.chatDao()
    val ledger = RoomConversationLedger(database)

    fun pagingTurns(sessionId: String): Flow<PagingData<PagedConversationTurn>> =
        ledger.pagingTurns(sessionId)

    fun databaseTransaction(block: () -> Unit) {
        database.runInTransaction { block() }
    }

    fun activeMessages(sessionId: String): List<ChatMessage> {
        ensureLedger(requireSession(sessionId))
        return ledger.allMessages(sessionId).map { it.toChatMessage() }
    }

    fun writeInTransaction(session: ChatSession) {
        check(database.inTransaction())
        val previous = dao.sessionById(session.id)
        val preliminary = session.toEntity()
        dao.upsertSession(preliminary)
        ledger.replaceActiveTimelineForImportInTransaction(
            conversationId = session.id,
            createdAt = session.createdAt,
            updatedAt = session.updatedAt,
            messages = session.messages.map { it.toLedgerMessage() },
        )
        val summary = session.messages.asReversed()
            .firstOrNull { it.content.isNotBlank() }
            ?.content
            ?.take(42)
            ?: previous?.historySummary.orEmpty()
        dao.upsertSession(
            preliminary.copy(
                historySummary = summary,
                historyMessageCount = ledger.activeMessageCount(session.id),
                historyUserMessageCount = ledger.activeUserMessageCount(session.id),
            ),
        )
    }

    fun upsertMetadataInTransaction(session: ChatSession) {
        check(database.inTransaction())
        val previous = dao.sessionById(session.id)
        dao.upsertSession(
            session.toEntity().copy(
                historySummary = previous?.historySummary.orEmpty(),
                historyMessageCount = previous?.historyMessageCount ?: 0,
                historyUserMessageCount = previous?.historyUserMessageCount ?: 0,
            ),
        )
    }

    fun refreshHistoryMetadataInTransaction(session: ChatSession, summaryCandidate: String) {
        check(database.inTransaction())
        val current = requireNotNull(dao.sessionById(session.id))
        val updated = current.copy(
            historySummary = summaryCandidate.takeIf(String::isNotBlank)
                ?.take(42)
                ?: current.historySummary,
            historyMessageCount = ledger.activeMessageCount(session.id),
            historyUserMessageCount = ledger.activeUserMessageCount(session.id),
        )
        dao.upsertSession(updated)
    }

    fun sessionFromEntity(
        entity: ChatSessionEntity,
        includeAllMessages: Boolean = false,
    ): ChatSession {
        ensureLedger(entity)
        if (includeAllMessages) {
            return chatSessionFromRoom(
                session = entity,
                messages = ledger.allMessages(entity.id).map { it.toChatMessage() },
            )
        }
        ledger.displayCache(entity.id)?.let { cached ->
            return chatSessionFromRoom(
                session = entity,
                messages = cached.map { it.toChatMessage() },
            )
        }
        val page = ledger.page(entity.id, beforeSequence = null, limit = DisplayPageTurns)
        return chatSessionFromRoom(
            session = entity,
            messages = page.messages.map { it.toChatMessage() },
        )
    }

    fun ensureLedger(entity: ChatSessionEntity) {
        if (ledger.containsConversation(entity.id)) return
        database.runInTransaction {
            ledger.ensureConversationInTransaction(
                conversationId = entity.id,
                createdAt = entity.createdAt,
                updatedAt = entity.updatedAt,
                initialMessages = emptyList(),
            )
        }
    }

    fun requireSession(sessionId: String): ChatSessionEntity =
        dao.sessionById(sessionId) ?: throw ChatSessionNotFoundException(sessionId)

    private companion object {
        const val DisplayPageTurns = 30
    }
}
