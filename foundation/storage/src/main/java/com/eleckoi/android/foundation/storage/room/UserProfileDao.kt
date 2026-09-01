package com.eleckoi.android.foundation.storage.room

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface UserProfileDao {
    @Query("SELECT * FROM user_profile WHERE id = 'default' LIMIT 1")
    fun profile(): UserProfileEntity?

    @Query("SELECT * FROM user_profile WHERE id = 'default' LIMIT 1")
    fun profileFlow(): Flow<UserProfileEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    fun upsert(profile: UserProfileEntity)
}
