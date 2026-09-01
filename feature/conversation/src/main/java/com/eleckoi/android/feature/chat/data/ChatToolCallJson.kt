package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentCommandAction
import com.eleckoi.android.engine.agent.api.AgentFileChange
import com.eleckoi.android.engine.agent.api.AgentMessagePhase
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.chat.model.ChatToolCallRecord
import com.eleckoi.android.feature.chat.model.content.ToolCallState
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
internal data class ChatToolCallJson(
    @SerialName("call_id")
    val callId: String = "",
    val name: String = "",
    val arguments: String = "",
    val result: String = "",
    val state: String = "pending",
    @SerialName("work_item_type")
    val workItemType: String = "",
    val narrative: Boolean = false,
    @SerialName("file_changes")
    val fileChanges: List<AgentFileChange> = emptyList(),
    val paths: List<String> = emptyList(),
    val diff: String = "",
    @SerialName("turn_diff_observed")
    val turnDiffObserved: Boolean = false,
    @SerialName("message_phase")
    val messagePhase: String = "",
    @SerialName("phase_header")
    val phaseHeader: String = "",
    @SerialName("tool_name")
    val toolName: String = "",
    @SerialName("delegated_model")
    val delegatedModel: String = "",
    @SerialName("child_calls")
    val childCalls: List<ChatToolCallJson> = emptyList(),
    @SerialName("delegated_session_id")
    val delegatedSessionId: String = "",
    @SerialName("raw_command")
    val rawCommand: String = "",
    @SerialName("command_actions")
    val commandActions: List<AgentCommandAction> = emptyList(),
    @SerialName("started_at_millis")
    val startedAtMillis: Long = 0L,
    @SerialName("completed_at_millis")
    val completedAtMillis: Long? = null,
    @SerialName("rollback_on_abort")
    val rollbackOnAbort: Boolean = false,
) {
    fun toDomain(): ChatToolCallRecord = ChatToolCallRecord(
        callId = callId,
        name = name,
        arguments = arguments,
        result = result,
        state = ToolCallState.entries.firstOrNull { it.name.equals(state, ignoreCase = true) }
            ?: ToolCallState.Pending,
        workItemType = AgentWorkItemType.entries.firstOrNull {
            it.name.equals(workItemType, ignoreCase = true)
        },
        narrative = narrative,
        fileChanges = fileChanges,
        paths = paths,
        diff = diff,
        turnDiffObserved = turnDiffObserved,
        messagePhase = AgentMessagePhase.entries.firstOrNull {
            it.name.equals(messagePhase, ignoreCase = true)
        },
        phaseHeader = AgentMessagePhase.entries.firstOrNull {
            it.name.equals(phaseHeader, ignoreCase = true)
        },
        toolName = toolName,
        delegatedModel = delegatedModel,
        childCalls = childCalls.map(ChatToolCallJson::toDomain),
        delegatedSessionId = delegatedSessionId,
        rawCommand = rawCommand,
        commandActions = commandActions,
        startedAtMillis = startedAtMillis,
        completedAtMillis = completedAtMillis,
        rollbackOnAbort = rollbackOnAbort,
    )

    companion object {
        fun fromDomain(call: ChatToolCallRecord): ChatToolCallJson = ChatToolCallJson(
            callId = call.callId,
            name = call.name,
            arguments = call.arguments,
            result = call.result,
            state = call.state.name.lowercase(),
            workItemType = call.workItemType?.name.orEmpty(),
            narrative = call.narrative,
            fileChanges = call.fileChanges,
            paths = call.paths,
            diff = call.diff,
            turnDiffObserved = call.turnDiffObserved,
            messagePhase = call.messagePhase?.name.orEmpty(),
            phaseHeader = call.phaseHeader?.name.orEmpty(),
            toolName = call.toolName,
            delegatedModel = call.delegatedModel,
            childCalls = call.childCalls.map(ChatToolCallJson::fromDomain),
            delegatedSessionId = call.delegatedSessionId,
            rawCommand = call.rawCommand,
            commandActions = call.commandActions,
            startedAtMillis = call.startedAtMillis,
            completedAtMillis = call.completedAtMillis,
            rollbackOnAbort = call.rollbackOnAbort,
        )
    }
}
