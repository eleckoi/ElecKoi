package com.eleckoi.android.foundation.storage.room

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface VariableConfigDao {
    @Query("SELECT * FROM variable_configs WHERE characterId = :characterId LIMIT 1")
    fun config(characterId: String): VariableConfigEntity?

    @Query("SELECT * FROM variable_configs WHERE characterId = :characterId LIMIT 1")
    fun configFlow(characterId: String): Flow<VariableConfigEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun upsert(config: VariableConfigEntity)

    @Query("DELETE FROM variable_configs WHERE characterId IN (:characterIds)")
    fun deleteForCharacters(characterIds: List<String>)

    @Query("DELETE FROM variable_configs WHERE characterId NOT IN (:characterIds)")
    fun deleteExceptCharacters(characterIds: List<String>)

    @Query("DELETE FROM variable_configs")
    fun deleteAll()
}
