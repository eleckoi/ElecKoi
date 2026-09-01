package com.eleckoi.android.feature.conversation.timeline.reducer

import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind

internal object CreationTimelineMessageReducer {
    fun appendAssistantDelta(
        timeline: List<CreationTimelineItem>,
        turnId: String,
        itemId: String,
        delta: String,
        messagePhase: AgentMessagePhase?,
        phaseHeader: AgentMessagePhase?,
    ): List<CreationTimelineItem> {
        if (delta.isEmpty() && phaseHeader == null) return timeline
        val projectedTimeline = stopRunningReasoning(
            timeline = timeline,
            exceptItemId = itemId,
        )
        val index = projectedTimeline.indexOfLast {
            it.kind == CreationTimelineKind.Assistant && it.workItemId == itemId
        }
        if (index < 0) {
            return projectedTimeline + CreationTimelineItem(
                id = "assistant-$itemId",
                kind = CreationTimelineKind.Assistant,
                text = delta,
                running = true,
                workItemId = itemId,
                workItemType = AgentWorkItemType.AssistantMessage,
                turnId = turnId,
                createdAtMillis = System.currentTimeMillis(),
                messagePhase = messagePhase,
                phaseHeader = phaseHeader,
            )
        }
        return projectedTimeline.replaceTimelineItemAt(index) { item ->
            item.copy(
                text = item.text + delta,
                running = true,
                messagePhase = messagePhase ?: item.messagePhase,
                phaseHeader = phaseHeader ?: item.phaseHeader,
            )
        }
    }

    fun updateReasoning(
        timeline: List<CreationTimelineItem>,
        turnId: String,
        itemId: String,
        updateText: (String) -> String = { it },
        updateDetail: (String) -> String = { it },
    ): List<CreationTimelineItem> {
        val index = timeline.indexOfLast { it.workItemId == itemId }
        if (index >= 0) {
            return timeline.replaceTimelineItemAt(index) { item ->
                item.copy(
                    text = updateText(item.text),
                    detail = updateDetail(item.detail),
                    running = true,
                )
            }
        }
        return timeline + CreationTimelineItem(
            id = "work-$itemId",
            kind = CreationTimelineKind.Tool,
            text = updateText(""),
            detail = updateDetail(""),
            running = true,
            workItemId = itemId,
            workItemType = AgentWorkItemType.Reasoning,
            turnId = turnId,
            createdAtMillis = System.currentTimeMillis(),
        )
    }

    fun stopRunningReasoning(
        timeline: List<CreationTimelineItem>,
        exceptItemId: String? = null,
        completedAtMillis: Long = System.currentTimeMillis(),
    ): List<CreationTimelineItem> = timeline.map { item ->
        if (
            item.workItemType == AgentWorkItemType.Reasoning &&
            item.workItemId != exceptItemId &&
            item.running
        ) {
            item.copy(running = false, completedAtMillis = completedAtMillis)
        } else {
            item
        }
    }

    /** Binds the submitted prompt once and appends official mid-turn steers in server event order. */
    fun upsertCommittedUserMessage(
        timeline: List<CreationTimelineItem>,
        turnId: String,
        itemId: String,
        clientUserMessageId: String?,
        text: String,
        createdAtMillis: Long,
        completedAtMillis: Long? = null,
    ): List<CreationTimelineItem> {
        val officialClientItemId = clientUserMessageId?.let { "user-$it" }
        val existingItemIndex = timeline.indexOfLast {
            it.kind == CreationTimelineKind.User &&
                (it.workItemId == itemId || it.id == officialClientItemId)
        }
        if (existingItemIndex >= 0) {
            val existing = timeline[existingItemIndex]
            val committed = existing.copy(
                text = text.ifBlank { existing.text },
                workItemId = itemId,
                workItemType = AgentWorkItemType.UserMessage,
                turnId = turnId,
                createdAtMillis = existing.createdAtMillis,
                completedAtMillis = completedAtMillis ?: existing.completedAtMillis,
            )
            return timeline.replaceTimelineItemAt(existingItemIndex) { committed }
        }
        val exactSubmittedPromptIndex = timeline.indexOfFirst {
            it.kind == CreationTimelineKind.User &&
                it.turnId == turnId &&
                it.workItemId == null &&
                (text.isBlank() || it.text == text)
        }
        val submittedPromptIndex = exactSubmittedPromptIndex.takeIf { it >= 0 }
            ?: timeline.indexOfFirst {
                it.kind == CreationTimelineKind.User &&
                    it.turnId == turnId &&
                    it.workItemId == null
            }
        if (submittedPromptIndex >= 0) {
            return timeline.replaceTimelineItemAt(submittedPromptIndex) { item ->
                item.copy(
                    text = text.ifBlank { item.text },
                    workItemId = itemId,
                    workItemType = AgentWorkItemType.UserMessage,
                    completedAtMillis = completedAtMillis ?: item.completedAtMillis,
                )
            }
        }
        if (text.isBlank()) return timeline
        return timeline + CreationTimelineItem(
            id = officialClientItemId ?: "user-$itemId",
            kind = CreationTimelineKind.User,
            text = text,
            workItemId = itemId,
            workItemType = AgentWorkItemType.UserMessage,
            turnId = turnId,
            createdAtMillis = createdAtMillis,
            completedAtMillis = completedAtMillis,
        )
    }
}
