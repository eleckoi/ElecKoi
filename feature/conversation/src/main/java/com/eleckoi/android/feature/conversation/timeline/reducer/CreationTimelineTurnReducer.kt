package com.eleckoi.android.feature.conversation.timeline.reducer

import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.engine.agent.api.AgentWorkStatus
import com.eleckoi.android.feature.conversation.timeline.CreationActiveTimeline
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind

internal object CreationTimelineTurnReducer {
    fun attachTurnId(
        timeline: List<CreationTimelineItem>,
        threadId: String,
        turnId: String,
        startedAtMillis: Long,
    ): List<CreationTimelineItem> {
        val index = timeline.indexOfLast { it.kind == CreationTimelineKind.User && it.turnId == null }
        if (index < 0) return timeline
        return timeline.replaceTimelineItemAt(index) { item ->
            item.copy(
                runtimeThreadId = threadId,
                turnId = turnId,
                turnStartedAtMillis = item.turnStartedAtMillis.takeIf { it > 0L }
                    ?: startedAtMillis.takeIf { it > 0L }
                    ?: item.createdAtMillis,
            )
        }
    }

    /** Adds one durable, idempotent boundary for the real DSH model request. */
    fun startStep(
        timeline: List<CreationTimelineItem>,
        event: AgentSessionEvent.StepStarted,
    ): List<CreationTimelineItem> {
        val id = requestItemId(event.turnId, event.step)
        if (timeline.any { item -> item.id == id }) return timeline
        return timeline + CreationTimelineItem(
            id = id,
            kind = CreationTimelineKind.Tool,
            text = "请求 ${event.step}",
            running = true,
            workItemId = id,
            workItemType = AgentWorkItemType.Request,
            turnId = event.turnId,
            createdAtMillis = event.startedAtMillis.orCurrentTime(),
        )
    }

    /** Settles the request marker and streamed step work, excluding one-way host actions. */
    fun finishStep(
        timeline: List<CreationTimelineItem>,
        turnId: String,
        step: Int,
        completedAtMillis: Long,
    ): List<CreationTimelineItem> {
        val completedAt = completedAtMillis.orCurrentTime()
        val requestId = requestItemId(turnId, step)
        return timeline.map { item ->
            val isMatchingRequest = item.id == requestId
            val isUnfinishedStepWork =
                item.turnId == turnId &&
                    item.running &&
                    item.workItemType != AgentWorkItemType.Action &&
                    item.workItemType != AgentWorkItemType.Request
            if (isMatchingRequest || isUnfinishedStepWork) {
                item.copy(
                    running = false,
                    completedAtMillis = item.completedAtMillis ?: completedAt,
                )
            } else {
                item
            }
        }
    }

    fun finishTurn(
        timeline: List<CreationTimelineItem>,
        status: AgentWorkStatus,
        turnId: String? = null,
        diff: String = "",
        turnDiffObserved: Boolean = diff.isNotBlank(),
        completedAtMillis: Long = System.currentTimeMillis(),
    ): List<CreationTimelineItem> {
        if (timeline is CreationActiveTimeline) {
            return timeline.withActiveTurn(
                finishTurn(
                    timeline = timeline.activeTurn,
                    status = status,
                    turnId = turnId,
                    diff = diff,
                    turnDiffObserved = turnDiffObserved,
                    completedAtMillis = completedAtMillis,
                ),
            )
        }
        val startIndex = turnStartIndex(timeline, turnId)
        if (startIndex < 0) return timeline
        return timeline.mapIndexed { index, item ->
            if (index < startIndex) {
                item
            } else {
                val turnDidNotComplete = status != AgentWorkStatus.Completed
                val actionStillRunning =
                    status == AgentWorkStatus.Completed &&
                        item.workItemType == AgentWorkItemType.Action &&
                        item.running
                item.copy(
                    running = actionStillRunning,
                    failed = item.failed ||
                        (turnDidNotComplete && item.kind == CreationTimelineKind.User) ||
                        (status == AgentWorkStatus.Failed &&
                            item.kind == CreationTimelineKind.Tool &&
                            item.running),
                    turnId = item.turnId ?: turnId,
                    completedAtMillis = if (actionStillRunning) {
                        item.completedAtMillis
                    } else {
                        completedAtMillis
                    },
                    diff = if (index == startIndex && turnDiffObserved) diff else item.diff,
                    turnDiffObserved = item.turnDiffObserved ||
                        (index == startIndex && turnDiffObserved),
                )
            }
        }
    }

    fun updateTurnDiff(
        timeline: List<CreationTimelineItem>,
        turnId: String,
        diff: String,
    ): List<CreationTimelineItem> {
        val index = timeline.indexOfFirst { it.kind == CreationTimelineKind.User && it.turnId == turnId }
            .takeIf { it >= 0 }
            ?: timeline.indexOfLast { it.kind == CreationTimelineKind.User }
        if (index < 0) return timeline
        return timeline.replaceTimelineItemAt(index) { item ->
            item.copy(
                turnId = item.turnId ?: turnId,
                diff = diff,
                turnDiffObserved = true,
            )
        }
    }

    fun appendModelHistoryItem(
        timeline: List<CreationTimelineItem>,
        turnId: String,
        responseItemJson: String,
    ): List<CreationTimelineItem> {
        if (responseItemJson.isBlank()) return timeline
        val index = timeline.indexOfFirst {
            it.kind == CreationTimelineKind.User && it.turnId == turnId
        }.takeIf { it >= 0 } ?: timeline.indexOfLast {
            it.kind == CreationTimelineKind.User
        }
        if (index < 0) return timeline
        return timeline.replaceTimelineItemAt(index) { item ->
            item.copy(modelHistoryItems = item.modelHistoryItems + responseItemJson)
        }
    }

    private fun requestItemId(turnId: String, step: Int): String = "request-$turnId-$step"

    private fun turnStartIndex(timeline: List<CreationTimelineItem>, turnId: String?): Int {
        if (turnId != null) {
            val matching = timeline.indexOfFirst {
                it.kind == CreationTimelineKind.User && it.turnId == turnId
            }
            if (matching >= 0) return matching
            val matchingItem = timeline.indexOfFirst { it.turnId == turnId }
            if (matchingItem >= 0) return matchingItem
        }
        val latestUser = timeline.indexOfLast { it.kind == CreationTimelineKind.User }
        if (latestUser >= 0) return latestUser
        val firstRunning = timeline.indexOfFirst(CreationTimelineItem::running)
        return if (firstRunning >= 0) firstRunning else timeline.indices.firstOrNull() ?: -1
    }
}
