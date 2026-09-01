package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatToolCallRecord
import com.eleckoi.android.feature.chat.model.content.ToolCallState
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import com.eleckoi.android.feature.conversation.timeline.toCreationTurns
import java.lang.ref.WeakReference

/**
 * Adapts the creator assistant's canonical timeline to the role chat storage shell.
 *
 * The reducer and its presentation split remain authoritative. Role chat only stores the
 * resulting process items in ChatToolCallRecord so its avatar/message shell can stay independent.
 */
internal fun ChatMessage.withCreationAgentTimeline(
    timeline: List<CreationTimelineItem>,
    turnRunning: Boolean,
    phaseMarkerProjector: AssistantPhaseMarkerProjector = AssistantPhaseMarkerProjector(),
): ChatMessage {
    // A declared final item can stream straight into the reply body. Without a real header, a
    // completed assistant item remains process narration until the turn itself settles: only then
    // do we know that no later tool call or Final marker can reclassify it.
    val turn = timeline.expandAssistantPhaseMarkers(phaseMarkerProjector).toCreationTurns(
        isRunning = turnRunning,
        exposeStreamingFinalAnswer = true,
    ).lastOrNull()
        ?: return copy(reasoningContent = "", toolCalls = emptyList())
    val finalText = turn.finalAnswer?.text?.takeIf(String::isNotBlank)
    // An interrupted turn never gets a canonical final item, and with nothing promoted early there
    // would be no reply left to show — only a process entry that collapses out of sight. Whatever
    // the character had actually said by then is the reply.
    val remainingItems = turn.processing + turn.chronologicalTail
    val finalBoundaryItem = (listOfNotNull(turn.finalAnswer) + remainingItems)
        .lastOrNull { item ->
            item.kind == CreationTimelineKind.Assistant &&
                item.phaseHeader == AgentMessagePhase.FinalAnswer
        }
    val declaredFinalHeaderPresent = remainingItems.any { item ->
        item.kind == CreationTimelineKind.Assistant &&
            item.phaseHeader == AgentMessagePhase.FinalAnswer
    }
    val interruptedText = if (!turnRunning && finalText == null) {
        remainingItems.lastOrNull { item ->
            item.kind == CreationTimelineKind.Assistant &&
                item.text.isNotBlank() &&
                (!declaredFinalHeaderPresent || item.phaseHeader == AgentMessagePhase.FinalAnswer)
        }?.text
    } else {
        null
    }
    val visibleContent = when {
        finalText != null -> finalText
        interruptedText != null -> interruptedText
        turnRunning -> ""
        else -> content
    }
    val processItems = (turn.processing + turn.chronologicalTail).filterNot { item ->
        // Protocol-only phase records have no user-facing content. They still classify the turn,
        // but the marker itself belongs to neither the process transcript nor the final reply.
        val emptyAssistantBoundary =
            item.kind == CreationTimelineKind.Assistant && item.text.isBlank()
        // An interrupted answer has no canonical final item, so its last streamed text falls back
        // to `content`. Do not also retain that exact same item as process narration.
        val duplicatedInterruptedAnswer =
            !turnRunning &&
                visibleContent.isNotBlank() &&
                item.kind == CreationTimelineKind.Assistant &&
                item.text == visibleContent
        emptyAssistantBoundary || duplicatedInterruptedAnswer
    }
    val processRecords = processItems.mapNotNull(CreationTimelineItem::toChatTimelineRecord) +
        listOfNotNull(finalBoundaryItem?.toFinalProtocolBoundaryRecord())
    return copy(
        // A provisional Chat Completions message can later be classified as commentary when its
        // tool calls arrive. Clear the old bubble immediately instead of showing the same text in
        // both the process timeline and the reply body.
        content = visibleContent,
        reasoningContent = "",
        toolCalls = processRecords,
        turnStartedAtMillis = turn.startedAtMillis,
        turnCompletedAtMillis = if (turnRunning) null else turn.completedAtMillis,
    )
}

private fun CreationTimelineItem.toChatTimelineRecord(): ChatToolCallRecord? {
    if (kind == CreationTimelineKind.User) return null
    val narrative = kind == CreationTimelineKind.Assistant
    return ChatToolCallRecord(
        callId = id,
        name = if (narrative) "处理思路" else text,
        result = if (narrative) text else detail,
        state = when {
            running -> ToolCallState.Running
            failed -> ToolCallState.Failed
            else -> ToolCallState.Succeeded
        },
        workItemType = workItemType,
        narrative = narrative,
        fileChanges = fileChanges,
        paths = paths,
        diff = diff,
        turnDiffObserved = turnDiffObserved,
        messagePhase = messagePhase,
        phaseHeader = phaseHeader,
        toolName = toolName,
        arguments = toolArguments,
        delegatedModel = delegatedModel,
        childCalls = childTimeline.mapNotNull(CreationTimelineItem::toChatTimelineRecord),
        delegatedSessionId = delegatedSessionId,
        rawCommand = rawCommand,
        commandActions = commandActions,
        startedAtMillis = createdAtMillis,
        completedAtMillis = completedAtMillis,
    )
}

private fun CreationTimelineItem.toFinalProtocolBoundaryRecord(): ChatToolCallRecord =
    ChatToolCallRecord(
        callId = "$id-protocol-final",
        name = "协议标识",
        result = "<FINAL>",
        state = ToolCallState.Succeeded,
        workItemType = AgentWorkItemType.AssistantMessage,
        narrative = true,
        messagePhase = AgentMessagePhase.FinalAnswer,
        phaseHeader = AgentMessagePhase.FinalAnswer,
        startedAtMillis = createdAtMillis,
        completedAtMillis = completedAtMillis ?: createdAtMillis,
    )

/**
 * A model may put commentary and its final answer in the same tool-free response. The streaming
 * transport still exposes that as one assistant item, so split its accumulated text at every real
 * ElecKoi marker before deciding which visual surface owns each segment.
 */
private fun List<CreationTimelineItem>.expandAssistantPhaseMarkers(
    phaseMarkerProjector: AssistantPhaseMarkerProjector,
): List<CreationTimelineItem> =
    flatMap { item ->
        if (item.kind != CreationTimelineKind.Assistant) {
            listOf(item)
        } else {
            phaseMarkerProjector.split(item)
        }
    }

/**
 * Incrementally locates role-play phase headers in the currently streaming assistant item.
 *
 * The turn projector reports append deltas before asking for a UI projection. That lets this
 * parser rescan only a short overlap plus the new fragment. Calls that do not follow that append
 * contract safely fall back to a full scan; the weak source reference avoids retaining a second
 * large copy of the current response merely for validation.
 */
internal class AssistantPhaseMarkerProjector {
    private val states = mutableMapOf<String, AssistantPhaseScanState>()

    internal var scannedCharacters: Long = 0L
        private set

    fun recordAppend(itemId: String, delta: String) {
        if (delta.isEmpty()) return
        val previous = states[itemId]
        if (previous == null) {
            states[itemId] = scanState(
                text = delta,
                sourceOffset = 0,
                retainedMarkers = emptyList(),
                awaitingProjection = true,
            )
            return
        }

        val overlapStart = (previous.sourceLength - MarkerScanOverlapCharacters).coerceAtLeast(0)
        val scanText = previous.sourceTail + delta
        states[itemId] = scanState(
            text = scanText,
            sourceOffset = overlapStart,
            retainedMarkers = previous.markers.filter { marker -> marker.start < overlapStart },
            awaitingProjection = true,
        )
    }

    fun split(item: CreationTimelineItem): List<CreationTimelineItem> {
        val text = item.text
        val cached = states[item.id]
        val sourceIsCurrent = cached?.sourceReference?.get() === text
        val expectedAppendProjection = cached != null &&
            cached.awaitingProjection &&
            cached.sourceLength == text.length &&
            text.endsWith(cached.sourceTail)
        val state = if (sourceIsCurrent || expectedAppendProjection) {
            cached.copy(
                sourceReference = WeakReference(text),
                awaitingProjection = false,
            ).also { states[item.id] = it }
        } else {
            scanState(
                text = text,
                sourceOffset = 0,
                retainedMarkers = emptyList(),
                awaitingProjection = false,
                sourceReference = WeakReference(text),
            ).also { states[item.id] = it }
        }
        return item.splitAtPhaseMarkers(state.markers)
    }

    private fun scanState(
        text: String,
        sourceOffset: Int,
        retainedMarkers: List<AssistantPhaseMarker>,
        awaitingProjection: Boolean,
        sourceReference: WeakReference<String> = WeakReference(null),
    ): AssistantPhaseScanState {
        scannedCharacters += text.length
        val scannedMarkers = AssistantPhaseMarkerRegex.findAll(text).map { match ->
            AssistantPhaseMarker(
                start = sourceOffset + match.range.first,
                endExclusive = sourceOffset + match.range.last + 1,
                phase = when (match.groupValues[1]) {
                    "COMMENTARY" -> AgentMessagePhase.Commentary
                    else -> AgentMessagePhase.FinalAnswer
                },
            )
        }.toList()
        val sourceLength = sourceOffset + text.length
        return AssistantPhaseScanState(
            sourceLength = sourceLength,
            sourceTail = text.takeLast(MarkerScanOverlapCharacters),
            markers = retainedMarkers + scannedMarkers,
            sourceReference = sourceReference,
            awaitingProjection = awaitingProjection,
        )
    }
}

private fun CreationTimelineItem.splitAtPhaseMarkers(
    markers: List<AssistantPhaseMarker>,
): List<CreationTimelineItem> {
    if (markers.isEmpty()) return listOf(copy(text = text.withTrailingMarkerPrefixHidden()))

    val segments = mutableListOf<AssistantPhaseSegment>()
    var cursor = 0
    var currentPhase = phaseHeader ?: messagePhase
    var currentHeader = phaseHeader
    markers.forEach { marker ->
        val beforeMarker = text.substring(cursor, marker.start)
            .removeOneTrailingLineBreak()
            .withoutClosingPhaseTags()
        if (beforeMarker.isNotEmpty() || currentHeader != null) {
            segments += AssistantPhaseSegment(
                text = beforeMarker,
                phase = currentPhase,
                header = currentHeader,
            )
        }
        currentPhase = marker.phase
        currentHeader = marker.phase
        cursor = marker.endExclusive
    }
    segments += AssistantPhaseSegment(
        text = text.substring(cursor)
            .withoutClosingPhaseTags()
            .withTrailingMarkerPrefixHidden(),
        phase = currentPhase,
        header = currentHeader,
    )

    return segments.mapIndexed { index, segment ->
        copy(
            id = if (index == 0) id else "$id-phase-$index",
            text = segment.text,
            running = running && index == segments.lastIndex,
            messagePhase = segment.phase,
            phaseHeader = segment.header,
        )
    }
}

private fun String.removeOneTrailingLineBreak(): String = when {
    endsWith("\r\n") -> dropLast(2)
    endsWith("\r") || endsWith("\n") -> dropLast(1)
    else -> this
}

private fun String.withTrailingMarkerPrefixHidden(): String {
    val hiddenCharacters = AssistantPhaseHeaders.maxOf { header ->
        (3 until header.length)
            .lastOrNull { prefixLength -> endsWith(header.take(prefixLength)) }
            ?: 0
    }
    return if (hiddenCharacters == 0) this else dropLast(hiddenCharacters)
}

private fun String.withoutClosingPhaseTags(): String =
    if (contains("</COMMENTARY>") || contains("</FINAL>")) {
        replace(AssistantPhaseClosingRegex, "")
    } else {
        this
    }

private data class AssistantPhaseSegment(
    val text: String,
    val phase: AgentMessagePhase?,
    val header: AgentMessagePhase?,
)

private data class AssistantPhaseMarker(
    val start: Int,
    val endExclusive: Int,
    val phase: AgentMessagePhase,
)

private data class AssistantPhaseScanState(
    val sourceLength: Int,
    val sourceTail: String,
    val markers: List<AssistantPhaseMarker>,
    val sourceReference: WeakReference<String>,
    val awaitingProjection: Boolean,
)

private val AssistantPhaseHeaders = listOf(
    "<COMMENTARY>",
    "</COMMENTARY>",
    "<FINAL>",
    "</FINAL>",
)

private val AssistantPhaseMarkerRegex = Regex(
    """<(COMMENTARY|FINAL)>(?:\r\n|[\r\n])?""",
)

private val AssistantPhaseClosingRegex = Regex(
    """(?:\r\n|[\r\n])?</(?:COMMENTARY|FINAL)>""",
)

private const val MarkerScanOverlapCharacters = 16
