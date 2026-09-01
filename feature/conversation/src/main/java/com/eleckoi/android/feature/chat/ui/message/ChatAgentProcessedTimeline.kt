package com.eleckoi.android.feature.chat.ui.message

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatToolCallRecord
import com.eleckoi.android.feature.chat.model.content.ToolCallState
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.engine.agent.protocol.stripAssistantPhaseHeader
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import com.eleckoi.android.feature.chat.ui.blocks.reasoning.ReasoningShimmerText
import com.eleckoi.android.feature.chat.ui.blocks.reasoning.rememberReasoningShimmerPhase
import com.eleckoi.android.feature.conversation.timeline.ui.AgentProcessedTimeline
import com.eleckoi.android.feature.conversation.timeline.CreationDetailPayload
import com.eleckoi.android.feature.conversation.timeline.components.TimelineStatusIndicator
import com.eleckoi.android.feature.conversation.timeline.components.TimelineStatusSnapshot
import com.eleckoi.android.feature.conversation.timeline.components.liveTimelineStatus
import com.eleckoi.android.feature.conversation.timeline.components.timelineStatusUpdate
import com.eleckoi.android.foundation.design.AppearanceTheme

/**
 * The turn's process, shown in the conversation only while it is happening.
 *
 * Same timeline the creator assistant runs, minus its heading and rule: a scene cannot carry a task
 * report or a line drawn across the character's turn. Without a header there is nothing left once
 * the turn's own collapse animation finishes, so the process simply leaves the conversation — and
 * is reached from the message's tools afterwards, in [ChatAgentProcessSheet].
 *
 * The conversation owns this surface's presence. It is either the live process or it is absent;
 * the settled record is reached from the message's tools. Giving the nested processed-turn surface
 * its own terminal collapse and then removing its wrapper later creates two independent geometry
 * targets, which moves the reply twice at the end of one turn.
 */
@Composable
internal fun ChatAgentProcessedTimeline(
    messageId: String,
    reasoningContent: String,
    calls: List<ChatToolCallRecord>,
    running: Boolean,
    turnStartedAtMillis: Long,
    turnCompletedAtMillis: Long?,
    appearance: AppearanceTheme,
    fontSize: TextUnit,
    lineHeight: TextUnit,
    letterSpacing: TextUnit,
    paragraphSpacing: Float,
    modifier: Modifier = Modifier,
    alwaysExpanded: Boolean = false,
    onOpenProcess: (() -> Unit)? = null,
    onOpenDetail: ((CreationDetailPayload) -> Unit)? = null,
) {
    // One owner, one terminal transition. In ordinary chat the live surface leaves immediately at
    // the boundary; the parent message body performs the sole size animation. The explicit process
    // sheet opts into the settled surface with alwaysExpanded.
    if (!running && !alwaysExpanded) return
    val items = remember(messageId, reasoningContent, calls, running) {
        chatAgentTimelineItems(
            messageId = messageId,
            reasoningContent = reasoningContent,
            calls = calls,
            running = running,
        )
    }
    if (!alwaysExpanded) {
        val status = liveChatAgentStatus(items) ?: return
        ChatLiveAgentStatusRow(
            status = status,
            appearance = appearance,
            onClick = requireNotNull(onOpenProcess) {
                "The live Agent status row must open its complete process sheet"
            },
            modifier = modifier,
        )
        return
    }
    AgentProcessedTimeline(
        turnId = messageId,
        items = items,
        running = running,
        turnStartedAtMillis = turnStartedAtMillis,
        turnCompletedAtMillis = turnCompletedAtMillis,
        appearance = appearance,
        modifier = modifier,
        showHeader = false,
        alwaysExpanded = alwaysExpanded,
        // The message body owns the hand-off; see ProcessedTurnSection.animateGeometry.
        animateGeometry = false,
        showInitialThinkingRow = false,
        narrativeFontSize = fontSize,
        narrativeLineHeight = lineHeight,
        narrativeLetterSpacing = letterSpacing,
        narrativeParagraphSpacing = paragraphSpacing,
        keepNarrativesStreamingUntilTurnCompletes = true,
        showPlainNarrativeWhilePreparing = true,
        onOpenDetail = onOpenDetail,
    )
}

internal fun chatAgentTimelineItems(
    messageId: String,
    reasoningContent: String,
    calls: List<ChatToolCallRecord>,
    running: Boolean,
): List<CreationTimelineItem> {
    val presentedCalls = calls.filterNot { call ->
        call.isPhaseHeaderOnlyRecord() &&
            (!call.isFinalProtocolBoundaryRecord() || running)
    }
    return buildList {
        if (
            reasoningContent.isNotBlank() &&
            presentedCalls.none { it.workItemType == AgentWorkItemType.Reasoning }
        ) {
            add(
                CreationTimelineItem(
                    id = "$messageId-reasoning",
                    kind = CreationTimelineKind.Tool,
                    text = "",
                    detail = reasoningContent,
                    running = running,
                    workItemId = "$messageId-reasoning",
                    workItemType = AgentWorkItemType.Reasoning,
                    createdAtMillis = calls.map(ChatToolCallRecord::startedAtMillis)
                        .filter { it > 0L }
                        .minOrNull()
                        ?: 0L,
                    completedAtMillis = calls.mapNotNull(ChatToolCallRecord::completedAtMillis)
                        .maxOrNull(),
                ),
            )
        }
        addAll(presentedCalls.map { call ->
            val finalProtocolDetected = call.isFinalProtocolBoundaryRecord()
            CreationTimelineItem(
                id = call.callId,
                kind = if (call.narrative && !finalProtocolDetected) {
                    CreationTimelineKind.Assistant
                } else {
                    CreationTimelineKind.Tool
                },
                text = if (finalProtocolDetected) {
                    "已检测到 FINAL 正文"
                } else if (call.narrative) {
                    call.processNarrativeText()
                } else {
                    call.name
                },
                detail = call.result,
                running = call.state == ToolCallState.Pending ||
                    call.state == ToolCallState.Running,
                failed = call.state == ToolCallState.Failed,
                workItemId = call.callId,
                workItemType = call.workItemType,
                createdAtMillis = call.startedAtMillis,
                completedAtMillis = call.completedAtMillis,
                fileChanges = call.fileChanges,
                paths = call.paths,
                diff = call.diff,
                turnDiffObserved = call.turnDiffObserved,
                messagePhase = call.messagePhase,
                phaseHeader = call.phaseHeader,
                toolName = call.toolName,
                toolArguments = call.arguments,
                delegatedModel = call.delegatedModel,
                childTimeline = chatAgentTimelineItems(
                    messageId = "${messageId}-${call.callId}",
                    reasoningContent = "",
                    calls = call.childCalls,
                    running = call.state == ToolCallState.Pending || call.state == ToolCallState.Running,
                ),
                delegatedSessionId = call.delegatedSessionId,
                rawCommand = call.rawCommand,
                commandActions = call.commandActions,
            )
        })
    }
}

/**
 * One stable row for the live turn. Narrative text may stream and tool states may change, but the
 * conversation geometry does not grow with the process transcript; the full record stays in the
 * settled process sheet.
 */
@Composable
private fun ChatLiveAgentStatusRow(
    status: TimelineStatusSnapshot,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val shimmerPhase = rememberReasoningShimmerPhase()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(ChatLiveAgentStatusRowHeight)
            .clickable(
                onClickLabel = "查看处理过程",
                role = Role.Button,
                onClick = onClick,
            ),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TimelineStatusIndicator(
            status = status,
            appearance = appearance,
            iconSize = 17.dp,
            thinkingOffsetY = 0.dp,
            modifier = Modifier.size(
                width = ChatLiveAgentStatusLeadingWidth,
                height = ChatLiveAgentStatusRowHeight,
            ),
        )
        if (status.running) {
            ReasoningShimmerText(
                text = status.label,
                color = appearance.mobileMuted,
                fontSize = 13.sp,
                phase = shimmerPhase,
                modifier = Modifier.weight(1f),
            )
        } else {
            Text(
                text = status.label,
                modifier = Modifier.weight(1f),
                color = appearance.mobileMuted,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Icon(
            imageVector = Icons.Rounded.ExpandMore,
            contentDescription = null,
            modifier = Modifier
                .size(16.dp)
                .graphicsLayer { rotationZ = -90f },
            tint = appearance.mobileMuted.copy(alpha = 0.7f),
        )
    }
}

/**
 * Latest real work wins the single live row; no synthetic thinking placeholder is invented.
 *
 * This conversation row answers only "what is happening now". A successfully completed item keeps
 * its in-progress wording until the next real item replaces it, so an ambiguous, non-shimmering
 * completion label never flashes between two live steps. Explicit failures remain visible; the
 * complete success/failure history belongs to the process sheet.
 */
internal fun liveChatAgentStatus(items: List<CreationTimelineItem>): TimelineStatusSnapshot? {
    val latest = items.lastOrNull { item ->
        item.workItemType != AgentWorkItemType.Request &&
            (item.kind != CreationTimelineKind.Assistant || item.text.isNotBlank())
    } ?: return null
    if (latest.failed) {
        return timelineStatusUpdate(items = listOf(latest), turnRunning = false).status
    }
    if (latest.kind == CreationTimelineKind.Assistant && latest.text.isNotBlank()) {
        return liveTimelineStatus(latest).copy(
            label = latest.text.toSingleLineProcessPreview(),
            running = true,
            thinking = true,
        )
    }
    return liveTimelineStatus(
        if (latest.running) latest else latest.copy(running = true),
    )
}

private fun String.toSingleLineProcessPreview(): String =
    lineSequence()
        .map(String::trim)
        .filter(String::isNotEmpty)
        .joinToString(" ")

private val ChatLiveAgentStatusRowHeight = 25.dp
private val ChatLiveAgentStatusLeadingWidth = 33.dp

/** Whether [message] has agent work worth keeping a way back to. */
internal fun ChatMessage.hasAgentProcessRecord(): Boolean =
    shouldShowProcessedTimeline() &&
        (toolCalls.isNotEmpty() || reasoningContent.isNotBlank())

/** Content substantial enough to occupy the live status slot; protocol headers do not qualify. */
internal fun ChatMessage.hasVisibleLiveAgentProcessRecord(): Boolean =
    reasoningContent.isNotBlank() ||
        toolCalls.any { call ->
            call.workItemType != AgentWorkItemType.Request &&
                (!call.narrative || call.processNarrativeText().isNotBlank())
        }

/** Process narration is user-facing stage text; protocol headers are never presentation content. */
internal fun ChatToolCallRecord.processNarrativeText(): String =
    stripAssistantPhaseHeader(result).visibleText

private fun ChatToolCallRecord.isPhaseHeaderOnlyRecord(): Boolean =
    narrative &&
        phaseHeader != null &&
        stripAssistantPhaseHeader(result).visibleText.isBlank()

private fun ChatToolCallRecord.isFinalProtocolBoundaryRecord(): Boolean =
    narrative &&
        phaseHeader == com.eleckoi.android.engine.agent.api.AgentMessagePhase.FinalAnswer &&
        result == "<FINAL>"
