package com.eleckoi.android.feature.conversation.timeline.ui.turn

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.ui.LocalStaticListExpansionObserver
import com.eleckoi.android.feature.conversation.markdown.CreationMarkdownText
import com.eleckoi.android.feature.conversation.timeline.CreationDetailPayload
import com.eleckoi.android.feature.conversation.timeline.CreationProcessBlock
import com.eleckoi.android.feature.conversation.timeline.CreationTurnUi
import com.eleckoi.android.feature.conversation.timeline.activePlanUpdateId
import com.eleckoi.android.feature.conversation.timeline.formatCreationElapsedTime
import com.eleckoi.android.feature.conversation.timeline.latestLiveDetailItems
import com.eleckoi.android.feature.conversation.timeline.operationGroupAnchorId
import com.eleckoi.android.feature.conversation.timeline.shouldShowInitialThinkingRow
import com.eleckoi.android.feature.conversation.timeline.toProcessBlocks
import com.eleckoi.android.feature.conversation.timeline.visibleOuterProcessingItems
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.foundation.design.AppearanceTheme
import kotlinx.coroutines.delay

@Composable
fun ProcessedTurnSection(
    turn: CreationTurnUi,
    appearance: AppearanceTheme,
    onOpenDetail: (CreationDetailPayload) -> Unit,
    modifier: Modifier = Modifier,
    /** Whether to show the settled "已处理" row and its divider. */
    showHeader: Boolean = true,
    /** For surfaces that are already an act of opening, like the process sheet. */
    alwaysExpanded: Boolean = false,
    /** Whether this surface owns its process-height animation. */
    animateGeometry: Boolean = true,
    showInitialThinkingRow: Boolean = true,
    narrativeFontSize: TextUnit = 14.sp,
    narrativeLineHeight: TextUnit = 21.sp,
    narrativeLetterSpacing: TextUnit = 0.sp,
    narrativeParagraphSpacing: Float = 8f,
    keepNarrativesStreamingUntilTurnCompletes: Boolean = false,
    showPlainNarrativeWhilePreparing: Boolean = false,
) {
    val activePlanId = activePlanUpdateId(
        items = turn.processing + turn.chronologicalTail,
        turnRunning = turn.running,
    )
    var manuallyControlled by remember(turn.id) { mutableStateOf(false) }
    var expandedState by rememberSaveable(turn.id) {
        mutableStateOf(turn.running || turn.finalAnswer == null)
    }
    val finalAnswerReady = turn.finalAnswer?.text?.isNotBlank() == true
    var sawRunning by remember(turn.id) { mutableStateOf(turn.running) }
    var collapsingAfterRun by remember(turn.id) { mutableStateOf(false) }
    val expanded = processedTurnExpanded(
        alwaysExpanded = alwaysExpanded,
        manuallyControlled = manuallyControlled,
        expandedState = expandedState,
        turnRunning = turn.running,
        finalAnswerReady = finalAnswerReady,
        // The running flag and the final answer are published by separate state updates. Keep
        // the process subtree mounted until its replacement has had one frame to measure.
        terminalHandoffPending = sawRunning || collapsingAfterRun,
    )
    LaunchedEffect(turn.running, finalAnswerReady) {
        if (turn.running) {
            manuallyControlled = false
            expandedState = true
            sawRunning = true
            collapsingAfterRun = false
            return@LaunchedEffect
        }
        // Terminal state and durable final answer can arrive in separate updates.
        if (!finalAnswerReady) {
            if (!manuallyControlled) expandedState = true
            return@LaunchedEffect
        }
        val wasRunning = sawRunning
        if (!manuallyControlled && wasRunning) {
            // Let the final-answer owner commit its first measured frame before removing the
            // process subtree. Without this frame AnimatedVisibility and LazyColumn can both
            // observe the terminal geometry change and briefly paint neither owner.
            withFrameNanos { }
            collapsingAfterRun = true
            expandedState = false
        } else if (!manuallyControlled) {
            expandedState = false
        }
        sawRunning = false
        if (!wasRunning || manuallyControlled) return@LaunchedEffect
        delay(ProcessedTurnCollapseDurationMillis.toLong())
        withFrameNanos { }
        collapsingAfterRun = false
    }
    val staticExpansionObserver = LocalStaticListExpansionObserver.current
    var staticExpansionRegistered by remember(turn.id) { mutableStateOf(false) }
    DisposableEffect(turn.id, staticExpansionObserver) {
        onDispose {
            if (staticExpansionRegistered) staticExpansionObserver(turn.id, false)
        }
    }
    LaunchedEffect(
        expanded,
        turn.running,
        manuallyControlled,
        collapsingAfterRun,
        staticExpansionObserver,
    ) {
        if (
            shouldOwnStaticListExpansion(
                alwaysExpanded = alwaysExpanded,
                collapsingAfterRun = collapsingAfterRun,
                expanded = expanded,
                turnRunning = turn.running,
                manuallyControlled = manuallyControlled,
            )
        ) {
            if (!staticExpansionRegistered) {
                staticExpansionObserver(turn.id, true)
                staticExpansionRegistered = true
            }
        } else if (staticExpansionRegistered) {
            if (!turn.running) {
                delay(ProcessedTurnCollapseDurationMillis.toLong())
                withFrameNanos { }
            }
            staticExpansionObserver(turn.id, false)
            staticExpansionRegistered = false
        }
    }
    var now by remember(turn.id) { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(turn.running, turn.startedAtMillis) {
        while (turn.running && turn.startedAtMillis > 0L) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }
    val durationMillis = if (turn.startedAtMillis > 0L) {
        val endMillis = if (turn.running) now else turn.completedAtMillis ?: now
        (endMillis - turn.startedAtMillis).coerceAtLeast(0L)
    } else {
        0L
    }
    val arrowRotation by animateFloatAsState(
        targetValue = if (expanded) 180f else 0f,
        animationSpec = tween(
            durationMillis = if (expanded) 220 else 190,
            easing = if (expanded) LinearOutSlowInEasing else FastOutLinearInEasing,
        ),
        label = "processed-turn-arrow",
    )
    val visibleProcessing = visibleOuterProcessingItems(
        items = turn.processing,
        turnRunning = turn.running,
    )
    val processBlocks = visibleProcessing.toProcessBlocks()
    val fillsAvailableWidth = agentProcessFillsAvailableWidth(
        showHeader = showHeader,
        alwaysExpanded = alwaysExpanded,
        hasOperations = processBlocks.any { it is CreationProcessBlock.Operations },
    )
    Column(
        modifier = modifier.then(if (fillsAvailableWidth) Modifier.fillMaxWidth() else Modifier),
    ) {
        if (showHeader) {
            ProcessedTurnHeader(
                durationMillis = durationMillis,
                running = turn.running,
                expanded = expanded,
                arrowRotation = arrowRotation,
                appearance = appearance,
                onToggle = {
                    val nextExpanded = !expanded
                    manuallyControlled = true
                    if (nextExpanded && !staticExpansionRegistered) {
                        staticExpansionObserver(turn.id, true)
                        staticExpansionRegistered = true
                    }
                    expandedState = nextExpanded
                },
            )
        }
        AnimatedVisibility(
            visible = expanded,
            enter = if (animateGeometry) {
                expandVertically(
                    animationSpec = tween(220, easing = LinearOutSlowInEasing),
                    expandFrom = Alignment.Top,
                ) + fadeIn(tween(140))
            } else {
                EnterTransition.None
            },
            exit = if (animateGeometry) {
                shrinkVertically(
                    animationSpec = tween(
                        ProcessedTurnCollapseDurationMillis,
                        easing = FastOutLinearInEasing,
                    ),
                    shrinkTowards = Alignment.Top,
                ) + fadeOut(tween(110))
            } else {
                ExitTransition.None
            },
        ) {
            ProcessedTurnBody(
                turn = turn,
                processBlocks = processBlocks,
                activePlanId = activePlanId,
                fillsAvailableWidth = fillsAvailableWidth,
                animateGeometry = animateGeometry,
                showInitialThinkingRow = showInitialThinkingRow,
                narrativeFontSize = narrativeFontSize,
                narrativeLineHeight = narrativeLineHeight,
                narrativeLetterSpacing = narrativeLetterSpacing,
                narrativeParagraphSpacing = narrativeParagraphSpacing,
                keepNarrativesStreamingUntilTurnCompletes = keepNarrativesStreamingUntilTurnCompletes,
                showPlainNarrativeWhilePreparing = showPlainNarrativeWhilePreparing,
                alwaysExpanded = alwaysExpanded,
                appearance = appearance,
                onOpenDetail = onOpenDetail,
            )
        }
    }
}

@Composable
private fun ProcessedTurnHeader(
    durationMillis: Long,
    running: Boolean,
    expanded: Boolean,
    arrowRotation: Float,
    appearance: AppearanceTheme,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !running, onClick = onToggle),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = buildString {
                append("已处理")
                if (durationMillis > 0L) append(" ${formatCreationElapsedTime(durationMillis)}")
            },
            color = appearance.mobileMuted,
            fontSize = 12.5.sp,
        )
        if (!running) {
            Icon(
                imageVector = Icons.Rounded.ExpandMore,
                contentDescription = if (expanded) "收起处理过程" else "展开处理过程",
                modifier = Modifier
                    .padding(start = 3.dp)
                    .size(17.dp)
                    .graphicsLayer { rotationZ = arrowRotation },
                tint = appearance.mobileMuted,
            )
        }
    }
    HorizontalDivider(
        modifier = Modifier.padding(top = 7.dp),
        thickness = 0.7.dp,
        color = appearance.mobileMuted.copy(alpha = 0.18f),
    )
}

@Composable
private fun ProcessedTurnBody(
    turn: CreationTurnUi,
    processBlocks: List<CreationProcessBlock>,
    activePlanId: String?,
    fillsAvailableWidth: Boolean,
    animateGeometry: Boolean,
    showInitialThinkingRow: Boolean,
    narrativeFontSize: TextUnit,
    narrativeLineHeight: TextUnit,
    narrativeLetterSpacing: TextUnit,
    narrativeParagraphSpacing: Float,
    keepNarrativesStreamingUntilTurnCompletes: Boolean,
    showPlainNarrativeWhilePreparing: Boolean,
    alwaysExpanded: Boolean,
    appearance: AppearanceTheme,
    onOpenDetail: (CreationDetailPayload) -> Unit,
) {
    var processSizeAnimationArmed by remember(turn.id) { mutableStateOf(false) }
    LaunchedEffect(processBlocks.isNotEmpty()) {
        if (processBlocks.isNotEmpty() && !processSizeAnimationArmed) {
            withFrameNanos { }
            processSizeAnimationArmed = true
        }
    }
    val processSurfaceModifier = if (processSizeAnimationArmed && animateGeometry) {
        Modifier
            .padding(top = 11.dp)
            .animateContentSize(
                animationSpec = AgentProcessSizeAnimationSpec,
                alignment = Alignment.TopStart,
            )
    } else {
        Modifier.padding(top = 11.dp)
    }
    Column(
        modifier = processSurfaceModifier,
        verticalArrangement = Arrangement.spacedBy(11.dp),
    ) {
        processBlocks.forEachIndexed { index, block ->
            val blockKey = when (block) {
                is CreationProcessBlock.Narrative -> "narrative:${block.item.id}"
                is CreationProcessBlock.Operations -> "operations:${block.items.firstOrNull()?.id}"
            }
            key(blockKey) {
                when (block) {
                    is CreationProcessBlock.Narrative -> ProcessNarrative(
                        item = block.item,
                        appearance = appearance,
                        fontSize = narrativeFontSize,
                        lineHeight = narrativeLineHeight,
                        letterSpacing = narrativeLetterSpacing,
                        paragraphSpacing = narrativeParagraphSpacing,
                        streamUntilTurnCompletes =
                            keepNarrativesStreamingUntilTurnCompletes && turn.running,
                        showPlainTextWhilePreparing = showPlainNarrativeWhilePreparing,
                        fillAvailableWidth = fillsAvailableWidth,
                    )
                    is CreationProcessBlock.Operations -> {
                        val groupIsRunning = block.items.any { item ->
                            item.workItemType != AgentWorkItemType.Request && item.running
                        }
                        OperationSummaryRow(
                            items = block.items,
                            turnRunning = operationGroupUsesLiveStatus(
                                turnRunning = turn.running,
                                isLatestBlock = index == processBlocks.lastIndex,
                                alwaysExpanded = alwaysExpanded,
                                groupIsRunning = groupIsRunning,
                            ),
                            appearance = appearance,
                            onClick = {
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
                                    ),
                                )
                            },
                        )
                    }
                }
            }
        }
        if (
            showInitialThinkingRow && shouldShowInitialThinkingRow(
                blocks = processBlocks,
                turnRunning = turn.running,
                hasFollowingChronologicalItems = turn.chronologicalTail.isNotEmpty(),
            )
        ) {
            RunningOperationRow(
                item = null,
                appearance = appearance,
                onClick = {
                    val liveDetailItems = latestLiveDetailItems(turn.processing)
                    onOpenDetail(
                        CreationDetailPayload(
                            title = "正在思考",
                            items = liveDetailItems,
                            diff = liveDetailItems.asReversed()
                                .firstOrNull { it.diff.isNotBlank() }
                                ?.diff
                                .orEmpty(),
                            sourceTurnId = turn.id,
                            activePlanUpdateId = activePlanId,
                            liveTurnId = turn.id,
                            liveLatestItemOnly = true,
                        ),
                    )
                },
            )
        }
    }
}

@Composable
internal fun ProcessNarrative(
    item: CreationTimelineItem,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    fontSize: TextUnit = 14.sp,
    lineHeight: TextUnit = 21.sp,
    letterSpacing: TextUnit = 0.sp,
    paragraphSpacing: Float = 8f,
    streamUntilTurnCompletes: Boolean = false,
    showPlainTextWhilePreparing: Boolean = false,
    fillAvailableWidth: Boolean = true,
) {
    Row(
        modifier = modifier.then(if (fillAvailableWidth) Modifier.fillMaxWidth() else Modifier),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        CreationMarkdownText(
            item = item,
            appearance = appearance,
            modifier = Modifier.weight(1f, fill = false),
            fontSize = fontSize,
            lineHeight = lineHeight,
            letterSpacing = letterSpacing,
            paragraphSpacing = paragraphSpacing,
            streamUntilTurnCompletes = streamUntilTurnCompletes,
            showPlainTextWhilePreparing = showPlainTextWhilePreparing,
        )
    }
}

private val AgentProcessSizeAnimationSpec = spring<IntSize>(
    dampingRatio = Spring.DampingRatioNoBouncy,
    stiffness = Spring.StiffnessMediumLow,
)
