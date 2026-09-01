package com.eleckoi.android.feature.conversation.timeline.overview

import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.components.*

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircleOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun CreationOperationOverview(
    items: List<CreationTimelineItem>,
    turnDiff: String,
    isLive: Boolean,
    includeAssistantMessages: Boolean = true,
    appearance: AppearanceTheme,
    onOpenItem: (CreationTimelineItem) -> Unit,
) {
    val visibleItems = creationOperationOverviewItems(
        items = items,
        includeAssistantMessages = includeAssistantMessages,
    )
    if (visibleItems.isEmpty()) {
        Text(
            text = if (isLive) {
                "正在等待模型返回可展示的实时详情"
            } else {
                "这段处理过程没有更多详情"
            },
            color = appearance.mobileMuted,
            fontSize = 13.sp,
        )
        return
    }
    Column(modifier = Modifier.fillMaxWidth()) {
        visibleItems.forEachIndexed { index, item ->
            if (item.workItemType == AgentWorkItemType.Request) {
                CreationRequestBoundary(
                    item = item,
                    appearance = appearance,
                )
                return@forEachIndexed
            }
            val hasBodyRail = item.workItemType == AgentWorkItemType.Reasoning ||
                item.workItemType == AgentWorkItemType.FileChange
            CreationDetailTimelineNode(
                showConnector = index < visibleItems.lastIndex &&
                    visibleItems[index + 1].workItemType != AgentWorkItemType.Request,
                showBodyRail = hasBodyRail,
                appearance = appearance,
            ) {
                when {
                    item.kind == CreationTimelineKind.Assistant -> ChildAssistantOverviewItem(
                        item = item,
                        appearance = appearance,
                    )
                    item.isFinalProtocolDetection() -> FinalProtocolDetectionOverviewItem(
                        item = item,
                        appearance = appearance,
                    )
                    item.workItemType == AgentWorkItemType.Reasoning -> ReasoningOverviewItem(
                        item = item,
                        appearance = appearance,
                    )
                    item.isReadOperation() -> ReadOperationOverviewItem(
                        item = item,
                        appearance = appearance,
                        onClick = { onOpenItem(item) },
                    )
                    item.workItemType == AgentWorkItemType.FileChange -> FileChangeOverviewItem(
                        item = item.copy(diff = preferredCreationDiff(item.diff, turnDiff)),
                        appearance = appearance,
                        onClick = { onOpenItem(item) },
                    )
                    else -> CompactOperationOverviewItem(
                        item = item,
                        appearance = appearance,
                        onClick = { onOpenItem(item) },
                    )
                }
            }
        }
    }
}

fun creationOperationOverviewItems(
    items: List<CreationTimelineItem>,
    includeAssistantMessages: Boolean,
): List<CreationTimelineItem> = items.filter { item ->
    when {
        item.workItemType == AgentWorkItemType.Reasoning ->
            item.detail.hasMeaningfulProcessDetail() || item.hasReasoningPhaseText()
        item.kind == CreationTimelineKind.Assistant ->
            includeAssistantMessages && item.text.isNotBlank()
        item.kind == CreationTimelineKind.Tool -> true
        else -> false
    }
}

@Composable
private fun FinalProtocolDetectionOverviewItem(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Icon(
            imageVector = Icons.Rounded.CheckCircleOutline,
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = appearance.mobileMuted,
        )
        Text(
            text = item.text,
            color = appearance.mobileText,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun CreationDetailTimelineNode(
    showConnector: Boolean,
    showBodyRail: Boolean,
    appearance: AppearanceTheme,
    content: @Composable () -> Unit,
) {
    val connectorColor = appearance.mobileMuted.copy(alpha = 0.18f)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .drawWithContent {
                drawContent()
                val iconCenterX = 9.dp.toPx()
                val iconBottomY = 22.dp.toPx()
                val iconGap = 8.dp.toPx()
                val strokeWidth = 1.dp.toPx()

                // The previous node ends its rail at this node's boundary. Material vectors
                // already leave transparent space above their visible silhouette; match that
                // generous Trae-style breathing room below instead of pulling the rail tight.
                if (showConnector || showBodyRail) {
                    val endY = if (showConnector) size.height else size.height - 4.dp.toPx()
                    val outgoingStartY = iconBottomY + iconGap
                    if (endY > outgoingStartY) {
                        drawLine(
                            color = connectorColor,
                            start = Offset(iconCenterX, outgoingStartY),
                            end = Offset(iconCenterX, endY),
                            strokeWidth = strokeWidth,
                        )
                    }
                }
            },
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            content()
            if (showConnector) {
                Spacer(modifier = Modifier.height(17.dp))
            }
        }
    }
}
