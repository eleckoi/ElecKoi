package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary

internal fun SettingLibraryUiState.withConversationLibrary(
    sessionId: String,
    library: SettingLibrary,
): SettingLibraryUiState = copy(
    conversationLibraries = conversationLibraries.map { conversation ->
        if (conversation.sessionId == sessionId) conversation.copy(library = library) else conversation
    },
    mutatingConversationId = "",
    errorMessage = "",
)
