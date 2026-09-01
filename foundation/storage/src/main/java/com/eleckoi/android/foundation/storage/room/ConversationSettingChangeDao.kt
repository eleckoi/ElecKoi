package com.eleckoi.android.foundation.storage.room

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert

@Dao
interface ConversationSettingChangeDao {
    @Query(
        """
        SELECT * FROM conversation_setting_changes
        WHERE sessionId = :sessionId
        ORDER BY updatedAt, targetType, targetId
        """,
    )
    fun changes(sessionId: String): List<ConversationSettingChangeEntity>

    @Query(
        """
        SELECT * FROM conversation_setting_changes
        WHERE sessionId IN (
            SELECT id FROM chat_sessions WHERE characterId = :characterId
        )
        ORDER BY updatedAt DESC, sessionId, targetType, targetId
        """,
    )
    fun changesForCharacter(characterId: String): List<ConversationSettingChangeEntity>

    @Upsert
    fun upsertChanges(changes: List<ConversationSettingChangeEntity>)

    @Query("DELETE FROM conversation_setting_changes WHERE sessionId = :sessionId")
    fun deleteForSession(sessionId: String)
}
