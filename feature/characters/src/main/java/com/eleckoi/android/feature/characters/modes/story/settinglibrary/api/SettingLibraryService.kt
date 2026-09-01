package com.eleckoi.android.feature.characters.modes.story.settinglibrary.api

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryConversation
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrarySource
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryVersion
import kotlinx.coroutines.flow.Flow

interface SettingLibraryService {
    fun settingLibraryFlow(characterId: String): Flow<SettingLibrary>
    fun saveSettingLibrary(characterId: String, library: SettingLibrary): SettingLibrary
    fun exportSettingLibrary(characterId: String): String
    fun importSettingLibrary(characterId: String, json: String): SettingLibrary
    fun conversationSettingLibraries(characterId: String): List<SettingLibraryConversation>
    fun saveConversationSettingVersion(characterId: String, sessionId: String, name: String): SettingLibrary
    fun updateConversationSettingEntry(
        characterId: String,
        sessionId: String,
        entryId: String,
        title: String,
        content: String,
    ): SettingLibrary
    fun replaceConversationSettingLibrary(
        characterId: String,
        sessionId: String,
        library: SettingLibrary,
    ): SettingLibrary
    fun deleteConversationSettingEntry(characterId: String, sessionId: String, entryId: String): SettingLibrary
    fun deleteConversationSettingGroup(characterId: String, sessionId: String, groupId: String): SettingLibrary
    fun deleteConversationSettings(characterId: String, sessionId: String)
    fun settingLibrarySources(excludeCharacterId: String): List<SettingLibrarySource>
    fun parseSettingLibraryFile(json: String): SettingLibraryVersion
}
