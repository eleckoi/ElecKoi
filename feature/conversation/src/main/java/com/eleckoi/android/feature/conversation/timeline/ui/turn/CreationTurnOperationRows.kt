package com.eleckoi.android.feature.conversation.timeline.ui.turn

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.TextUnit
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.conversation.timeline.components.TimelineStatusIndicator
import com.eleckoi.android.feature.conversation.timeline.components.TimelineStatusLabel
import com.eleckoi.android.feature.conversation.timeline.components.TimelineStatusPace
import com.eleckoi.android.feature.conversation.timeline.components.TimelineStatusSnapshot
import com.eleckoi.android.feature.conversation.timeline.components.initialThinkingStatus
import com.eleckoi.android.feature.conversation.timeline.components.liveTimelineStatus
import com.eleckoi.android.feature.conversation.timeline.components.rememberSettledTimelineStatus
import com.eleckoi.android.feature.conversation.timeline.components.timelineStatusUpdate
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem

@Composable
internal fun RunningOperationRow(
    item: CreationTimelineItem?,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    OperationStatusRow(
        status = item?.let(::liveTimelineStatus) ?: initialThinkingStatus(),
        pace = TimelineStatusPace.Live,
        appearance = appearance,
        fontSize = 13.sp,
        contentDescription = "查看实时详情",
        onClick = onClick,
    )
}

@Composable
internal fun OperationSummaryRow(
    items: List<CreationTimelineItem>,
    turnRunning: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    val update = timelineStatusUpdate(items = items, turnRunning = turnRunning)
    OperationStatusRow(
        status = update.status,
        pace = update.pace,
        appearance = appearance,
        fontSize = 12.5.sp,
        contentDescription = "查看详情",
        onClick = onClick,
    )
}

@Composable
private fun OperationStatusRow(
    status: TimelineStatusSnapshot,
    pace: TimelineStatusPace,
    appearance: AppearanceTheme,
    fontSize: TextUnit,
    contentDescription: String,
    onClick: () -> Unit,
) {
    val settled = rememberSettledTimelineStatus(status, pace)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(OperationStatusItemSpacing),
    ) {
        TimelineStatusIndicator(
            status = settled,
            appearance = appearance,
            iconSize = OperationStatusIconSize,
            modifier = Modifier.size(
                width = OperationStatusLeadingWidth,
                height = OperationStatusRowHeight,
            ),
        )
        TimelineStatusLabel(
            status = settled,
            color = appearance.mobileMuted,
            fontSize = fontSize,
            modifier = Modifier
                .weight(1f)
                .height(OperationStatusRowHeight),
        )
        Icon(
            imageVector = Icons.Rounded.ExpandMore,
            contentDescription = contentDescription,
            modifier = Modifier
                .size(16.dp)
                .graphicsLayer { rotationZ = -90f },
            tint = appearance.mobileMuted.copy(alpha = 0.7f),
        )
    }
}

private val OperationStatusLeadingWidth = 33.dp
private val OperationStatusRowHeight = 25.dp
private val OperationStatusIconSize = 17.dp
private val OperationStatusItemSpacing = 4.dp
