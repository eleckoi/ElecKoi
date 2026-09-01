package com.eleckoi.android.feature.characters.data

import com.eleckoi.android.foundation.storage.room.UserProfileEntity
import com.eleckoi.android.feature.characters.model.UserProfile

internal fun UserProfileEntity?.toUserProfile(): UserProfile {
    return UserProfile(
        userName = this?.userName?.trim() ?: DefaultUserName,
        userAvatar = this?.userAvatar.orEmpty(),
        userSquare = this?.userSquare.orEmpty(),
        userPortrait = this?.userPortrait.orEmpty(),
        userCover = this?.userCover.orEmpty(),
    )
}

internal fun UserProfile.toEntity(): UserProfileEntity {
    return UserProfileEntity(
        userName = userName.trim(),
        userAvatar = userAvatar,
        userSquare = userSquare,
        userPortrait = userPortrait,
        userCover = userCover,
    )
}

internal const val DefaultUserName = "用户"
