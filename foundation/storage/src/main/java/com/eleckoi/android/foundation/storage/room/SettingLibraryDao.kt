package com.eleckoi.android.foundation.storage.room

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface SettingLibraryDao {
    @Transaction
    @Query("SELECT * FROM setting_libraries WHERE characterId = :characterId LIMIT 1")
    fun library(characterId: String): SettingLibraryRecord?

    @Transaction
    @Query("SELECT * FROM setting_libraries WHERE characterId = :characterId LIMIT 1")
    fun libraryFlow(characterId: String): Flow<SettingLibraryRecord?>

    @Query("SELECT * FROM setting_libraries WHERE characterId = :characterId LIMIT 1")
    fun metadata(characterId: String): SettingLibraryEntity?

    @Query("SELECT COUNT(*) FROM setting_library_entries WHERE characterId = :characterId")
    fun entryCount(characterId: String): Int

    @Query("SELECT COUNT(*) FROM setting_library_groups WHERE characterId = :characterId")
    fun groupCount(characterId: String): Int

    /** Row-bounded creator search. Callers request one extra row to derive hasMore. */
    @Query(
        """
        SELECT * FROM setting_library_entries
        WHERE characterId = :characterId
          AND (:query = '' OR payloadJson LIKE :query ESCAPE '\')
          AND (sortIndex > :afterSortIndex OR (sortIndex = :afterSortIndex AND entryId > :afterId))
        ORDER BY sortIndex ASC, entryId ASC
        LIMIT :limit
        """,
    )
    fun entryPage(
        characterId: String,
        query: String,
        afterSortIndex: Int,
        afterId: String,
        limit: Int,
    ): List<SettingLibraryEntryEntity>

    @Query(
        """
        SELECT * FROM setting_library_groups
        WHERE characterId = :characterId
          AND (:query = '' OR payloadJson LIKE :query ESCAPE '\')
          AND (sortIndex > :afterSortIndex OR (sortIndex = :afterSortIndex AND groupId > :afterId))
        ORDER BY sortIndex ASC, groupId ASC
        LIMIT :limit
        """,
    )
    fun groupPage(
        characterId: String,
        query: String,
        afterSortIndex: Int,
        afterId: String,
        limit: Int,
    ): List<SettingLibraryGroupEntity>

    @Query(
        "SELECT * FROM setting_library_entries WHERE characterId = :characterId AND entryId = :entryId LIMIT 1",
    )
    fun entry(characterId: String, entryId: String): SettingLibraryEntryEntity?

    @Transaction
    fun upsert(library: SettingLibraryRecord) {
        upsertMetadata(library.library)
        deleteEntryRows(library.library.characterId)
        deleteGroupRows(library.library.characterId)
        deleteVersionEntryRows(library.library.characterId)
        deleteVersionGroupRows(library.library.characterId)
        deleteVersionRows(library.library.characterId)
        insertEntryRows(library.entries)
        insertGroupRows(library.groups)
        insertVersionRows(library.versions)
        insertVersionEntryRows(library.versionEntries)
        insertVersionGroupRows(library.versionGroups)
    }

    @Upsert
    fun upsertMetadata(library: SettingLibraryEntity)

    @Insert
    fun insertEntryRows(entries: List<SettingLibraryEntryEntity>)

    @Insert
    fun insertGroupRows(groups: List<SettingLibraryGroupEntity>)

    @Insert
    fun insertVersionRows(versions: List<SettingLibraryVersionEntity>)

    @Insert
    fun insertVersionEntryRows(entries: List<SettingLibraryVersionEntryEntity>)

    @Insert
    fun insertVersionGroupRows(groups: List<SettingLibraryVersionGroupEntity>)

    @Query("DELETE FROM setting_library_entries WHERE characterId = :characterId")
    fun deleteEntryRows(characterId: String)

    @Query("DELETE FROM setting_library_groups WHERE characterId = :characterId")
    fun deleteGroupRows(characterId: String)

    @Query("DELETE FROM setting_library_versions WHERE characterId = :characterId")
    fun deleteVersionRows(characterId: String)

    @Query("DELETE FROM setting_library_version_entries WHERE characterId = :characterId")
    fun deleteVersionEntryRows(characterId: String)

    @Query("DELETE FROM setting_library_version_groups WHERE characterId = :characterId")
    fun deleteVersionGroupRows(characterId: String)

    @Query("DELETE FROM setting_libraries WHERE characterId IN (:characterIds)")
    fun deleteForCharacters(characterIds: List<String>)

    @Query("DELETE FROM setting_libraries WHERE characterId NOT IN (:characterIds)")
    fun deleteExceptCharacters(characterIds: List<String>)

    @Query("DELETE FROM setting_libraries")
    fun deleteAll()
}
