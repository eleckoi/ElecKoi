package com.eleckoi.android.feature.conversation.timeline.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.ui.blocks.reasoning.ReasoningShimmerText
import com.eleckoi.android.feature.chat.ui.blocks.reasoning.rememberReasoningShimmerPhase
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import com.eleckoi.android.feature.conversation.timeline.CreationDetailPayload
import com.eleckoi.android.feature.conversation.timeline.CreationLiveDetailSource
import com.eleckoi.android.feature.conversation.timeline.CreationTurnUi
import com.eleckoi.android.feature.conversation.timeline.components.TimelineStatusIndicator
import com.eleckoi.android.feature.conversation.timeline.components.TimelineStatusSnapshot
import com.eleckoi.android.feature.conversation.timeline.components.UserTimelineItem
import com.eleckoi.android.feature.conversation.timeline.activePlanUpdateId
import com.eleckoi.android.feature.conversation.timeline.agentToolTimelinePresentation
import com.eleckoi.android.feature.conversation.timeline.components.creationOperationIcon
import com.eleckoi.android.feature.conversation.timeline.components.initialThinkingStatus
import com.eleckoi.android.feature.conversation.timeline.operationSummary
import com.eleckoi.android.feature.conversation.timeline.visibleOuterProcessingItems
import com.eleckoi.android.foundation.design.AppearanceTheme

/** Text carried by one compact DeepSeek Harness-style process row. */
data class DshTimelineRowPresentation(
    val title: String,
    val summary: String,
)

/**
 * DSH keeps each reasoning/tool event independently addressable instead of regrouping the turn
 * behind a synthetic “已处理” disclosure. This is a display projection only; source items remain
 * byte-for-byte unchanged for Room persistence and native model-history replay.
 */
fun dshTimelineRowPresentation(item: CreationTimelineItem): DshTimelineRowPresentation {
    val firstTextLine = item.text.firstCompactLine()
    val firstDetailLine = item.detail.firstCompactLine()
    val tool = item.agentToolTimelinePresentation()
    return when (item.kind) {
        CreationTimelineKind.Assistant -> DshTimelineRowPresentation(
            title = "思考",
            summary = firstTextLine.ifBlank { "思考过程" },
        )

        CreationTimelineKind.User -> DshTimelineRowPresentation(
            title = "追加指令",
            summary = firstTextLine,
        )

        CreationTimelineKind.Tool -> when (item.workItemType) {
            AgentWorkItemType.Reasoning -> DshTimelineRowPresentation(
                title = "思考",
                summary = firstTextLine.ifBlank { firstDetailLine }.ifBlank {
                    if (item.running) "正在思考" else "思考过程"
                },
            )

            AgentWorkItemType.Command -> DshTimelineRowPresentation(
                title = "命令",
                summary = item.rawCommand.firstCompactLine()
                    .ifBlank { firstTextLine }
                    .ifBlank { operationSummary(listOf(item)) },
            )

            AgentWorkItemType.FileChange -> DshTimelineRowPresentation(
                title = if (item.failed) "文件修改失败" else if (item.running) "正在修改文件" else "修改文件",
                summary = item.paths.joinToString(" · ").firstCompactLine()
                    .ifBlank { firstTextLine }
                    .ifBlank { operationSummary(listOf(item)) },
            )

            AgentWorkItemType.ContextCompaction -> DshTimelineRowPresentation(
                title = "上下文",
                summary = operationSummary(listOf(item)),
            )

            AgentWorkItemType.Action -> DshTimelineRowPresentation(
                title = "动作",
                summary = operationSummary(listOf(item)),
            )

            AgentWorkItemType.Request -> DshTimelineRowPresentation(
                title = "模型请求",
                summary = firstTextLine,
            )

            AgentWorkItemType.Tool,
            AgentWorkItemType.Unknown,
            AgentWorkItemType.AssistantMessage,
            AgentWorkItemType.UserMessage,
            null,
            -> DshTimelineRowPresentation(
                title = tool?.title ?: item.toolName.ifBlank { "工具" },
                summary = tool?.target.orEmpty()
                    .ifBlank { firstTextLine }
                    .ifBlank { operationSummary(listOf(item)) },
            )
        }
    }
}

@Composable
fun DshProcessedTurnTimeline(
    turn: CreationTurnUi,
    appearance: AppearanceTheme,
    onOpenDetail: (CreationDetailPayload) -> Unit,
) {
    val processing = visibleOuterProcessingItems(
        items = turn.processing,
        turnRunning = turn.running,
    )
    val activePlanId = activePlanUpdateId(
        items = turn.processing + turn.chronologicalTail,
        turnRunning = turn.running,
    )
    val processRows = processing.filter(CreationTimelineItem::isDshTimelineVisible)
    val tailRows = turn.chronologicalTail.filter { item ->
        item.kind == CreationTimelineKind.User || item.isDshTimelineVisible()
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        if (processRows.isEmpty() && tailRows.isEmpty() && turn.running) {
            DshTimelineRow(
                presentation = DshTimelineRowPresentation("思考", "正在思考"),
                status = initialThinkingStatus(),
                appearance = appearance,
                contentDescription = "查看实时详情",
                onClick = {
                    onOpenDetail(
                        CreationDetailPayload(
                            title = "正在思考",
                            items = emptyList(),
                            sourceTurnId = turn.id,
                            activePlanUpdateId = activePlanId,
                            liveTurnId = turn.id,
                            liveLatestItemOnly = true,
                        ),
                    )
                },
            )
        }
        processRows.forEach { item ->
            DshTimelineItemRow(
                item = item,
                source = CreationLiveDetailSource.Processing,
                turn = turn,
                activePlanId = activePlanId,
                appearance = appearance,
                onOpenDetail = onOpenDetail,
            )
        }
        tailRows.forEach { item ->
            if (item.kind == CreationTimelineKind.User) {
                UserTimelineItem(item, appearance)
            } else {
                DshTimelineItemRow(
                    item = item,
                    source = CreationLiveDetailSource.ChronologicalTail,
                    turn = turn,
                    activePlanId = activePlanId,
                    appearance = appearance,
                    onOpenDetail = onOpenDetail,
                )
            }
        }
    }
}

@Composable
private fun DshTimelineItemRow(
    item: CreationTimelineItem,
    source: CreationLiveDetailSource,
    turn: CreationTurnUi,
    activePlanId: String?,
    appearance: AppearanceTheme,
    onOpenDetail: (CreationDetailPayload) -> Unit,
) {
    val presentation = dshTimelineRowPresentation(item)
    val thinking = item.kind == CreationTimelineKind.Assistant ||
        item.workItemType == AgentWorkItemType.Reasoning
    DshTimelineRow(
        presentation = presentation,
        status = TimelineStatusSnapshot(
            label = listOf(presentation.title, presentation.summary)
                .filter(String::isNotBlank)
                .joinToString(" · "),
            running = item.running,
            thinking = thinking,
            icon = creationOperationIcon(listOf(item)),
        ),
        appearance = appearance,
        contentDescription = if (item.running) "查看实时详情" else "查看${presentation.title}详情",
        onClick = {
            onOpenDetail(
                CreationDetailPayload(
                    title = if (item.running) "实时详情" else presentation.title,
                    items = listOf(item),
                    diff = item.diff,
                    sourceTurnId = turn.id,
                    activePlanUpdateId = activePlanId,
                    liveTurnId = turn.id.takeIf { item.running },
                    liveLatestItemOnly = item.running,
                    liveSource = source,
                ),
            )
        },
    )
}

@Composable
private fun DshTimelineRow(
    presentation: DshTimelineRowPresentation,
    status: TimelineStatusSnapshot,
    appearance: AppearanceTheme,
    contentDescription: String,
    onClick: () -> Unit,
) {
    val shimmerPhase = rememberReasoningShimmerPhase()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .heightIn(min = 38.dp)
            .padding(horizontal = 2.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TimelineStatusIndicator(
            status = status,
            appearance = appearance,
            iconSize = 16.dp,
            modifier = Modifier.size(width = 28.dp, height = 24.dp),
        )
        Text(
            text = presentation.title,
            color = appearance.mobileText.copy(alpha = 0.82f),
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
        )
        Box(
            modifier = Modifier
                .padding(horizontal = 7.dp)
                .size(3.dp)
                .clip(CircleShape)
                .background(appearance.mobileMuted.copy(alpha = 0.42f)),
        )
        if (status.running) {
            ReasoningShimmerText(
                text = presentation.summary,
                color = appearance.mobileMuted,
                fontSize = 12.5.sp,
                phase = shimmerPhase,
                modifier = Modifier.weight(1f),
            )
        } else {
            Text(
                text = presentation.summary,
                modifier = Modifier.weight(1f),
                color = appearance.mobileMuted,
                fontSize = 12.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            imageVector = Icons.Rounded.ChevronRight,
            contentDescription = contentDescription,
            tint = appearance.mobileMuted.copy(alpha = 0.56f),
            modifier = Modifier.size(15.dp),
        )
    }
}

fun CreationTimelineItem.isDshTimelineVisible(): Boolean = when (kind) {
    CreationTimelineKind.User -> false
    CreationTimelineKind.Assistant -> text.isNotBlank()
    CreationTimelineKind.Tool -> workItemType != AgentWorkItemType.Request &&
        (running || text.isNotBlank() || detail.isNotBlank() || toolName.isNotBlank() ||
            workItemType != AgentWorkItemType.Reasoning)
}

private fun String.firstCompactLine(): String = lineSequence()
    .map(String::trim)
    .firstOrNull(String::isNotBlank)
    .orEmpty()
    .replace(DshWhitespaceRegex, " ")
    .take(120)

private val DshWhitespaceRegex = Regex("\\s+")
