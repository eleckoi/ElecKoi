package com.eleckoi.android.foundation.storage.room

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface StoryPresetDao {
    @Query("SELECT * FROM story_preset_state WHERE singletonId = 0 LIMIT 1")
    fun stateFlow(): Flow<StoryPresetStateEntity?>

    @Query("SELECT * FROM story_preset_library_groups ORDER BY sortIndex, name COLLATE NOCASE")
    fun libraryGroupsFlow(): Flow<List<StoryPresetLibraryGroupEntity>>

    @Query(
        """
        SELECT
            preset.id,
            preset.name,
            preset.modelFamily,
            preset.modelTagsJson,
            preset.libraryGroupId,
            preset.activeVersionId,
            preset.authorName,
            preset.authorAvatarPath,
            preset.authorTagsJson,
            preset.description,
            preset.timelineJson,
            COALESCE((
                SELECT version.versionNumber
                FROM story_preset_versions AS version
                WHERE version.presetId = preset.id AND version.versionId = preset.activeVersionId
                LIMIT 1
            ), 1) AS activeVersionNumber,
            preset.sortIndex,
            (SELECT COUNT(*) FROM story_preset_entries AS entry WHERE entry.presetId = preset.id) AS entryCount
        FROM story_presets AS preset
        ORDER BY preset.sortIndex, preset.name COLLATE NOCASE
        """,
    )
    fun summariesFlow(): Flow<List<StoryPresetSummaryRecord>>

    @Transaction
    @Query("SELECT * FROM story_presets WHERE id = :presetId LIMIT 1")
    suspend fun preset(presetId: String): StoryPresetRecord?

    @Query(
        """
        SELECT
            version.versionId AS id,
            version.versionNumber AS number,
            version.name,
            version.createdAtEpochMs,
            (SELECT COUNT(*) FROM story_preset_version_entries AS entry
                WHERE entry.presetId = version.presetId AND entry.versionId = version.versionId) AS entryCount
        FROM story_preset_versions AS version
        WHERE version.presetId = :presetId
        ORDER BY version.versionNumber DESC
        """,
    )
    suspend fun versionSummaries(presetId: String): List<StoryPresetVersionSummaryRecord>

    @Transaction
    @Query("SELECT * FROM story_preset_versions WHERE presetId = :presetId AND versionId = :versionId LIMIT 1")
    suspend fun version(presetId: String, versionId: String): StoryPresetVersionRecord?

    @Transaction
    @Query("SELECT * FROM story_preset_versions WHERE presetId = :presetId ORDER BY versionNumber")
    suspend fun versions(presetId: String): List<StoryPresetVersionRecord>

    @Query("SELECT * FROM story_preset_state WHERE singletonId = 0 LIMIT 1")
    suspend fun state(): StoryPresetStateEntity?

    @Query(
        """
        SELECT preset.regexRulesJson
        FROM story_presets AS preset
        INNER JOIN story_preset_state AS state ON state.singletonId = 0
        WHERE preset.id = state.activePresetId
        LIMIT 1
        """,
    )
    fun activePresetRegexRulesJson(): String?

    @Query("SELECT COUNT(*) FROM story_presets")
    suspend fun presetCount(): Int

    @Query("SELECT COALESCE(MAX(sortIndex), -1) + 1 FROM story_presets")
    suspend fun nextSortIndex(): Int

    @Query("SELECT name FROM story_presets")
    suspend fun presetNames(): List<String>

    @Query("SELECT name FROM story_presets WHERE id != :presetId")
    suspend fun otherPresetNames(presetId: String): List<String>

    @Query("SELECT name FROM story_preset_library_groups")
    suspend fun libraryGroupNames(): List<String>

    @Query("SELECT * FROM story_preset_library_groups ORDER BY sortIndex, name COLLATE NOCASE")
    suspend fun libraryGroups(): List<StoryPresetLibraryGroupEntity>

    @Query("SELECT EXISTS(SELECT 1 FROM story_presets WHERE id = :presetId)")
    suspend fun presetExists(presetId: String): Boolean

    @Query("SELECT id FROM story_presets ORDER BY sortIndex, name COLLATE NOCASE LIMIT 1")
    suspend fun firstPresetId(): String?

    @Query("SELECT id FROM story_presets ORDER BY sortIndex, name COLLATE NOCASE")
    suspend fun presetIds(): List<String>

    @Query("SELECT COALESCE(MAX(sortIndex), -1) + 1 FROM story_preset_library_groups")
    suspend fun nextLibraryGroupSortIndex(): Int

    @Query("SELECT COALESCE(MAX(versionNumber), 0) + 1 FROM story_preset_versions WHERE presetId = :presetId")
    suspend fun nextVersionNumber(presetId: String): Int

    @Query("SELECT COUNT(*) FROM story_preset_versions WHERE presetId = :presetId")
    suspend fun versionCount(presetId: String): Int

    @Query("SELECT versionNumber FROM story_preset_versions WHERE presetId = :presetId AND versionId = :versionId LIMIT 1")
    suspend fun versionNumber(presetId: String, versionId: String): Int?

    @Transaction
    suspend fun replace(record: StoryPresetRecord) {
        upsertPreset(record.preset)
        deleteEntryRows(record.preset.id)
        deleteGroupRows(record.preset.id)
        deleteRuntimeEntryRows(record.preset.id)
        insertEntryRows(record.entries)
        insertGroupRows(record.groups)
        insertRuntimeEntryRows(record.runtimeEntries)
    }

    @Transaction
    suspend fun replaceVersion(record: StoryPresetVersionRecord) {
        upsertVersion(record.version)
        deleteVersionEntryRows(record.version.presetId, record.version.versionId)
        deleteVersionGroupRows(record.version.presetId, record.version.versionId)
        deleteVersionRuntimeEntryRows(record.version.presetId, record.version.versionId)
        insertVersionEntryRows(record.entries)
        insertVersionGroupRows(record.groups)
        insertVersionRuntimeEntryRows(record.runtimeEntries)
    }

    @Upsert
    suspend fun upsertState(state: StoryPresetStateEntity)

    @Upsert
    suspend fun upsertPreset(preset: StoryPresetEntity)

    @Upsert
    suspend fun upsertLibraryGroup(group: StoryPresetLibraryGroupEntity)

    @Upsert
    suspend fun upsertVersion(version: StoryPresetVersionEntity)

    @Insert
    suspend fun insertEntryRows(entries: List<StoryPresetEntryEntity>)

    @Insert
    suspend fun insertGroupRows(groups: List<StoryPresetGroupEntity>)

    @Insert
    suspend fun insertRuntimeEntryRows(entries: List<StoryPresetRuntimeEntryEntity>)

    @Insert
    suspend fun insertVersionEntryRows(entries: List<StoryPresetVersionEntryEntity>)

    @Insert
    suspend fun insertVersionGroupRows(groups: List<StoryPresetVersionGroupEntity>)

    @Insert
    suspend fun insertVersionRuntimeEntryRows(entries: List<StoryPresetVersionRuntimeEntryEntity>)

    @Query("DELETE FROM story_preset_entries WHERE presetId = :presetId")
    suspend fun deleteEntryRows(presetId: String)

    @Query("DELETE FROM story_preset_groups WHERE presetId = :presetId")
    suspend fun deleteGroupRows(presetId: String)

    @Query("DELETE FROM story_preset_runtime_entries WHERE presetId = :presetId")
    suspend fun deleteRuntimeEntryRows(presetId: String)

    @Query("DELETE FROM story_preset_version_entries WHERE presetId = :presetId AND versionId = :versionId")
    suspend fun deleteVersionEntryRows(presetId: String, versionId: String)

    @Query("DELETE FROM story_preset_version_groups WHERE presetId = :presetId AND versionId = :versionId")
    suspend fun deleteVersionGroupRows(presetId: String, versionId: String)

    @Query("DELETE FROM story_preset_version_runtime_entries WHERE presetId = :presetId AND versionId = :versionId")
    suspend fun deleteVersionRuntimeEntryRows(presetId: String, versionId: String)

    @Query("DELETE FROM story_preset_versions WHERE presetId = :presetId AND versionId = :versionId")
    suspend fun deleteVersion(presetId: String, versionId: String)

    @Query("UPDATE story_presets SET libraryGroupId = :libraryGroupId WHERE id = :presetId")
    suspend fun movePreset(presetId: String, libraryGroupId: String)

    @Query("UPDATE story_preset_library_groups SET name = :name WHERE id = :groupId")
    suspend fun renameLibraryGroup(groupId: String, name: String)

    @Query(
        """
        UPDATE story_presets
        SET authorName = :authorName,
            authorTagsJson = :authorTagsJson,
            description = :description,
            timelineJson = :timelineJson
        WHERE id = :presetId
        """,
    )
    suspend fun updatePresetProfile(
        presetId: String,
        authorName: String,
        authorTagsJson: String,
        description: String,
        timelineJson: String,
    )

    @Query("UPDATE story_presets SET authorAvatarPath = :path WHERE id = :presetId")
    suspend fun updatePresetAuthorAvatar(presetId: String, path: String)

    @Query(
        "UPDATE story_presets SET modelFamily = :modelFamily, modelTagsJson = :modelTagsJson WHERE id = :presetId",
    )
    suspend fun updatePresetModelTags(
        presetId: String,
        modelFamily: String,
        modelTagsJson: String,
    )

    @Query("UPDATE story_presets SET name = :name WHERE id = :presetId")
    suspend fun renamePresetRow(presetId: String, name: String)

    @Query(
        """
        UPDATE story_preset_versions
        SET name = :name
        WHERE presetId = :presetId
            AND versionId = (SELECT activeVersionId FROM story_presets WHERE id = :presetId LIMIT 1)
        """,
    )
    suspend fun renameActiveVersionRow(presetId: String, name: String)

    @Transaction
    suspend fun renamePreset(presetId: String, name: String) {
        renamePresetRow(presetId, name)
        renameActiveVersionRow(presetId, name)
    }

    @Query("UPDATE story_presets SET activeVersionId = :versionId WHERE id = :presetId")
    suspend fun setActiveVersion(presetId: String, versionId: String)

    @Query(
        """
        UPDATE story_presets
        SET regexRulesJson = :regexRulesJson
        WHERE id = (SELECT activePresetId FROM story_preset_state WHERE singletonId = 0 LIMIT 1)
        """,
    )
    fun updateActivePresetRegexRules(regexRulesJson: String)

    @Query(
        """
        UPDATE story_preset_versions
        SET regexRulesJson = :regexRulesJson
        WHERE presetId = (SELECT activePresetId FROM story_preset_state WHERE singletonId = 0 LIMIT 1)
          AND versionId = (
              SELECT activeVersionId
              FROM story_presets
              WHERE id = (SELECT activePresetId FROM story_preset_state WHERE singletonId = 0 LIMIT 1)
              LIMIT 1
          )
        """,
    )
    fun updateActivePresetVersionRegexRules(regexRulesJson: String)

    @Query("UPDATE story_presets SET libraryGroupId = :fallbackGroupId WHERE libraryGroupId = :deletedGroupId")
    suspend fun movePresetsFromDeletedGroup(deletedGroupId: String, fallbackGroupId: String)

    @Query("DELETE FROM story_preset_library_groups WHERE id = :groupId")
    suspend fun deleteLibraryGroup(groupId: String)

    @Query("DELETE FROM story_presets WHERE id = :presetId")
    suspend fun deletePreset(presetId: String)

}
