package com.eleckoi.android.foundation.storage.room

import androidx.room.Entity

@Entity(
    tableName = "characters",
    primaryKeys = ["id"],
)
data class CharacterEntity(
    val id: String,
    val name: String,
    val avatar: String,
    val squareImage: String = "",
    val coverImage: String,
    val groupName: String,
    val orderIndex: Int,
    val groupViewOrder: Int,
    val folder: String,
    val characterMode: String,
    val frontendBeautyEnabled: Boolean,
    val assistantName: String,
    val assistantAvatar: String,
    val assistantPrompt: String,
    val profileAge: String = "",
    val profileSex: String = "",
    val profileHeight: String = "",
    val profileBirthday: String = "",
    val profileLike: String = "",
    val imagePrompt: String = "",
    val opening: String,
    val showOpening: Boolean,
    val chatBackground: String,
    val chatBackgroundOpacity: Float,
    val chatBackgroundBlur: Float,
    val chatBackgroundScrim: Float,
)

@Entity(
    tableName = "character_meta",
    primaryKeys = ["id"],
)
data class CharacterMetaEntity(
    val id: String = "default",
    val activeCharacterId: String,
    val groupsJson: String,
    val listAllExpanded: Boolean,
    val expandedGroupNamesJson: String,
)
