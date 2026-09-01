package com.eleckoi.android.feature.characters.modes.story.variables.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue

@Stable
internal class VariableTreeDragUiState {
    var forceCollapsedObjectIds by mutableStateOf<Set<String>>(emptySet())
        private set

    fun collapseDraggedObject(objectId: String) {
        forceCollapsedObjectIds = setOf(objectId)
    }

    fun clearDragCollapse() {
        forceCollapsedObjectIds = emptySet()
    }
}

@Composable
internal fun rememberVariableTreeDragUiState(): VariableTreeDragUiState {
    return remember { VariableTreeDragUiState() }
}
