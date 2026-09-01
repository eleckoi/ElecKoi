package com.eleckoi.android.feature.conversation.timeline

import com.eleckoi.android.engine.agent.api.AgentCommandActionType
import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.engine.agent.api.runningCommandActionSummary
import com.eleckoi.android.engine.agent.api.singleTypeOrNull
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind

data class CreationTurnUi(
    val id: String,
    val user: CreationTimelineItem?,
    val processing: List<CreationTimelineItem>,
    val chronologicalTail: List<CreationTimelineItem>,
    val finalAnswer: CreationTimelineItem?,
    val running: Boolean,
    val startedAtMillis: Long,
    val completedAtMillis: Long?,
    val diff: String,
    val turnDiffObserved: Boolean,
    val paths: List<String>,
    val generatedMedia: List<CreatorGeneratedMediaResult> = emptyList(),
)

sealed interface CreationProcessBlock {
    data class Narrative(val item: CreationTimelineItem) : CreationProcessBlock
    data class Operations(val items: List<CreationTimelineItem>) : CreationProcessBlock
}

sealed interface CreationTailBlock {
    data class UserInput(val item: CreationTimelineItem) : CreationTailBlock
    data class Narrative(val item: CreationTimelineItem) : CreationTailBlock
    data class Operations(val items: List<CreationTimelineItem>) : CreationTailBlock
}

/**
 * The inline thinking row is only the empty-turn placeholder. Later Harness work lives
 * in a separate global status surface; synthesizing it inside our transcript creates a fake event.
 */
fun shouldShowInitialThinkingRow(
    blocks: List<CreationProcessBlock>,
    turnRunning: Boolean,
    hasFollowingChronologicalItems: Boolean = false,
): Boolean = turnRunning &&
    !hasFollowingChronologicalItems &&
    blocks.isEmpty()

fun List<CreationTimelineItem>.toCreationTurns(
    isRunning: Boolean,
    exposeStreamingFinalAnswer: Boolean = false,
): List<CreationTurnUi> {
    data class Segment(
        val user: CreationTimelineItem?,
        val items: List<CreationTimelineItem>,
    )

    val segments = mutableListOf<Segment>()
    var user: CreationTimelineItem? = null
    val items = mutableListOf<CreationTimelineItem>()
    fun flush() {
        if (user != null || items.isNotEmpty()) segments += Segment(user, items.toList())
        user = null
        items.clear()
    }

    forEach { item ->
        if (item.kind == CreationTimelineKind.User) {
            val belongsToCurrentTurn = user != null &&
                item.turnId != null &&
                item.turnId == user?.turnId
            if (belongsToCurrentTurn) {
                items += item
            } else {
                flush()
                user = item
            }
        } else {
            items += item
        }
    }
    flush()

    return segments.mapIndexed { index, segment ->
        val running = isRunning && index == segments.lastIndex
        val turnDidNotComplete = segment.user?.failed == true
        val hasDeclaredFinalAnswer = segment.items.any { item ->
            item.kind == CreationTimelineKind.Assistant &&
                item.phaseHeader == AgentMessagePhase.FinalAnswer
        }
        val declaredFinalIndex = segment.items.indexOfLast { item ->
            item.kind == CreationTimelineKind.Assistant &&
                item.phaseHeader == AgentMessagePhase.FinalAnswer &&
                item.text.isNotBlank()
        }
        val finalIndex = when {
            turnDidNotComplete -> -1
            // While a turn is live, messagePhase is only the transport's current guess. A tool
            // event can still reclassify that closed assistant item as commentary on the next
            // event. Only an explicit Final header is stable enough to move into the reply body.
            running -> if (exposeStreamingFinalAnswer) declaredFinalIndex else -1
            // Once a Final header exists, text before it can never be a fallback final answer —
            // including the frame where the marker has arrived but its body is still empty.
            hasDeclaredFinalAnswer -> declaredFinalIndex
            else -> segment.items.indexOfLast { item ->
                item.kind == CreationTimelineKind.Assistant &&
                    item.text.isNotBlank() &&
                    item.messagePhase != AgentMessagePhase.Commentary
            }
        }
        val finalAnswer = segment.items.getOrNull(finalIndex)
        val firstSupplementalInputIndex = segment.items.indexOfFirst {
            it.kind == CreationTimelineKind.User
        }
        // A committed steer is an ordinary App Server item inside this turn. Preserve the server
        // item order on both sides of that bubble; moving later tools back into `processing`
        // makes commands appear to run before the instruction that caused them.
        val processing = segment.items.filterIndexed { itemIndex, item ->
            itemIndex != finalIndex &&
                (firstSupplementalInputIndex < 0 || itemIndex < firstSupplementalInputIndex)
        }
        val chronologicalTail = segment.items.filterIndexed { itemIndex, item ->
            itemIndex != finalIndex &&
                firstSupplementalInputIndex >= 0 &&
                itemIndex >= firstSupplementalInputIndex
        }
        val allItems = listOfNotNull(segment.user) + segment.items
        val startedAt = segment.user?.turnStartedAtMillis?.takeIf { it > 0L }
            ?: segment.user?.createdAtMillis?.takeIf { it > 0L }
            ?: allItems.map(CreationTimelineItem::createdAtMillis).filter { it > 0L }.minOrNull()
            ?: 0L
        val recordedCompletedAt = allItems
            .mapNotNull(CreationTimelineItem::completedAtMillis)
            .maxOrNull()
        // Older failed attempts may have been persisted before their terminal timestamp was
        // committed. A terminal row must never fall back to the current wall clock, or its
        // "已处理" duration grows forever every time the screen is recreated.
        val completedAt = recordedCompletedAt ?: if (!running && turnDidNotComplete) {
            allItems
                .flatMap { item -> listOf(item.createdAtMillis, item.turnStartedAtMillis) }
                .filter { it > 0L }
                .maxOrNull()
                ?: startedAt.takeIf { it > 0L }
        } else {
            null
        }
        val latestTurnDiff = allItems.lastOrNull(CreationTimelineItem::turnDiffObserved)
        val generatedMedia = (processing + chronologicalTail)
            .mapNotNull(CreationTimelineItem::creatorGeneratedMediaResult)
            .distinctBy { it.assetId }
        CreationTurnUi(
            id = segment.user?.id ?: segment.items.firstOrNull()?.id ?: "turn-$index",
            user = segment.user,
            processing = processing,
            chronologicalTail = chronologicalTail,
            finalAnswer = finalAnswer,
            running = running,
            startedAtMillis = startedAt,
            completedAtMillis = completedAt,
            diff = latestTurnDiff?.diff
                ?: segment.user?.diff?.takeIf(String::isNotBlank)
                ?: allItems.lastOrNull { it.diff.isNotBlank() }?.diff.orEmpty(),
            turnDiffObserved = latestTurnDiff != null,
            paths = normalizeCreationWorkspacePaths(
                allItems.flatMap(CreationTimelineItem::paths),
            ),
            generatedMedia = generatedMedia,
        )
    }
}

/**
 * A steer is a committed user item inside the current Harness turn. Everything emitted after it
 * stays in event order instead of being re-bucketed into the earlier collapsible process area.
 */
fun List<CreationTimelineItem>.toChronologicalTailBlocks(): List<CreationTailBlock> {
    val result = mutableListOf<CreationTailBlock>()
    val pendingOperations = mutableListOf<CreationTimelineItem>()
    fun flushOperations() {
        val visibleOperations = pendingOperations.filterNot { item ->
            item.workItemType == AgentWorkItemType.Request
        }
        if (visibleOperations.isNotEmpty()) {
            result += CreationTailBlock.Operations(visibleOperations)
        }
        pendingOperations.clear()
    }
    forEach { item ->
        when (item.kind) {
            CreationTimelineKind.User -> {
                flushOperations()
                result += CreationTailBlock.UserInput(item)
            }
            CreationTimelineKind.Assistant -> {
                flushOperations()
                if (item.text.isNotBlank()) result += CreationTailBlock.Narrative(item)
            }
            CreationTimelineKind.Tool -> {
                if (item.workItemType == AgentWorkItemType.ContextCompaction) {
                    flushOperations()
                    result += CreationTailBlock.Operations(listOf(item))
                } else if (
                    item.workItemType != AgentWorkItemType.Reasoning ||
                    item.running ||
                    item.hasReasoningPhaseText() ||
                    item.detail.hasMeaningfulProcessDetail()
                ) {
                    pendingOperations += item
                }
            }
        }
    }
    flushOperations()
    return result
}

fun CreationTurnUi.resolveLiveDetailItems(
    source: CreationLiveDetailSource,
    latestItemOnly: Boolean,
    currentOperationGroup: Boolean,
    operationGroupAnchorId: String? = null,
): List<CreationTimelineItem> {
    val sourceItems = when (source) {
        CreationLiveDetailSource.Processing -> processing
        CreationLiveDetailSource.ChronologicalTail -> chronologicalTail
    }
    return when {
        currentOperationGroup -> when (source) {
            CreationLiveDetailSource.Processing -> sourceItems
                .toProcessBlocks()
                .filterIsInstance<CreationProcessBlock.Operations>()
                .resolveOperationGroup(operationGroupAnchorId)
            CreationLiveDetailSource.ChronologicalTail -> sourceItems
                .toChronologicalTailBlocks()
                .filterIsInstance<CreationTailBlock.Operations>()
                .resolveTailOperationGroup(operationGroupAnchorId)
        }
        latestItemOnly -> latestLiveDetailItems(sourceItems)
        else -> sourceItems
    }
}

fun List<CreationTimelineItem>.toProcessBlocks(): List<CreationProcessBlock> {
    val result = mutableListOf<CreationProcessBlock>()
    val pendingOperations = mutableListOf<CreationTimelineItem>()
    fun flushOperations() {
        val visibleOperations = pendingOperations.filterNot { item ->
            item.workItemType == AgentWorkItemType.Request
        }
        if (visibleOperations.isNotEmpty()) {
            result += CreationProcessBlock.Operations(visibleOperations)
        }
        pendingOperations.clear()
    }
    forEach { item ->
        when (item.kind) {
            CreationTimelineKind.Assistant -> {
                flushOperations()
                if (item.text.isNotBlank()) result += CreationProcessBlock.Narrative(item)
            }
            CreationTimelineKind.Tool -> {
                if (item.workItemType == AgentWorkItemType.ContextCompaction) {
                    flushOperations()
                    result += CreationProcessBlock.Operations(listOf(item))
                } else if (item.workItemType == AgentWorkItemType.Reasoning) {
                    if (
                        item.hasReasoningPhaseText() ||
                        item.detail.hasMeaningfulProcessDetail()
                    ) {
                        pendingOperations += item
                    }
                } else {
                    pendingOperations += item
                }
            }
            CreationTimelineKind.User -> Unit
        }
    }
    flushOperations()
    return result
}

fun runningOperationLabel(
    item: CreationTimelineItem?,
    hasStreamingAnswer: Boolean,
): String = when (item?.workItemType) {
    AgentWorkItemType.Command -> runningCommandActionSummary(
        actions = item.commandActions,
        rawCommand = item.rawCommand.ifBlank { item.text },
    )
    AgentWorkItemType.FileChange -> "正在编辑文件"
    AgentWorkItemType.ContextCompaction -> "正在自动压缩"
    AgentWorkItemType.Action -> item.text
        .takeIf(String::isNotBlank)
        ?.let { "正在$it" }
        ?: "正在执行动作"
    AgentWorkItemType.Tool, AgentWorkItemType.Unknown ->
        item.agentToolTimelinePresentation()?.title
            ?: item.toolName
                .takeIf(String::isNotBlank)
                ?.let { "正在调用 $it" }
            ?: "正在调用工具"
    // Reasoning reads the same whether or not the provider has streamed thought text yet. The old
    // "正在分析" split only told the reader which wire format arrived, which is not their concern.
    AgentWorkItemType.Reasoning -> "正在思考"
    else -> if (hasStreamingAnswer) "正在生成回复" else "正在思考"
}

fun visibleOuterProcessingItems(
    items: List<CreationTimelineItem>,
    turnRunning: Boolean,
): List<CreationTimelineItem> = if (turnRunning) {
    // Live events can overlap for a few frames: the next commentary/tool may arrive before the
    // previous tool's completion event. Removing that older running row made the process surface
    // shrink and then grow again when completion caught up. Keep the transcript append-only and
    // present superseded work as settled instead; the fixed-height status row can dissolve its
    // label in place without changing the bubble geometry.
    val latestVisibleIndex = items.indexOfLast { item ->
        when (item.kind) {
            CreationTimelineKind.Assistant -> item.text.isNotBlank()
            CreationTimelineKind.Tool -> true
            CreationTimelineKind.User -> false
        }
    }
    items.mapIndexedNotNull { index, item ->
        when (item.kind) {
            CreationTimelineKind.Assistant -> item.takeIf { it.text.isNotBlank() }
            CreationTimelineKind.Tool -> if (item.running && index < latestVisibleIndex) {
                item.copy(running = false)
            } else {
                item
            }
            CreationTimelineKind.User -> null
        }
    }
} else {
    items
}

fun latestLiveDetailItems(
    items: List<CreationTimelineItem>,
): List<CreationTimelineItem> {
    val workItems = items.filterNot { item -> item.workItemType == AgentWorkItemType.Request }
    return listOfNotNull(
        workItems.lastOrNull { item ->
            item.kind == CreationTimelineKind.Tool && item.running
        } ?: workItems.lastOrNull { item ->
            item.kind == CreationTimelineKind.Tool
        } ?: workItems.lastOrNull(),
    )
}

private fun List<CreationProcessBlock.Operations>.resolveOperationGroup(
    anchorId: String?,
): List<CreationTimelineItem> = if (anchorId == null) {
    lastOrNull()?.items.orEmpty()
} else {
    firstOrNull { block -> block.items.any { item -> item.id == anchorId } }?.items.orEmpty()
}

private fun List<CreationTailBlock.Operations>.resolveTailOperationGroup(
    anchorId: String?,
): List<CreationTimelineItem> = if (anchorId == null) {
    lastOrNull()?.items.orEmpty()
} else {
    firstOrNull { block -> block.items.any { item -> item.id == anchorId } }?.items.orEmpty()
}

fun List<CreationTimelineItem>.operationGroupAnchorId(): String? =
    firstOrNull { item -> item.workItemType != AgentWorkItemType.Request }?.id
        ?: firstOrNull()?.id

/**
 * Structural request/final markers remain available in details, but they do not replace the
 * actual work that happened beside them in a collapsed operation row. A lone FINAL marker still
 * gets its own terminal row; mixed with reasoning or tools, the work is the useful summary.
 */
internal fun operationPresentationItems(
    items: List<CreationTimelineItem>,
): List<CreationTimelineItem> {
    val workItems = items.filterNot { item -> item.workItemType == AgentWorkItemType.Request }
    val withoutFinalBoundary = workItems.filterNot(CreationTimelineItem::isFinalProtocolDetection)
    return withoutFinalBoundary.ifEmpty { workItems }
}

fun operationSummary(items: List<CreationTimelineItem>): String {
    val workItems = operationPresentationItems(items)
    workItems.singleOrNull()
        ?.takeIf { it.workItemType == AgentWorkItemType.Action }
        ?.let { action ->
            return when {
                action.running -> "正在${action.text.ifBlank { "执行动作" }}"
                action.failed -> "${action.text.ifBlank { "动作" }}失败"
                action.toolName == "generate_image" -> "已生成图片"
                else -> action.text.ifBlank { "已执行动作" }
            }
        }
    workItems.singleOrNull()
        ?.agentToolTimelinePresentation()
        ?.let { presentation -> return presentation.title }
    workItems.singleOrNull()
        ?.takeIf { it.workItemType == AgentWorkItemType.ContextCompaction }
        ?.let { compaction ->
            return when {
                compaction.running -> "正在自动压缩"
                compaction.failed -> "上下文自动压缩失败"
                else -> "上下文已自动压缩"
            }
        }
    val typeCounts = workItems.groupingBy(CreationTimelineItem::workItemType).eachCount()
    if (typeCounts.keys.singleOrNull() == AgentWorkItemType.Reasoning) {
        return "思考过程"
    }
    val parts = buildList {
        val fileItems = typeCounts[AgentWorkItemType.FileChange].orZero()
        if (fileItems > 0) {
            val fileCount = normalizeCreationWorkspacePaths(
                workItems.filter {
                    it.workItemType == AgentWorkItemType.FileChange
                }.flatMap(CreationTimelineItem::paths),
            ).size.takeIf { it > 0 } ?: fileItems
            add(if (fileCount == 1) "编辑了文件" else "编辑了多个文件")
        }
        val commandItems = workItems.filter { it.workItemType == AgentWorkItemType.Command }
        val readCommands = commandItems.filter(CreationTimelineItem::isReadOperation)
        if (readCommands.isNotEmpty()) {
            val readFileCount = readCommands
                .flatMap(CreationTimelineItem::readOperationPaths)
                .distinct()
                .size
                .takeIf { it > 0 }
                ?: readCommands.size
            add(if (readFileCount == 1) "读取了文件" else "读取了多个文件")
        }
        val searchCommands = commandItems.filter {
            it.commandActions.singleTypeOrNull() == AgentCommandActionType.Search
        }
        if (searchCommands.isNotEmpty()) {
            add(if (searchCommands.size == 1) "搜索了项目" else "执行了多次搜索")
        }
        val listCommands = commandItems.filter {
            it.commandActions.singleTypeOrNull() == AgentCommandActionType.ListFiles
        }
        if (listCommands.isNotEmpty()) {
            add(if (listCommands.size == 1) "查看了目录" else "查看了多个目录")
        }
        val commandCount =
            commandItems.size - readCommands.size - searchCommands.size - listCommands.size
        if (commandCount > 0) add(if (commandCount == 1) "运行了命令" else "运行了多个命令")
        val actionItems = workItems.filter { it.workItemType == AgentWorkItemType.Action }
        val generatedImages = actionItems.count { it.toolName == "generate_image" && !it.failed }
        if (generatedImages > 0) {
            add(if (generatedImages == 1) "生成了图片" else "生成了多张图片")
        }
        val otherActions = actionItems.size - generatedImages
        if (otherActions > 0) add(if (otherActions == 1) "执行了动作" else "执行了多个动作")
        val toolItems = workItems.filter {
            it.workItemType == AgentWorkItemType.Tool ||
                it.workItemType == AgentWorkItemType.Unknown
        }
        val searchCount = toolItems.count { it.toolName == "webSearch" }
        val imageViewCount = toolItems.count { it.toolName == "imageView" }
        val imageGenerationCount = toolItems.count { it.toolName == "imageGeneration" }
        toolItems
            .mapNotNull(CreationTimelineItem::agentToolTimelinePresentation)
            .map(AgentToolTimelinePresentation::title)
            .distinct()
            .forEach(::add)
        if (searchCount > 0) add(if (searchCount == 1) "搜索了网页" else "搜索了多次网页")
        if (imageViewCount > 0) add(if (imageViewCount == 1) "查看了图片" else "查看了多张图片")
        if (imageGenerationCount > 0) {
            add(if (imageGenerationCount == 1) "生成了图片" else "生成了多张图片")
        }
        val knownCharacterTools = toolItems.count {
            it.agentToolTimelinePresentation() != null
        }
        val otherTools = toolItems.size -
            searchCount -
            imageViewCount -
            imageGenerationCount -
            knownCharacterTools
        if (otherTools > 0) add(if (otherTools == 1) "调用了工具" else "调用了多个工具")
    }
    return parts.joinToString("，")
        .ifBlank { workItems.firstOrNull { item -> item.text.isNotBlank() }?.text.orEmpty() }
}

fun CreationTimelineItem.isFinalProtocolDetection(): Boolean =
    kind == CreationTimelineKind.Tool &&
        phaseHeader == AgentMessagePhase.FinalAnswer &&
        detail == "<FINAL>"

fun CreationTimelineItem.isReadOperation(): Boolean {
    if (workItemType != AgentWorkItemType.Command) return false
    return commandActions.isNotEmpty() &&
        commandActions.all { it.type == AgentCommandActionType.Read }
}

fun CreationTimelineItem.readOperationPaths(): List<String> {
    if (workItemType != AgentWorkItemType.Command) return emptyList()
    return commandActions
        .filter { it.type == AgentCommandActionType.Read }
        .mapNotNull { action -> action.path ?: action.name }
        .filter(String::isNotBlank)
        .distinct()
}

fun CreationTimelineItem.hasReasoningPhaseText(): Boolean {
    if (workItemType != AgentWorkItemType.Reasoning) return text.isNotBlank()
    return text.trim().isNotEmpty() && text.trim() !in ReasoningPlaceholderLabels
}

fun String.hasMeaningfulProcessDetail(): Boolean = trim().let { detail ->
    detail.isNotEmpty() && detail !in ProcessLifecycleLabels
}

fun formatCreationElapsedTime(durationMillis: Long): String {
    val totalSeconds = (durationMillis / 1_000L).coerceAtLeast(0L)
    val hours = totalSeconds / 3_600L
    val minutes = (totalSeconds % 3_600L) / 60L
    val seconds = totalSeconds % 60L
    return when {
        hours > 0L -> "${hours}h ${minutes}m ${seconds}s"
        minutes > 0L -> "${minutes}m ${seconds}s"
        else -> "${seconds}s"
    }
}

private fun Int?.orZero(): Int = this ?: 0

private val ReasoningPlaceholderLabels = setOf("分析任务", "思考过程", "正在思考", "完成")
private val ProcessLifecycleLabels = setOf("进行中", "完成", "失败", "已拒绝", "已停止", "已结束")
