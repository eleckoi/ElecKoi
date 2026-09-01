package com.eleckoi.android.feature.conversation.timeline.model

import com.eleckoi.android.engine.agent.api.AgentCommandAction
import com.eleckoi.android.engine.agent.api.AgentFileChange
import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.model.ChatUserImageAttachment
import java.util.UUID

enum class CreationTimelineKind { User, Assistant, Tool }

data class CreationTimelineItem(
    val id: String = UUID.randomUUID().toString(),
    val kind: CreationTimelineKind,
    val text: String,
    val detail: String = "",
    val running: Boolean = false,
    val failed: Boolean = false,
    val workItemId: String? = null,
    val workItemType: AgentWorkItemType? = null,
    val runtimeThreadId: String = "",
    val turnId: String? = null,
    val createdAtMillis: Long = 0L,
    /** Start of this processing attempt; regeneration must not rewrite the raw user timestamp. */
    val turnStartedAtMillis: Long = 0L,
    val completedAtMillis: Long? = null,
    val fileChanges: List<AgentFileChange> = emptyList(),
    val paths: List<String> = emptyList(),
    val diff: String = "",
    val turnDiffObserved: Boolean = false,
    val messagePhase: AgentMessagePhase? = null,
    /** Phase marker actually emitted by the model; null when phase was only inferred. */
    val phaseHeader: AgentMessagePhase? = null,
    val toolName: String = "",
    val toolArguments: String = "",
    val delegatedModel: String = "",
    /** Real native timeline emitted by the delegated child session. */
    val childTimeline: List<CreationTimelineItem> = emptyList(),
    val delegatedSessionId: String = "",
    val rawCommand: String = "",
    val commandActions: List<AgentCommandAction> = emptyList(),
    val inputImages: List<ChatUserImageAttachment> = emptyList(),
    /** Exact native Agent history items owned by this turn; hidden from presentation. */
    val modelHistoryItems: List<String> = emptyList(),
)

/**
 * A running-turn input accepted by the local UI but not yet committed as the Harness's official
 * UserMessage item. It is a preview, not part of the transcript.
 */
data class CreationPendingSteerInput(
    val id: String = UUID.randomUUID().toString(),
    val text: String,
    val submittedAtMillis: Long = System.currentTimeMillis(),
    val clientUserMessageId: String? = null,
)
