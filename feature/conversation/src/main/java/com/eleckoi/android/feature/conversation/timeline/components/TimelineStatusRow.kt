package com.eleckoi.android.feature.conversation.timeline.components

import com.eleckoi.android.feature.conversation.timeline.*

import android.os.SystemClock
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.ui.blocks.reasoning.ReasoningIdeaCat
import com.eleckoi.android.feature.chat.ui.blocks.reasoning.ReasoningShimmerText
import com.eleckoi.android.feature.chat.ui.blocks.reasoning.rememberReasoningShimmerPhase
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.foundation.design.AppearanceTheme
import kotlinx.coroutines.delay

private const val ThinkingLabel = "正在思考"

/** What a status row currently claims the agent is doing. */
data class TimelineStatusSnapshot(
    val label: String,
    val running: Boolean,
    val thinking: Boolean,
    val icon: ImageVector,
)

/**
 * Paces how fast a status row is allowed to change.
 *
 * [settleMillis] postpones a change that may not be news yet — the lull between two tool calls
 * looks identical to the agent going back to thinking, and only time tells them apart. A newer
 * target replaces the pending one outright rather than queueing behind it, so nothing accumulates.
 *
 * [minimumHoldMillis] keeps whatever is on screen readable when events arrive in a burst.
 *
 * Both are zero for the end of a turn: that is a settled fact, and delaying it is what makes the
 * final answer feel like it lands late.
 */
data class TimelineStatusPace(
    val settleMillis: Long,
    val minimumHoldMillis: Long,
) {
    companion object {
        /** A tool is running: report it, but not faster than a reader can follow. */
        val Live = TimelineStatusPace(settleMillis = 0L, minimumHoldMillis = 520L)

        /**
         * No tool is running while the turn continues. Usually the handover to the next call;
         * only if the gap outlives the settle is the agent really back to thinking.
         */
        val StepGap = TimelineStatusPace(settleMillis = 600L, minimumHoldMillis = 520L)

        /** The turn is over. The row states the result immediately. */
        val Settled = TimelineStatusPace(settleMillis = 0L, minimumHoldMillis = 0L)
    }
}

/** A status row's target state together with how fast it is allowed to get there. */
data class TimelineStatusUpdate(
    val status: TimelineStatusSnapshot,
    val pace: TimelineStatusPace,
)

/**
 * What an operation group reports.
 *
 * The static summary is the turn's result, so only a finished turn may show it. A group with
 * nothing running inside a live turn is the lull between two tool calls, not a result — reporting
 * one there is what made a completed summary flash past while the reply was still streaming.
 */
fun timelineStatusUpdate(
    items: List<CreationTimelineItem>,
    turnRunning: Boolean,
): TimelineStatusUpdate {
    val workItems = operationPresentationItems(items)
    if (!turnRunning) {
        return TimelineStatusUpdate(
            status = TimelineStatusSnapshot(
                label = operationSummary(workItems),
                running = false,
                // A group that was nothing but reasoning keeps the cat once it settles — the cat
                // is what 思考过程 looks like, running or not. Without this it falls through to the
                // generic tool icon, because reasoning has no operation icon of its own.
                thinking = workItems.isNotEmpty() &&
                    workItems.all { it.workItemType == AgentWorkItemType.Reasoning },
                icon = creationOperationIcon(workItems),
            ),
            pace = TimelineStatusPace.Settled,
        )
    }
    val runningItem = workItems.lastOrNull(CreationTimelineItem::running)
        ?: return TimelineStatusUpdate(
            status = TimelineStatusSnapshot(
                label = operationSummary(workItems),
                running = false,
                thinking = workItems.isNotEmpty() &&
                    workItems.all { it.workItemType == AgentWorkItemType.Reasoning },
                icon = creationOperationIcon(workItems),
            ),
            pace = TimelineStatusPace.Settled,
        )
    return TimelineStatusUpdate(
        status = liveTimelineStatus(runningItem),
        pace = TimelineStatusPace.Live,
    )
}

/** What the row reports while [item] is the operation in flight. */
fun liveTimelineStatus(item: CreationTimelineItem): TimelineStatusSnapshot {
    val label = runningOperationLabel(item, hasStreamingAnswer = false)
    return TimelineStatusSnapshot(
        label = label,
        running = true,
        // The icon must agree with the visible claim. Some provider-side reasoning placeholders
        // arrive without a typed work item; their label is still "正在思考", so showing a generic
        // puzzle/tool icon beside it is semantically wrong.
        thinking = item.workItemType == AgentWorkItemType.Reasoning || label == ThinkingLabel,
        // Scoped to the item in flight. Reading the whole accumulated group pairs the label with
        // an icon from some earlier call — a folder next to "正在查找变量".
        icon = creationOperationIcon(listOf(item)),
    )
}

/** The row's state before any work is attributable: the agent has the turn but no event yet. */
fun initialThinkingStatus(): TimelineStatusSnapshot = TimelineStatusSnapshot(
    label = ThinkingLabel,
    running = true,
    thinking = true,
    icon = Icons.Rounded.Search,
)

@Composable
fun rememberSettledTimelineStatus(
    target: TimelineStatusSnapshot,
    pace: TimelineStatusPace,
): TimelineStatusSnapshot {
    var displayed by remember { mutableStateOf(target) }
    var shownAtMillis by remember { mutableLongStateOf(SystemClock.uptimeMillis()) }
    LaunchedEffect(target, pace) {
        if (target == displayed) return@LaunchedEffect
        if (pace.settleMillis > 0L) delay(pace.settleMillis)
        val heldFor = SystemClock.uptimeMillis() - shownAtMillis
        if (heldFor < pace.minimumHoldMillis) delay(pace.minimumHoldMillis - heldFor)
        displayed = target
        shownAtMillis = SystemClock.uptimeMillis()
    }
    return displayed
}

/**
 * The leading indicator. Thinking shows the idea cat, work shows the operation icon, and the swap
 * between them dissolves instead of popping.
 */
@Composable
fun TimelineStatusIndicator(
    status: TimelineStatusSnapshot,
    appearance: AppearanceTheme,
    iconSize: Dp,
    thinkingOffsetY: Dp = (-4).dp,
    modifier: Modifier = Modifier,
) {
    AnimatedContent(
        targetState = if (status.thinking) null else status.icon,
        transitionSpec = { timelineStatusDissolve() },
        contentAlignment = Alignment.Center,
        label = "timeline-status-indicator",
        modifier = modifier,
    ) { icon ->
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (icon == null) {
                ReasoningIdeaCat(
                    coverColor = appearance.mobileChatMessageBg,
                    surfaceVisible = false,
                    animated = status.running,
                    modifier = Modifier.offset(y = thinkingOffsetY),
                )
            } else {
                TimelineOperationGlyph(
                    imageVector = icon,
                    size = iconSize,
                    tint = appearance.mobileMuted,
                )
            }
        }
    }
}

/**
 * The status text. Labels dissolve in place, and the shimmer sweep is shared across them so a
 * label change never restarts the gradient mid-stroke.
 */
@Composable
fun TimelineStatusLabel(
    status: TimelineStatusSnapshot,
    color: Color,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
) {
    val phase = rememberReasoningShimmerPhase()
    AnimatedContent(
        targetState = status.label to status.running,
        transitionSpec = { timelineStatusDissolve() },
        contentAlignment = Alignment.CenterStart,
        label = "timeline-status-label",
        modifier = modifier,
    ) { (label, running) ->
        if (running) {
            ReasoningShimmerText(
                text = label,
                color = color,
                fontSize = fontSize,
                phase = phase,
                modifier = Modifier.fillMaxWidth(),
            )
        } else {
            Text(
                text = label,
                modifier = Modifier.fillMaxWidth(),
                color = color,
                fontSize = fontSize,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * The outgoing content leaves while the incoming one is already arriving, so the row is never
 * blank — a gap between the two reads as a dropped frame. The short head start keeps the overlap
 * faint enough that two labels, or a cat over an icon, never ghost into each other.
 */
private fun timelineStatusDissolve(): ContentTransform = ContentTransform(
    targetContentEnter = fadeIn(
        animationSpec = tween(
            durationMillis = TimelineStatusFadeInMillis,
            delayMillis = TimelineStatusFadeInDelayMillis,
        ),
    ),
    initialContentExit = fadeOut(
        animationSpec = tween(durationMillis = TimelineStatusFadeOutMillis, easing = LinearEasing),
    ),
    // The row is a fixed height and the label is single-line, so there is no size to animate.
    sizeTransform = null,
)

private const val TimelineStatusFadeInMillis = 200
private const val TimelineStatusFadeInDelayMillis = 60
private const val TimelineStatusFadeOutMillis = 140
