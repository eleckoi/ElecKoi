package com.eleckoi.android.feature.conversation.timeline

import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem

enum class CreationLiveDetailSource {
    Processing,
    ChronologicalTail,
}

data class CreationDetailPayload(
    val title: String,
    val items: List<CreationTimelineItem>,
    val diff: String = "",
    val sourceTurnId: String? = null,
    val activePlanUpdateId: String? = null,
    val liveTurnId: String? = null,
    val liveLatestItemOnly: Boolean = false,
    val liveCurrentOperationGroup: Boolean = false,
    val liveOperationGroupAnchorId: String? = null,
    val liveSource: CreationLiveDetailSource = CreationLiveDetailSource.Processing,
)

fun CreationDetailPayload.initialSelectedItemPath(): List<String> = items
    .singleOrNull()
    ?.takeIf { item -> item.workItemType == AgentWorkItemType.ContextCompaction }
    ?.let { item -> listOf(item.id) }
    .orEmpty()

fun List<CreationTimelineItem>.findTimelineItem(path: List<String>): CreationTimelineItem? {
    if (path.isEmpty()) return null
    var items = this
    var selected: CreationTimelineItem? = null
    path.forEach { id ->
        selected = items.firstOrNull { item -> item.id == id } ?: return null
        items = requireNotNull(selected).childTimeline
    }
    return selected
}
