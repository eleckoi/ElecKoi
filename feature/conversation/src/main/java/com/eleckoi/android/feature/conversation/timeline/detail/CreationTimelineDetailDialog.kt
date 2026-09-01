package com.eleckoi.android.feature.conversation.timeline.detail

import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.components.*
import com.eleckoi.android.feature.conversation.timeline.overview.CreationOperationOverview

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun CreationOperationDetailDialog(
    payload: CreationDetailPayload,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
) {
    var selectedItemPath by remember(payload.title, payload.liveTurnId) {
        mutableStateOf(payload.initialSelectedItemPath())
    }
    val selectedItem = payload.items.findTimelineItem(selectedItemPath)?.let { item ->
        if (item.workItemType == AgentWorkItemType.FileChange) {
            item.copy(diff = preferredCreationDiff(item.diff, payload.diff))
        } else {
            item
        }
    }
    BackHandler(enabled = selectedItem != null) { selectedItemPath = selectedItemPath.dropLast(1) }
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        SelectionContainer {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.BottomCenter,
            ) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .fillMaxHeight(0.84f)
                        .navigationBarsPadding(),
                    shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                    color = appearance.mobileSurface,
                    shadowElevation = 14.dp,
                ) {
                    Column {
                    Box(
                        modifier = Modifier
                            .padding(top = 9.dp)
                            .width(42.dp)
                            .height(4.dp)
                            .clip(RoundedCornerShape(2.dp))
                            .background(appearance.mobileMuted.copy(alpha = 0.32f))
                            .align(Alignment.CenterHorizontally),
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(58.dp)
                            .padding(horizontal = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "详情",
                            color = appearance.mobileText,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (selectedItem != null) {
                            IconButton(
                                onClick = { selectedItemPath = selectedItemPath.dropLast(1) },
                                modifier = Modifier.align(Alignment.CenterStart),
                            ) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                                    contentDescription = "返回详情列表",
                                    tint = appearance.mobileText,
                                )
                            }
                        }
                        IconButton(
                            onClick = onDismiss,
                            modifier = Modifier.align(Alignment.CenterEnd),
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "关闭详情",
                                tint = appearance.mobileText,
                            )
                        }
                    }
                    HorizontalDivider(
                        thickness = 0.7.dp,
                        color = appearance.mobileMuted.copy(alpha = 0.16f),
                    )
                    CreationOperationDetailContent(
                        payload = payload,
                        selectedItem = selectedItem,
                        appearance = appearance,
                        onOpenItem = { selectedItemPath = selectedItemPath + it.id },
                    )
                    }
                }
            }
        }
    }
}

@Composable
fun CreationOperationDetailContent(
    payload: CreationDetailPayload,
    selectedItem: CreationTimelineItem?,
    appearance: AppearanceTheme,
    onOpenItem: (CreationTimelineItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val overviewScrollState = rememberScrollState()
    val itemScrollState = remember(selectedItem?.id) { ScrollState(0) }
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(
                if (selectedItem == null) overviewScrollState else itemScrollState,
            )
            .padding(horizontal = 18.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(17.dp),
    ) {
        if (selectedItem != null) {
            OperationDetailItem(
                item = selectedItem,
                index = 0,
                animatePlanInProgress = selectedItem.id == payload.activePlanUpdateId,
                appearance = appearance,
                onOpenItem = onOpenItem,
            )
        } else {
            CreationOperationOverview(
                items = payload.items,
                turnDiff = payload.diff,
                isLive = payload.liveTurnId != null,
                appearance = appearance,
                onOpenItem = onOpenItem,
            )
        }
        if (
            selectedItem == null &&
            payload.items.isEmpty() &&
            payload.diff.isNotBlank()
        ) {
            DetailTextBlock(
                label = "变更差异",
                text = payload.diff,
                appearance = appearance,
                monospace = true,
            )
        }
    }
}
