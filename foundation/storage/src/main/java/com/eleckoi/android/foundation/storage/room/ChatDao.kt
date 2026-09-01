package com.eleckoi.android.foundation.storage.room

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Update
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

/** Conversation metadata only. Message bodies live exclusively in the normalized agent ledger. */
@Dao
interface ChatDao {
    @Query(
        """
        SELECT s.*, s.historySummary AS summary, s.historyMessageCount AS messageCount
        FROM chat_sessions AS s
        WHERE s.historyUserMessageCount > 0
        ORDER BY s.updatedAt DESC
        """,
    )
    fun chatListRows(): List<ChatListRoomRow>

    @Query(
        """
        SELECT s.*, s.historySummary AS summary, s.historyMessageCount AS messageCount
        FROM chat_sessions AS s
        WHERE s.historyUserMessageCount > 0
        ORDER BY s.updatedAt DESC
        """,
    )
    fun chatListRowsFlow(): Flow<List<ChatListRoomRow>>

    @Query("SELECT * FROM chat_sessions ORDER BY updatedAt DESC")
    fun sessions(): List<ChatSessionEntity>

    @Query("SELECT * FROM chat_sessions ORDER BY updatedAt DESC")
    fun sessionsFlow(): Flow<List<ChatSessionEntity>>

    @Query("SELECT * FROM chat_sessions WHERE characterId = :characterId ORDER BY updatedAt DESC")
    fun sessionsForCharacter(characterId: String): List<ChatSessionEntity>

    @Query(
        """
        SELECT * FROM chat_sessions
        WHERE characterId = :characterId
            AND characterMode = :characterMode
            AND historyUserMessageCount > 0
        ORDER BY updatedAt DESC
        LIMIT 1
        """,
    )
    fun latestSession(characterId: String, characterMode: String): ChatSessionEntity?

    @Query("SELECT * FROM chat_sessions WHERE id = :sessionId LIMIT 1")
    fun sessionById(sessionId: String): ChatSessionEntity?

    @Query("SELECT * FROM chat_sessions WHERE id = :sessionId LIMIT 1")
    fun sessionFlow(sessionId: String): Flow<ChatSessionEntity?>

    @Query("SELECT COUNT(*) FROM chat_sessions WHERE id = :sessionId")
    fun sessionCount(sessionId: String): Int

    @Upsert
    fun upsertSession(session: ChatSessionEntity)

    @Update
    fun updateSession(session: ChatSessionEntity)

    @Query("DELETE FROM chat_sessions WHERE id = :sessionId")
    fun deleteSession(sessionId: String)

    @Query(
        """
        DELETE FROM chat_sessions
        WHERE characterId = :characterId AND characterMode = :characterMode
            AND historyUserMessageCount = 0
        """,
    )
    fun deleteUnstartedSessions(characterId: String, characterMode: String)

    @Query("DELETE FROM chat_sessions WHERE characterId IN (:characterIds)")
    fun deleteSessionsForCharacters(characterIds: List<String>)

    @Query("DELETE FROM chat_sessions WHERE characterId NOT IN (:characterIds)")
    fun deleteSessionsExceptCharacters(characterIds: List<String>)

    @Query(
        """
        SELECT id FROM chat_sessions
        WHERE characterId = :characterId
        ORDER BY updatedAt DESC
        LIMIT -1 OFFSET :keepCount
        """,
    )
    fun overflowSessionIds(characterId: String, keepCount: Int): List<String>
}
