package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryOpeningMessage

internal fun SettingLibraryEntry.primaryFirstOpeningMessages(): List<SettingLibraryOpeningMessage> {
    val primary = openingMessages.firstOrNull { it.id == defaultOpeningMessageId }
        ?: openingMessages.first()
    return buildList(openingMessages.size) {
        add(primary)
        addAll(openingMessages.filterNot { it.id == primary.id })
    }
}

internal fun String.duplicateOpeningTitle(): String {
    return if (isBlank()) "" else "$this 副本".take(40)
}

