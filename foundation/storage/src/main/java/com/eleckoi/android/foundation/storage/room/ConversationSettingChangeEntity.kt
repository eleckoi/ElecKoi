package com.eleckoi.android.foundation.storage.room

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(
    tableName = "conversation_setting_changes",
    primaryKeys = ["sessionId", "targetType", "targetId"],
    foreignKeys = [
        ForeignKey(
            entity = ChatSessionEntity::class,
            parentColumns = ["id"],
            childColumns = ["sessionId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("sessionId")],
)
data class ConversationSettingChangeEntity(
    val sessionId: String,
    val targetType: String,
    val targetId: String,
    val operation: String,
    /** Full entry/group JSON for upserts; empty for deletion tombstones. */
    val payloadJson: String,
    val updatedAt: String,
)
