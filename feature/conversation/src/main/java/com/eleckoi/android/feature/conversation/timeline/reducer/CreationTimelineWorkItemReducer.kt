package com.eleckoi.android.feature.conversation.timeline.reducer

import com.eleckoi.android.engine.agent.api.AgentFileChange
import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.engine.agent.api.AgentWorkStatus
import com.eleckoi.android.engine.agent.api.commandActionSummary
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import com.eleckoi.android.feature.conversation.timeline.normalizeCreationWorkspacePaths

internal object CreationTimelineWorkItemReducer {
    fun startWorkItem(
        timeline: List<CreationTimelineItem>,
        event: AgentSessionEvent.WorkItemStarted,
    ): List<CreationTimelineItem> {
        if (event.type == AgentWorkItemType.UserMessage) {
            return CreationTimelineMessageReducer.upsertCommittedUserMessage(
                timeline = timeline,
                turnId = event.turnId,
                itemId = event.itemId,
                clientUserMessageId = event.clientUserMessageId,
                text = event.label,
                createdAtMillis = event.startedAtMillis.orCurrentTime(),
            )
        }
        val projectedTimeline = CreationTimelineMessageReducer.stopRunningReasoning(
            timeline = timeline,
            exceptItemId = event.itemId,
        )
        val index = projectedTimeline.indexOfLast { it.workItemId == event.itemId }
        if (event.type == AgentWorkItemType.AssistantMessage) {
            if (index < 0) {
                return projectedTimeline + CreationTimelineItem(
                    id = "assistant-${event.itemId}",
                    kind = CreationTimelineKind.Assistant,
                    text = "",
                    running = true,
                    workItemId = event.itemId,
                    workItemType = event.type,
                    turnId = event.turnId,
                    createdAtMillis = event.startedAtMillis.orCurrentTime(),
                    messagePhase = event.messagePhase,
                )
            }
            return projectedTimeline.replaceTimelineItemAt(index) { existing ->
                existing.copy(
                    running = true,
                    turnId = event.turnId,
                    createdAtMillis = event.startedAtMillis.takeIf { it > 0L }
                        ?: existing.createdAtMillis,
                    messagePhase = event.messagePhase ?: existing.messagePhase,
                )
            }
        }
        val item = CreationTimelineItem(
            id = "work-${event.itemId}",
            kind = CreationTimelineKind.Tool,
            text = if (event.type == AgentWorkItemType.Reasoning) {
                ""
            } else {
                event.label.ifBlank { defaultTimelineLabel(event.type) }
            },
            running = true,
            workItemId = event.itemId,
            workItemType = event.type,
            turnId = event.turnId,
            createdAtMillis = event.startedAtMillis.orCurrentTime(),
            fileChanges = normalizeTimelineFileChanges(event.fileChanges),
            paths = event.normalizedFileChangePaths(),
            diff = event.diff,
            toolName = event.toolName,
            toolArguments = event.toolArguments,
            delegatedModel = event.delegatedModel,
            rawCommand = event.rawCommand,
            commandActions = event.commandActions,
        )
        return if (index < 0) {
            projectedTimeline + item
        } else {
            projectedTimeline.replaceTimelineItemAt(index) { existing ->
                existing.copy(
                    text = if (event.type == AgentWorkItemType.Reasoning) {
                        existing.text
                    } else {
                        event.label.ifBlank {
                            existing.text.ifBlank { defaultTimelineLabel(event.type) }
                        }
                    },
                    running = true,
                    workItemType = event.type,
                    turnId = event.turnId,
                    createdAtMillis = event.startedAtMillis.takeIf { it > 0L }
                        ?: existing.createdAtMillis,
                    fileChanges = latestTimelineFileChanges(existing.fileChanges, event.fileChanges),
                    paths = normalizeCreationWorkspacePaths(
                        existing.paths + event.paths + event.fileChanges.map(AgentFileChange::path),
                    ),
                    diff = event.diff.ifBlank { existing.diff },
                    toolName = event.toolName.ifBlank { existing.toolName },
                    toolArguments = event.toolArguments.ifBlank { existing.toolArguments },
                    delegatedModel = event.delegatedModel.ifBlank { existing.delegatedModel },
                    rawCommand = event.rawCommand.ifBlank { existing.rawCommand },
                    commandActions = event.commandActions.ifEmpty { existing.commandActions },
                )
            }
        }
    }

    fun completeWorkItem(
        timeline: List<CreationTimelineItem>,
        event: AgentSessionEvent.WorkItemCompleted,
    ): List<CreationTimelineItem> {
        if (event.type == AgentWorkItemType.AssistantMessage) {
            val index = timeline.indexOfLast {
                it.kind == CreationTimelineKind.Assistant && it.workItemId == event.itemId
            }
            if (index >= 0) {
                return timeline.replaceTimelineItemAt(index) { item ->
                    item.copy(
                        text = item.text.ifBlank { event.summary },
                        running = false,
                        failed = event.status == AgentWorkStatus.Failed,
                        completedAtMillis = event.completedAtMillis.orCurrentTime(),
                        messagePhase = event.messagePhase ?: item.messagePhase,
                    )
                }
            }
            if (event.summary.isBlank()) return timeline
            return timeline + CreationTimelineItem(
                id = "assistant-${event.itemId}",
                kind = CreationTimelineKind.Assistant,
                text = event.summary,
                failed = event.status == AgentWorkStatus.Failed,
                workItemId = event.itemId,
                workItemType = event.type,
                turnId = event.turnId,
                createdAtMillis = event.completedAtMillis.orCurrentTime(),
                completedAtMillis = event.completedAtMillis.orCurrentTime(),
                messagePhase = event.messagePhase,
            )
        }
        if (event.type == AgentWorkItemType.UserMessage) {
            return CreationTimelineMessageReducer.upsertCommittedUserMessage(
                timeline = timeline,
                turnId = event.turnId,
                itemId = event.itemId,
                clientUserMessageId = event.clientUserMessageId,
                text = event.summary,
                createdAtMillis = event.completedAtMillis.orCurrentTime(),
                completedAtMillis = event.completedAtMillis.orCurrentTime(),
            )
        }

        val index = timeline.indexOfLast { it.workItemId == event.itemId }
        if (index >= 0) {
            return timeline.replaceTimelineItemAt(index) { item ->
                val summary = event.summary.trim()
                val reportedDetail = event.detail.trim()
                val completionDetail = when (event.type) {
                    AgentWorkItemType.Reasoning -> mergeFallbackDetail(item.detail, reportedDetail)
                    AgentWorkItemType.ContextCompaction -> reportedDetail.ifBlank { summary }
                    else -> appendUniqueDetail(
                        current = item.detail,
                        additions = listOfNotNull(
                            summary.takeIf(String::isNotEmpty),
                            event.exitCode?.let { "exit $it" },
                        ),
                    )
                }
                item.copy(
                    text = if (event.type == AgentWorkItemType.Reasoning) {
                        if (event.completionTextIsAuthoritative) summary else item.text.ifBlank { summary }
                    } else if (event.type == AgentWorkItemType.ContextCompaction) {
                        summary.ifBlank { item.text.ifBlank { defaultTimelineLabel(event.type) } }
                    } else {
                        item.text
                    },
                    detail = completionDetail,
                    paths = if (event.type == AgentWorkItemType.FileChange) {
                        normalizeCreationWorkspacePaths(
                            item.paths + event.paths + event.fileChanges.map(AgentFileChange::path),
                        )
                    } else {
                        item.paths
                    },
                    fileChanges = if (event.type == AgentWorkItemType.FileChange) {
                        latestTimelineFileChanges(item.fileChanges, event.fileChanges)
                    } else {
                        item.fileChanges
                    },
                    diff = if (event.type == AgentWorkItemType.FileChange) {
                        event.diff.ifBlank { item.diff }
                    } else {
                        item.diff
                    },
                    running = false,
                    failed = event.status == AgentWorkStatus.Failed || event.status == AgentWorkStatus.Declined,
                    completedAtMillis = event.completedAtMillis.orCurrentTime(),
                    toolName = event.toolName.ifBlank { item.toolName },
                    toolArguments = event.toolArguments.ifBlank { item.toolArguments },
                    delegatedModel = event.delegatedModel.ifBlank { item.delegatedModel },
                    rawCommand = event.rawCommand.ifBlank { item.rawCommand },
                    commandActions = event.commandActions.ifEmpty { item.commandActions },
                )
            }
        }
        val summary = event.summary.trim()
        val completionDetail = when (event.type) {
            AgentWorkItemType.Reasoning -> event.detail.trim()
            AgentWorkItemType.ContextCompaction -> event.detail.trim().ifBlank { summary }
            else -> appendUniqueDetail(
                current = "",
                additions = listOfNotNull(
                    summary.takeIf(String::isNotEmpty),
                    event.exitCode?.let { "exit $it" },
                ),
            )
        }
        return timeline + CreationTimelineItem(
            id = "work-${event.itemId}",
            kind = CreationTimelineKind.Tool,
            text = when (event.type) {
                AgentWorkItemType.Reasoning -> summary
                AgentWorkItemType.Command -> commandActionSummary(event.commandActions, event.rawCommand)
                AgentWorkItemType.Tool -> event.detail.ifBlank { defaultTimelineLabel(event.type) }
                AgentWorkItemType.ContextCompaction ->
                    event.summary.ifBlank { defaultTimelineLabel(event.type) }
                else -> defaultTimelineLabel(event.type)
            },
            detail = completionDetail,
            failed = event.status == AgentWorkStatus.Failed || event.status == AgentWorkStatus.Declined,
            workItemId = event.itemId,
            workItemType = event.type,
            turnId = event.turnId,
            fileChanges = normalizeTimelineFileChanges(event.fileChanges),
            paths = event.normalizedFileChangePaths(),
            diff = event.diff,
            toolName = event.toolName,
            toolArguments = event.toolArguments,
            delegatedModel = event.delegatedModel,
            rawCommand = event.rawCommand,
            commandActions = event.commandActions,
            createdAtMillis = event.completedAtMillis.orCurrentTime(),
            completedAtMillis = event.completedAtMillis.orCurrentTime(),
        )
    }

    fun updateFileChanges(
        timeline: List<CreationTimelineItem>,
        event: AgentSessionEvent.FileChangesUpdated,
    ): List<CreationTimelineItem> {
        val index = timeline.indexOfLast { it.workItemId == event.itemId }
        if (index < 0) {
            return timeline + CreationTimelineItem(
                id = "work-${event.itemId}",
                kind = CreationTimelineKind.Tool,
                text = defaultTimelineLabel(AgentWorkItemType.FileChange),
                running = true,
                workItemId = event.itemId,
                workItemType = AgentWorkItemType.FileChange,
                turnId = event.turnId,
                createdAtMillis = System.currentTimeMillis(),
                fileChanges = normalizeTimelineFileChanges(event.fileChanges),
                paths = normalizeCreationWorkspacePaths(
                    event.paths + event.fileChanges.map(AgentFileChange::path),
                ),
                diff = event.diff,
            )
        }
        return timeline.replaceTimelineItemAt(index) { item ->
            item.copy(
                fileChanges = latestTimelineFileChanges(item.fileChanges, event.fileChanges),
                paths = normalizeCreationWorkspacePaths(
                    item.paths + event.paths + event.fileChanges.map(AgentFileChange::path),
                ),
                diff = event.diff.ifBlank { item.diff },
            )
        }
    }

    fun updateDetail(
        timeline: List<CreationTimelineItem>,
        itemId: String,
        update: (String) -> String,
    ): List<CreationTimelineItem> {
        val index = timeline.indexOfLast { it.workItemId == itemId }
        if (index < 0) return timeline
        return timeline.replaceTimelineItemAt(index) { item -> item.copy(detail = update(item.detail)) }
    }
}
