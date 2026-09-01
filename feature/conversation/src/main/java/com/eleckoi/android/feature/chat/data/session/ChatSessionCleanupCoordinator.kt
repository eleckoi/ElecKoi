package com.eleckoi.android.feature.chat.data.session

import com.eleckoi.android.engine.generation.image.ReplyImageGenerator
import com.eleckoi.android.feature.chat.data.ChatInputImageStore
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.foundation.storage.room.ElecKoiDatabase

/** Keeps Room rows, generated images, and copied input images in one deletion lifecycle. */
internal class ChatSessionCleanupCoordinator(
    private val database: ElecKoiDatabase,
    private val room: ChatSessionRoomStorage,
    private val historySaveModeProvider: suspend () -> String,
    private val replyImageGenerator: ReplyImageGenerator?,
    private val inputImageStore: ChatInputImageStore?,
) {
    suspend fun delete(sessionId: String) {
        val discardedInputImages = inputImagesForSession(sessionId)
        database.runInTransaction {
            room.ledger.deleteConversationInTransaction(sessionId)
            room.dao.deleteSession(sessionId)
        }
        replyImageGenerator?.deleteSessionImages(sessionId)
        discardedInputImages.forEach { inputImageStore?.delete(it) }
    }

    suspend fun deleteForCharacters(characterIds: List<String>): List<String> {
        val ids = characterIds.filter(String::isNotBlank).distinct()
        if (ids.isEmpty()) return emptyList()
        val deletedSessions = room.dao.sessions().filter { it.characterId in ids }
        val discardedInputImages = deletedSessions.flatMap { inputImagesForSession(it.id) }
        database.runInTransaction {
            deletedSessions.forEach { room.ledger.deleteConversationInTransaction(it.id) }
            room.dao.deleteSessionsForCharacters(ids)
        }
        deletedSessions.forEach { replyImageGenerator?.deleteSessionImages(it.id) }
        discardedInputImages.forEach { inputImageStore?.delete(it) }
        return deletedSessions.map { it.id }
    }

    suspend fun deleteExceptCharacters(characterIds: List<String>) {
        val ids = characterIds.filter(String::isNotBlank).distinct()
        val deletedSessions = if (ids.isEmpty()) {
            room.dao.sessions()
        } else {
            room.dao.sessions().filter { it.characterId !in ids }
        }
        val discardedInputImages = deletedSessions.flatMap { inputImagesForSession(it.id) }
        database.runInTransaction {
            deletedSessions.forEach { room.ledger.deleteConversationInTransaction(it.id) }
            if (ids.isEmpty()) {
                deletedSessions.forEach { room.dao.deleteSession(it.id) }
            } else {
                room.dao.deleteSessionsExceptCharacters(ids)
            }
        }
        deletedSessions.forEach { replyImageGenerator?.deleteSessionImages(it.id) }
        discardedInputImages.forEach { inputImageStore?.delete(it) }
    }

    suspend fun applyHistorySavePolicy(characterId: String) {
        if (characterId.isBlank() || historySaveModeProvider() != "recent10") return
        room.dao.overflowSessionIds(characterId, RecentHistoryLimit).forEach { sessionId ->
            delete(sessionId)
        }
    }

    private fun inputImagesForSession(sessionId: String) = runCatching {
        room.activeMessages(sessionId).flatMap(ChatMessage::inputImageAttachments)
    }.getOrDefault(emptyList())

    private companion object {
        const val RecentHistoryLimit = 10
    }
}
