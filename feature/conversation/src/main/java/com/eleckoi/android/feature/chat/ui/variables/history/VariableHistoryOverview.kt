package com.eleckoi.android.feature.chat.ui.variables

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun VariableHistoryOverview(
    timeline: VariableViewerTimeline,
    historyLoading: Boolean,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onOpenFloor: (VariableFloorSnapshot) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(appearance.mobileBg),
    ) {
        VariableViewerHeader(
            title = "变量查看器",
            appearance = appearance,
            onBack = onBack,
        )
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = VariableViewerHorizontalPadding, vertical = 10.dp),
        ) {
            itemsIndexed(
                items = timeline.floors.asReversed(),
                key = { _, floor -> floor.id },
            ) { index, floor ->
                VariableFloorTimelineEntry(
                    floor = floor,
                    isFirst = index == 0,
                    isLast = index == timeline.floors.lastIndex,
                    isLatest = index == 0,
                    appearance = appearance,
                    onOpen = { onOpenFloor(floor) },
                )
            }
            if (timeline.floors.isEmpty()) {
                item(key = "empty_floors") {
                    VariableEmptyMessage(
                        text = if (historyLoading) "正在整理楼层变量" else "还没有可查看的助手楼层",
                        appearance = appearance,
                        modifier = Modifier.padding(vertical = 24.dp),
                    )
                }
            }
            item(key = "navigation_inset") {
                Spacer(modifier = Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars))
            }
        }
    }
}

@Composable
private fun VariableFloorTimelineEntry(
    floor: VariableFloorSnapshot,
    isFirst: Boolean,
    isLast: Boolean,
    isLatest: Boolean,
    appearance: AppearanceTheme,
    onOpen: () -> Unit,
) {
    val railColor = appearance.mobileMuted.copy(alpha = 0.52f)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .drawBehind {
                val x = 6.dp.toPx()
                val centerY = size.height / 2f
                val stroke = 1.dp.toPx()
                if (!isFirst) drawLine(railColor, Offset(x, 0f), Offset(x, centerY), stroke)
                if (!isLast) drawLine(railColor, Offset(x, centerY), Offset(x, size.height), stroke)
            }
            .semantics {
                contentDescription = if (isLatest) {
                    "查看 ${floor.label} 的最新变量"
                } else {
                    "查看 ${floor.label} 的变量"
                }
                role = Role.Button
            }
            .noRippleClickable(onClick = onOpen)
            .padding(vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(12.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(appearance.mobileBlue),
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = floor.label,
                    color = appearance.mobileText,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                if (isLatest) LatestVariableLabel(appearance)
            }
            if (floor.messagePreview.isNotBlank()) {
                Text(
                    text = floor.messagePreview,
                    color = appearance.mobileMuted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 3.dp, end = 12.dp),
                )
            }
        }
        VariableViewerChevron(
            expanded = false,
            color = appearance.mobileMuted,
            iconSize = 14.dp,
        )
    }
}

@Composable
private fun LatestVariableLabel(appearance: AppearanceTheme) {
    Text(
        text = "最新变量",
        color = appearance.mobileBlue,
        fontSize = 10.5.sp,
        lineHeight = 15.sp,
        modifier = Modifier
            .padding(start = 10.dp)
            .clip(RoundedCornerShape(4.dp))
            .border(1.dp, appearance.mobileBlue.copy(alpha = 0.78f), RoundedCornerShape(4.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}
