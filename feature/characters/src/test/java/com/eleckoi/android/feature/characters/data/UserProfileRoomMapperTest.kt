package com.eleckoi.android.feature.characters.data

import com.eleckoi.android.feature.characters.model.UserProfile
import com.eleckoi.android.foundation.storage.room.UserProfileEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class UserProfileRoomMapperTest {
    @Test
    fun missingProfileUsesTheInitialDefaultName() {
        assertEquals(DefaultUserName, null.toUserProfile().userName)
    }

    @Test
    fun savedBlankNameRemainsBlank() {
        val entity = UserProfileEntity(
            userName = "",
            userAvatar = "",
            userCover = "",
        )

        assertEquals("", entity.toUserProfile().userName)
        assertEquals("", UserProfile(userName = "").toEntity().userName)
    }
}
