package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

@Stable
internal class SettingTreeDragUiState {
    var forceCollapsedGroupIds by mutableStateOf<Set<String>>(emptySet())
        private set

    fun collapseDraggedFolder(groupId: String) {
        forceCollapsedGroupIds = setOf(groupId)
    }

    fun clearDragCollapse() {
        forceCollapsedGroupIds = emptySet()
    }
}

@Composable
internal fun rememberSettingTreeDragUiState(): SettingTreeDragUiState {
    return remember { SettingTreeDragUiState() }
}
