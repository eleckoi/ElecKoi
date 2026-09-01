package com.eleckoi.android.feature.conversation.timeline.ui

import com.eleckoi.android.feature.conversation.timeline.ui.turn.ProcessedTurnSection

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import com.eleckoi.android.feature.conversation.timeline.CreationDetailPayload
import com.eleckoi.android.feature.conversation.timeline.detail.CreationOperationDetailDialog
import com.eleckoi.android.feature.conversation.timeline.CreationTurnUi
import com.eleckoi.android.feature.conversation.timeline.activePlanUpdateId
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.chat.ui.LocalChatRenderingPreferences
import com.eleckoi.android.feature.preferences.ChatToolTimelineStyle

/** The creator assistant's processed-turn surface, shared verbatim with role conversations. */
@Composable
fun AgentProcessedTimeline(
    turnId: String,
    items: List<CreationTimelineItem>,
    running: Boolean,
    turnStartedAtMillis: Long = 0L,
    turnCompletedAtMillis: Long? = null,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    showHeader: Boolean = true,
    alwaysExpanded: Boolean = false,
    animateGeometry: Boolean = true,
    showInitialThinkingRow: Boolean = true,
    narrativeFontSize: TextUnit = 14.sp,
    narrativeLineHeight: TextUnit = 21.sp,
    narrativeLetterSpacing: TextUnit = 0.sp,
    narrativeParagraphSpacing: Float = 8f,
    keepNarrativesStreamingUntilTurnCompletes: Boolean = false,
    showPlainNarrativeWhilePreparing: Boolean = false,
    onOpenDetail: ((CreationDetailPayload) -> Unit)? = null,
) {
    val toolTimelineStyle = LocalChatRenderingPreferences.current.toolTimelineStyle
    var detail by remember(turnId) { mutableStateOf<CreationDetailPayload?>(null) }
    val startedAtMillis = turnStartedAtMillis.takeIf { it > 0L } ?: items
        .map(CreationTimelineItem::createdAtMillis)
        .filter { it > 0L }
        .minOrNull()
        ?: 0L
    val completedAtMillis = turnCompletedAtMillis ?: items
        .mapNotNull(CreationTimelineItem::completedAtMillis)
        .maxOrNull()
    val activePlanId = remember(items, running) {
        activePlanUpdateId(items, turnRunning = running)
    }
    val turn = remember(turnId, items, running, startedAtMillis, completedAtMillis) {
        CreationTurnUi(
            id = turnId,
            user = null,
            processing = items,
            chronologicalTail = emptyList(),
            finalAnswer = if (running) null else CreationTimelineItem(
                id = "$turnId-final",
                kind = CreationTimelineKind.Assistant,
                text = "",
            ),
            running = running,
            startedAtMillis = startedAtMillis,
            completedAtMillis = completedAtMillis,
            diff = items.asReversed().firstOrNull { it.diff.isNotBlank() }?.diff.orEmpty(),
            turnDiffObserved = items.any(CreationTimelineItem::turnDiffObserved),
            paths = items.flatMap(CreationTimelineItem::paths).distinct(),
        )
    }
    LaunchedEffect(items, detail?.liveTurnId, activePlanId) {
        val current = detail ?: return@LaunchedEffect
        detail = if (current.liveTurnId == turnId) {
            current.copy(
                items = items,
                diff = items.asReversed().firstOrNull { it.diff.isNotBlank() }?.diff.orEmpty(),
                activePlanUpdateId = activePlanId,
            )
        } else {
            current.copy(activePlanUpdateId = activePlanId)
        }
    }
    androidx.compose.foundation.layout.Box(modifier = modifier) {
        val openDetail: (CreationDetailPayload) -> Unit = { payload ->
            if (onOpenDetail != null) {
                onOpenDetail(
                    payload.copy(
                        sourceTurnId = turnId,
                        activePlanUpdateId = activePlanId,
                    ),
                )
            } else {
                detail = payload.copy(
                    sourceTurnId = turnId,
                    activePlanUpdateId = activePlanId,
                )
            }
        }
        when (toolTimelineStyle) {
            ChatToolTimelineStyle.Codex -> ProcessedTurnSection(
                turn = turn,
                appearance = appearance,
                onOpenDetail = openDetail,
                showHeader = showHeader,
                alwaysExpanded = alwaysExpanded,
                animateGeometry = animateGeometry,
                showInitialThinkingRow = showInitialThinkingRow,
                narrativeFontSize = narrativeFontSize,
                narrativeLineHeight = narrativeLineHeight,
                narrativeLetterSpacing = narrativeLetterSpacing,
                narrativeParagraphSpacing = narrativeParagraphSpacing,
                keepNarrativesStreamingUntilTurnCompletes =
                    keepNarrativesStreamingUntilTurnCompletes,
                showPlainNarrativeWhilePreparing = showPlainNarrativeWhilePreparing,
            )

            ChatToolTimelineStyle.Dsh -> DshProcessedTurnTimeline(
                turn = turn,
                appearance = appearance,
                onOpenDetail = openDetail,
            )
        }
    }
    if (onOpenDetail == null) detail?.let { payload ->
        CreationOperationDetailDialog(
            payload = payload,
            appearance = appearance,
            onDismiss = { detail = null },
        )
    }
}
