package com.eleckoi.android.feature.chat.data.session

import com.eleckoi.android.engine.generation.image.ReplyImageGenerator
import com.eleckoi.android.engine.agent.eleckoi.conversation.ConversationAttachmentCleanup
import com.eleckoi.android.feature.chat.data.ChatInputImageStore
import com.eleckoi.android.foundation.storage.room.ElecKoiDatabase

/** Keeps Room rows, generated images, and copied input images in one deletion lifecycle. */
internal class ChatSessionCleanupCoordinator(
    database: ElecKoiDatabase,
    private val room: ChatSessionRoomStorage,
    private val historySaveModeProvider: suspend () -> String,
    replyImageGenerator: ReplyImageGenerator?,
    inputImageStore: ChatInputImageStore?,
    private val onSessionsDeleted: suspend (List<String>) -> Unit,
) {
    private val attachments = ConversationAttachmentCleanup(
        database, { inputImageStore?.deletePath(it) }, replyImageGenerator,
    )

    suspend fun delete(sessionId: String) {
        deleteSessions(listOf(sessionId))
    }

    suspend fun deleteForCharacters(characterIds: List<String>): List<String> {
        val ids = characterIds.filter(String::isNotBlank).toSet()
        if (ids.isEmpty()) return emptyList()
        val deleted = room.dao.sessions().filter { it.characterId in ids }.map { it.id }
        deleteSessions(deleted)
        return deleted
    }

    suspend fun deleteExceptCharacters(characterIds: List<String>) {
        val retained = characterIds.toSet()
        deleteSessions(room.dao.sessions().filter { it.characterId !in retained }.map { it.id })
    }

    suspend fun applyHistorySavePolicy(characterId: String) {
        if (characterId.isBlank() || historySaveModeProvider() != "recent10") return
        deleteSessions(room.dao.overflowSessionIds(characterId, RecentHistoryLimit))
    }

    private suspend fun deleteSessions(sessionIds: List<String>) {
        val ids = sessionIds.filter(String::isNotBlank).distinct()
        if (ids.isEmpty()) return
        // A pointer-cleanup failure leaves the source rows available for retry.
        onSessionsDeleted(ids)
        attachments.deleteConversations(ids) {
            ids.forEach { id ->
                room.ledger.deleteConversationInTransaction(id)
                room.dao.deleteSession(id)
            }
        }
    }

    private companion object {
        const val RecentHistoryLimit = 10
    }
}
