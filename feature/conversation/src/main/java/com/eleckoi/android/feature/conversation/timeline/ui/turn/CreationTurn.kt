package com.eleckoi.android.feature.conversation.timeline.ui.turn

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.unit.dp
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.ui.LocalChatRenderingPreferences
import com.eleckoi.android.feature.conversation.timeline.CreationDetailPayload
import com.eleckoi.android.feature.conversation.timeline.CreationFileSummary
import com.eleckoi.android.feature.conversation.timeline.CreationLiveDetailSource
import com.eleckoi.android.feature.conversation.timeline.CreationTailBlock
import com.eleckoi.android.feature.conversation.timeline.CreationTurnUi
import com.eleckoi.android.feature.conversation.timeline.activePlanUpdateId
import com.eleckoi.android.feature.conversation.timeline.operationGroupAnchorId
import com.eleckoi.android.feature.conversation.timeline.toChronologicalTailBlocks
import com.eleckoi.android.feature.conversation.timeline.components.FileChangeSummaryCard
import com.eleckoi.android.feature.conversation.timeline.components.FinalAssistantAnswer
import com.eleckoi.android.feature.conversation.timeline.components.UserTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationPendingSteerInput
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import com.eleckoi.android.feature.conversation.timeline.ui.DshProcessedTurnTimeline
import com.eleckoi.android.feature.conversation.timeline.ui.rememberCreationTurnFileSummary
import com.eleckoi.android.feature.preferences.ChatToolTimelineStyle
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun CreationTurn(
    turn: CreationTurnUi,
    workspaceId: String,
    pendingSteerInputs: List<CreationPendingSteerInput>,
    appearance: AppearanceTheme,
    onEditUserMessage: ((CreationTimelineItem) -> Unit)? = null,
    onEditUserMessageBoundsChanged: ((CreationTimelineItem, Rect?) -> Unit)? = null,
    finalWorkspacePaths: List<String>?,
    canUndo: Boolean,
    isRestoring: Boolean,
    onUndo: () -> Unit,
    onOpenDetail: (CreationDetailPayload) -> Unit,
    showFinalAnswer: Boolean = true,
    showGeneratedMedia: Boolean = true,
    showFileSummary: Boolean = true,
    showProcessedHeader: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val toolTimelineStyle = LocalChatRenderingPreferences.current.toolTimelineStyle
    val fileSummary = rememberCreationTurnFileSummary(turn, finalWorkspacePaths)
    val fileItems = (turn.processing + turn.chronologicalTail).filter {
        it.workItemType == AgentWorkItemType.FileChange
    }
    val stats = fileSummary.stats
    val generatedMedia = turn.generatedMedia
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        turn.user?.let { item ->
            UserTimelineItem(
                item = item,
                appearance = appearance,
                onEdit = onEditUserMessage?.let { edit -> { edit(item) } },
                onEditBoundsChanged = onEditUserMessageBoundsChanged?.let { changed ->
                    { bounds -> changed(item, bounds) }
                },
            )
        }
        when (toolTimelineStyle) {
            ChatToolTimelineStyle.Codex -> {
                ProcessedTurnSection(
                    turn = turn,
                    appearance = appearance,
                    onOpenDetail = onOpenDetail,
                    showHeader = showProcessedHeader,
                    // The conversation list owns the final-answer handoff geometry.
                    animateGeometry = false,
                )
                ChronologicalTurnTail(
                    turn = turn,
                    appearance = appearance,
                    onOpenDetail = onOpenDetail,
                )
            }

            ChatToolTimelineStyle.Dsh -> DshProcessedTurnTimeline(
                turn = turn,
                appearance = appearance,
                onOpenDetail = onOpenDetail,
            )
        }
        pendingSteerInputs.forEach { pending ->
            PendingSteerPreview(pending, appearance)
        }
        if (showFinalAnswer) {
            turn.finalAnswer?.let { FinalAssistantAnswer(it, appearance) }
        }
        if (showGeneratedMedia && workspaceId.isNotBlank() && generatedMedia.isNotEmpty()) {
            CreatorGeneratedMediaGallery(
                workspaceId = workspaceId,
                items = generatedMedia,
                appearance = appearance,
            )
        }
        if (showFileSummary && !turn.running && stats.isNotEmpty()) {
            CreationTurnFileSummaryCard(
                fileSummary = fileSummary,
                fileItems = fileItems,
                canUndo = canUndo,
                isRestoring = isRestoring,
                appearance = appearance,
                onUndo = onUndo,
                onOpenDetail = onOpenDetail,
            )
        }
    }
}

@Composable
fun CreationTurnFooter(
    turn: CreationTurnUi,
    appearance: AppearanceTheme,
    finalWorkspacePaths: List<String>?,
    canUndo: Boolean,
    isRestoring: Boolean,
    onUndo: () -> Unit,
    onOpenDetail: (CreationDetailPayload) -> Unit,
    modifier: Modifier = Modifier,
) {
    val fileSummary = rememberCreationTurnFileSummary(turn, finalWorkspacePaths)
    val fileItems = (turn.processing + turn.chronologicalTail).filter {
        it.workItemType == AgentWorkItemType.FileChange
    }
    Column(modifier = modifier) {
        if (!turn.running && fileSummary.stats.isNotEmpty()) {
            Spacer(modifier = Modifier.height(CreationTurnContentSpacing))
            CreationTurnFileSummaryCard(
                fileSummary = fileSummary,
                fileItems = fileItems,
                canUndo = canUndo,
                isRestoring = isRestoring,
                appearance = appearance,
                onUndo = onUndo,
                onOpenDetail = onOpenDetail,
            )
        }
        Spacer(modifier = Modifier.height(CreationTurnSpacing))
    }
}

@Composable
private fun CreationTurnFileSummaryCard(
    fileSummary: CreationFileSummary,
    fileItems: List<CreationTimelineItem>,
    canUndo: Boolean,
    isRestoring: Boolean,
    appearance: AppearanceTheme,
    onUndo: () -> Unit,
    onOpenDetail: (CreationDetailPayload) -> Unit,
) {
    FileChangeSummaryCard(
        stats = fileSummary.stats,
        canUndo = canUndo,
        isRestoring = isRestoring,
        appearance = appearance,
        onUndo = onUndo,
        onReview = {
            onOpenDetail(
                CreationDetailPayload(
                    title = "文件变更",
                    items = fileItems.map { it.copy(diff = "") },
                    diff = fileSummary.diff,
                ),
            )
        },
    )
}

@Composable
private fun PendingSteerPreview(
    pending: CreationPendingSteerInput,
    appearance: AppearanceTheme,
) {
    UserTimelineItem(
        item = CreationTimelineItem(
            id = "pending-steer-${pending.id}",
            kind = CreationTimelineKind.User,
            text = pending.text,
            createdAtMillis = pending.submittedAtMillis,
        ),
        appearance = appearance,
    )
}

@Composable
private fun ChronologicalTurnTail(
    turn: CreationTurnUi,
    appearance: AppearanceTheme,
    onOpenDetail: (CreationDetailPayload) -> Unit,
) {
    if (turn.chronologicalTail.isEmpty()) return
    val activePlanId = activePlanUpdateId(
        items = turn.processing + turn.chronologicalTail,
        turnRunning = turn.running,
    )
    val blocks = turn.chronologicalTail.toChronologicalTailBlocks()
    Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
        blocks.forEachIndexed { index, block ->
            when (block) {
                is CreationTailBlock.UserInput -> UserTimelineItem(block.item, appearance)
                is CreationTailBlock.Narrative -> ProcessNarrative(block.item, appearance)
                is CreationTailBlock.Operations -> {
                    OperationSummaryRow(
                        items = block.items,
                        turnRunning = turn.running && index == blocks.lastIndex,
                        appearance = appearance,
                        onClick = {
                            val groupIsRunning = block.items.any { item ->
                                item.workItemType != AgentWorkItemType.Request && item.running
                            }
                            onOpenDetail(
                                CreationDetailPayload(
                                    title = if (groupIsRunning) "实时详情" else "详情",
                                    items = block.items,
                                    diff = block.items.asReversed()
                                        .firstOrNull { it.diff.isNotBlank() }
                                        ?.diff
                                        .orEmpty(),
                                    sourceTurnId = turn.id,
                                    activePlanUpdateId = activePlanId,
                                    liveTurnId = turn.id.takeIf { turn.running },
                                    liveCurrentOperationGroup = turn.running,
                                    liveOperationGroupAnchorId = block.items.operationGroupAnchorId(),
                                    liveSource = CreationLiveDetailSource.ChronologicalTail,
                                ),
                            )
                        },
                    )
                }
            }
        }
    }
}

val CreationTurnSpacing = 18.dp
val CreationTurnContentSpacing = 13.dp
