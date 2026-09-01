package com.eleckoi.android.foundation.storage.room

import androidx.room.Entity
import androidx.room.Index
import androidx.room.Embedded

@Entity(
    tableName = "chat_sessions",
    indices = [
        Index("characterId"),
        Index("updatedAt"),
    ],
    primaryKeys = ["id"],
)
data class ChatSessionEntity(
    val id: String,
    val workspaceId: String,
    val title: String,
    val characterId: String,
    val characterName: String,
    val characterAvatar: String,
    val characterMode: String,
    val permissionMode: String = "AskForApproval",
    val characterPersonaJson: String,
    val modelSettingsJson: String,
    val initialVariableStateJson: String,
    val variableStateJson: String,
    /** Counts and preview text derived from the normalized Room ledger. */
    val historySummary: String,
    val historyMessageCount: Int,
    val historyUserMessageCount: Int,
    val createdAt: String,
    val updatedAt: String,
)

data class ChatListRoomRow(
    @Embedded val session: ChatSessionEntity,
    val summary: String,
    val messageCount: Int,
)
