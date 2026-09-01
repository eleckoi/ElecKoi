package com.eleckoi.android.foundation.storage.room

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface CharacterDao {
    @Query("SELECT * FROM characters ORDER BY orderIndex ASC")
    fun characters(): List<CharacterEntity>

    @Query("SELECT * FROM characters ORDER BY orderIndex ASC")
    fun charactersFlow(): Flow<List<CharacterEntity>>

    @Query("SELECT * FROM characters WHERE id = :characterId LIMIT 1")
    fun characterById(characterId: String): CharacterEntity?

    /** Keyset page for Agent directory searches; never materializes the full character table. */
    @Query(
        """
        SELECT * FROM characters
        WHERE (:query = '' OR name LIKE :query ESCAPE '\' OR groupName LIKE :query ESCAPE '\')
          AND (orderIndex > :afterOrder OR (orderIndex = :afterOrder AND id > :afterId))
        ORDER BY orderIndex ASC, id ASC
        LIMIT :limit
        """,
    )
    fun characterPage(
        query: String,
        afterOrder: Int,
        afterId: String,
        limit: Int,
    ): List<CharacterEntity>

    @Query("SELECT * FROM character_meta WHERE id = 'default' LIMIT 1")
    fun meta(): CharacterMetaEntity?

    @Query("SELECT * FROM character_meta WHERE id = 'default' LIMIT 1")
    fun metaFlow(): Flow<CharacterMetaEntity?>

    // REPLACE performs DELETE + INSERT in SQLite and would trigger ON DELETE CASCADE for every
    // character-owned Room table (setting library, variables, and future child tables).
    @Upsert
    fun upsertCharacters(characters: List<CharacterEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun upsertMeta(meta: CharacterMetaEntity)

    @Query("DELETE FROM characters WHERE id NOT IN (:ids)")
    fun deleteCharactersExcept(ids: List<String>)

    @Query("DELETE FROM characters")
    fun deleteAllCharacters()

    @Query("DELETE FROM character_meta")
    fun deleteMeta()
}
