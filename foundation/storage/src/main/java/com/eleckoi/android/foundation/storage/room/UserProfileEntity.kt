package com.eleckoi.android.foundation.storage.room

import androidx.room.Entity

@Entity(
    tableName = "user_profile",
    primaryKeys = ["id"],
)
data class UserProfileEntity(
    val id: String = "default",
    val userName: String,
    val userAvatar: String,
    val userSquare: String = "",
    val userPortrait: String = "",
    val userCover: String,
)
