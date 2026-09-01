package com.eleckoi.android.feature.chat.ui.variables

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.OpeningMessageId
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun VariableViewerPage(
    messages: List<ChatMessage>,
    initialStateJson: String,
    currentStateJson: String,
    historyLoading: Boolean,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
) {
    val timeline = remember(messages, initialStateJson, currentStateJson) {
        buildVariableViewerTimeline(
            messages = messages,
            initialStateJson = initialStateJson,
            currentStateJson = currentStateJson,
        )
    }
    var selectedSnapshotId by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedFloor = selectedSnapshotId?.let { id ->
        timeline.floors.firstOrNull { it.id == id }
    }

    BackHandler {
        if (selectedSnapshotId != null) selectedSnapshotId = null else onBack()
    }

    if (selectedFloor != null) {
        val floor = selectedFloor
        val isLatestFloor = floor.id == timeline.floors.lastOrNull()?.id
        VariableSnapshotDetail(
            title = floor.label,
            subtitle = floor.messagePreview,
            document = if (isLatestFloor) timeline.current else floor.state,
            changedPaths = floor.changedPaths,
            changesAvailable = floor.id != OpeningMessageId,
            appearance = appearance,
            onBack = { selectedSnapshotId = null },
        )
        return
    }

    VariableHistoryOverview(
        timeline = timeline,
        historyLoading = historyLoading,
        appearance = appearance,
        onBack = onBack,
        onOpenFloor = { selectedSnapshotId = it.id },
    )
}
