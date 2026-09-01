package com.eleckoi.android.foundation.storage.room

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase
import com.eleckoi.android.foundation.storage.room.agent.dao.AgentLedgerDao
import com.eleckoi.android.foundation.storage.room.agent.dao.GenerationAttemptDao
import com.eleckoi.android.foundation.storage.room.agent.entity.AgentBranchEntity
import com.eleckoi.android.foundation.storage.room.agent.entity.AgentBranchTurnEntity
import com.eleckoi.android.foundation.storage.room.agent.entity.AgentContentPartEntity
import com.eleckoi.android.foundation.storage.room.agent.entity.AgentConversationDisplayCacheEntity
import com.eleckoi.android.foundation.storage.room.agent.entity.AgentConversationEntity
import com.eleckoi.android.foundation.storage.room.agent.entity.AgentResponseEntity
import com.eleckoi.android.foundation.storage.room.agent.entity.AgentTurnEntity
import com.eleckoi.android.foundation.storage.room.agent.entity.GenerationAttemptEntity

/**
 * Current clean-install Room baseline.
 *
 * This development line does not upgrade an older on-device database in place. Users moving
 * between baselines export the portable backup package, uninstall the old app, and import it into
 * the new clean database.
 */
@Database(
    entities = [
        ChatSessionEntity::class,
        CharacterEntity::class,
        CharacterMetaEntity::class,
        UserProfileEntity::class,
        ModelConfigEntity::class,
        ModelConfigMetaEntity::class,
        VariableConfigEntity::class,
        AgentConversationEntity::class,
        AgentConversationDisplayCacheEntity::class,
        AgentBranchEntity::class,
        AgentTurnEntity::class,
        AgentResponseEntity::class,
        AgentBranchTurnEntity::class,
        AgentContentPartEntity::class,
        GenerationAttemptEntity::class,
        SettingLibraryEntity::class,
        SettingLibraryEntryEntity::class,
        SettingLibraryGroupEntity::class,
        SettingLibraryVersionEntity::class,
        SettingLibraryVersionEntryEntity::class,
        SettingLibraryVersionGroupEntity::class,
        ConversationSettingChangeEntity::class,
        RoleplayRichHeightEntity::class,
        StoryPresetStateEntity::class,
        StoryPresetLibraryGroupEntity::class,
        StoryPresetEntity::class,
        StoryPresetEntryEntity::class,
        StoryPresetGroupEntity::class,
        StoryPresetRuntimeEntryEntity::class,
        StoryPresetVersionEntity::class,
        StoryPresetVersionEntryEntity::class,
        StoryPresetVersionGroupEntity::class,
        StoryPresetVersionRuntimeEntryEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class ElecKoiDatabase : RoomDatabase() {
    abstract fun chatDao(): ChatDao
    abstract fun characterDao(): CharacterDao
    abstract fun userProfileDao(): UserProfileDao
    abstract fun modelConfigDao(): ModelConfigDao
    abstract fun variableConfigDao(): VariableConfigDao
    abstract fun agentLedgerDao(): AgentLedgerDao
    abstract fun generationAttemptDao(): GenerationAttemptDao
    abstract fun settingLibraryDao(): SettingLibraryDao
    abstract fun conversationSettingChangeDao(): ConversationSettingChangeDao
    abstract fun roleplayRichHeightDao(): RoleplayRichHeightDao
    abstract fun storyPresetDao(): StoryPresetDao

    companion object {
        @Volatile
        private var instance: ElecKoiDatabase? = null

        fun get(context: Context): ElecKoiDatabase = instance ?: synchronized(this) {
            instance ?: Room.databaseBuilder(
                context.applicationContext,
                ElecKoiDatabase::class.java,
                "eleckoi-dsh.db",
            )
                .addCallback(object : Callback() {
                    override fun onOpen(db: SupportSQLiteDatabase) {
                        db.query("PRAGMA secure_delete = ON").use { cursor -> cursor.moveToFirst() }
                    }
                })
                .build()
                .also { instance = it }
        }
    }
}
