package com.eleckoi.android.feature.chat.ui.message

import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.conversation.timeline.AgentPlanStepStatus
import com.eleckoi.android.feature.conversation.timeline.AgentPlanUpdatePresentation
import com.eleckoi.android.feature.conversation.timeline.CreationDetailPayload
import com.eleckoi.android.feature.conversation.timeline.CreationTurnUi
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.operationGroupAnchorId
import com.eleckoi.android.feature.conversation.timeline.resolveLiveDetailItems

internal fun CreationDetailPayload.bindToLiveChatProcess(
    messageId: String,
    turnRunning: Boolean,
    activePlanUpdateId: String?,
): CreationDetailPayload = copy(
    sourceTurnId = messageId,
    activePlanUpdateId = activePlanUpdateId,
    liveTurnId = messageId.takeIf { turnRunning && liveTurnId != null },
    liveOperationGroupAnchorId = liveOperationGroupAnchorId
        ?: items.operationGroupAnchorId().takeIf { liveCurrentOperationGroup },
)

internal fun CreationDetailPayload.refreshFromLiveChatProcess(
    messageId: String,
    timelineItems: List<CreationTimelineItem>,
    turnRunning: Boolean,
    activePlanUpdateId: String?,
): CreationDetailPayload = if (liveTurnId == messageId) {
    val turnDiff = timelineItems
        .asReversed()
        .firstOrNull { item -> item.diff.isNotBlank() }
        ?.diff
        .orEmpty()
    val liveItems = CreationTurnUi(
        id = messageId,
        user = null,
        processing = timelineItems,
        chronologicalTail = emptyList(),
        finalAnswer = null,
        running = turnRunning,
        startedAtMillis = 0L,
        completedAtMillis = null,
        diff = turnDiff,
        turnDiffObserved = timelineItems.any { item -> item.turnDiffObserved },
        paths = timelineItems.flatMap { item -> item.paths }.distinct(),
    ).resolveLiveDetailItems(
        source = liveSource,
        latestItemOnly = liveLatestItemOnly,
        currentOperationGroup = liveCurrentOperationGroup,
        operationGroupAnchorId = liveOperationGroupAnchorId,
    )
    copy(
        items = liveItems,
        diff = if (liveLatestItemOnly || liveCurrentOperationGroup) {
            liveItems.asReversed().firstOrNull { item -> item.diff.isNotBlank() }?.diff.orEmpty()
        } else {
            turnDiff
        },
        activePlanUpdateId = activePlanUpdateId,
        liveTurnId = messageId.takeIf { turnRunning },
    )
} else {
    copy(activePlanUpdateId = activePlanUpdateId)
}

internal fun ChatMessage.hasAcceptedRoleplayFinalBody(): Boolean =
    !pending &&
        content.isNotBlank() &&
        toolCalls.any { call ->
            call.narrative &&
                call.phaseHeader == AgentMessagePhase.FinalAnswer &&
                call.result == "<FINAL>"
        }

internal fun AgentPlanUpdatePresentation.withAutoCompletedRoleplayFinal(
    enabled: Boolean,
): AgentPlanUpdatePresentation {
    if (!enabled || steps.isEmpty()) return this
    return copy(
        steps = steps.mapIndexed { index, step ->
            if (index == steps.lastIndex) {
                step.copy(status = AgentPlanStepStatus.Completed)
            } else {
                step
            }
        },
    )
}

internal enum class RoleplayProtocolTraceState(val label: String) {
    Recognized("已识别"),
    Waiting("等待输出"),
    Missing("未识别"),
}

internal data class RoleplayProtocolTrace(
    val tag: String,
    val state: RoleplayProtocolTraceState,
)

internal fun ChatMessage.roleplayProtocolTrace(): List<RoleplayProtocolTrace> {
    val actionTraces = toolCalls
        .asSequence()
        .filter { call ->
            call.workItemType == AgentWorkItemType.Action && call.toolName.isNotBlank()
        }
        .map { call ->
            RoleplayProtocolTrace(
                tag = "<ACTION_CALL name=\"${call.toolName}\">",
                state = RoleplayProtocolTraceState.Recognized,
            )
        }
        .distinctBy(RoleplayProtocolTrace::tag)
        .toList()
    val finalRecognized = toolCalls.any { call ->
        call.narrative &&
            call.phaseHeader == AgentMessagePhase.FinalAnswer &&
            call.result == "<FINAL>"
    }
    val finalTrace = RoleplayProtocolTrace(
        tag = "<FINAL>",
        state = when {
            finalRecognized -> RoleplayProtocolTraceState.Recognized
            pending -> RoleplayProtocolTraceState.Waiting
            else -> RoleplayProtocolTraceState.Missing
        },
    )
    return actionTraces + finalTrace
}
