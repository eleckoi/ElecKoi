package com.eleckoi.android.feature.conversation.timeline.ui.turn

/**
 * A chat narrative is prose and keeps the bubble's intrinsic width. Headers, explicit process
 * sheets, and real operation rows are document-like surfaces and use the available width.
 */
fun agentProcessFillsAvailableWidth(
    showHeader: Boolean,
    alwaysExpanded: Boolean,
    hasOperations: Boolean,
): Boolean = showHeader || alwaysExpanded || hasOperations

/**
 * An opened process sheet is a transcript, so a completed operation group must report what it
 * completed instead of inventing a "正在思考" gap while the enclosing turn remains live. The
 * compact assistant timeline keeps its paced gap state to avoid flashing summaries between calls.
 */
fun operationGroupUsesLiveStatus(
    turnRunning: Boolean,
    isLatestBlock: Boolean,
    alwaysExpanded: Boolean,
    groupIsRunning: Boolean,
): Boolean = turnRunning &&
    isLatestBlock &&
    (!alwaysExpanded || groupIsRunning)

/**
 * Only geometry that actually lives in a conversation list may temporarily own that list.
 * `alwaysExpanded` surfaces are already-open inspectors such as the process dialog; their lifecycle
 * is unrelated to the LazyColumn inherited through the composition tree.
 */
fun shouldOwnStaticListExpansion(
    alwaysExpanded: Boolean,
    collapsingAfterRun: Boolean,
    expanded: Boolean,
    turnRunning: Boolean,
    manuallyControlled: Boolean,
): Boolean = !alwaysExpanded &&
    (collapsingAfterRun || (expanded && !turnRunning && manuallyControlled))

/**
 * The provisional narrative and the final answer are two render owners fed by separate DSH state
 * updates. Automatic collapse is legal only after the replacement owner has actual text; otherwise
 * terminal settlement leaves the conversation with neither owner visible for one or more frames.
 */
fun processedTurnExpanded(
    alwaysExpanded: Boolean,
    manuallyControlled: Boolean,
    expandedState: Boolean,
    turnRunning: Boolean,
    finalAnswerReady: Boolean,
    /**
     * Keeps the process body mounted while a running turn hands its measured height to the
     * durable final-answer owner. The flag is deliberately separate from [expandedState]: the
     * latter is the user's persistent choice, while this is a one-frame terminal hand-off.
     */
    terminalHandoffPending: Boolean = false,
): Boolean = alwaysExpanded || if (manuallyControlled) {
    expandedState
} else {
    turnRunning || !finalAnswerReady || terminalHandoffPending
}

const val ProcessedTurnCollapseDurationMillis = 190
