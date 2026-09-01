package com.eleckoi.android.engine.agent.remotedsh

import com.eleckoi.android.engine.agent.api.AgentApprovalDecision
import com.eleckoi.android.engine.agent.api.AgentApprovalKind
import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.serialization.json.JsonObject

/** Tracks remote approval RPC ownership and builds the corresponding native timeline events. */
internal class RemoteDshApprovalRegistry {
    private val pending = ConcurrentHashMap<Long, PendingRemoteDshApproval>()
    private val requestIds = AtomicLong(1L)

    fun clear() {
        pending.clear()
    }

    fun takeResponse(
        requestId: Long,
        decision: AgentApprovalDecision,
    ): RemoteDshApprovalResponse? {
        val approval = pending.remove(requestId) ?: return null
        val outcome = when (decision) {
            AgentApprovalDecision.Accept, AgentApprovalDecision.AcceptForSession -> "approved"
            AgentApprovalDecision.Decline, AgentApprovalDecision.Cancel -> "rejected"
        }
        return RemoteDshApprovalResponse(approval, outcome)
    }

    fun requested(
        rpcId: String,
        payload: JsonObject,
        activeTurnId: String?,
    ): RemoteDshEvent? {
        val sessionId = payload.string("sessionId") ?: return null
        val approvalId = payload.string("approvalId") ?: return null
        val requestId = requestIds.getAndIncrement()
        val toolName = payload.string("toolName").orEmpty()
        val callId = payload.string("callId")
        val kind = when (toolName.lowercase()) {
            "bash" -> AgentApprovalKind.Command
            "write", "edit" -> AgentApprovalKind.FileChange
            else -> AgentApprovalKind.Other
        }
        pending[requestId] = PendingRemoteDshApproval(rpcId, approvalId, sessionId)
        return RemoteDshEvent(
            sessionId = sessionId,
            sequence = null,
            event = AgentSessionEvent.ApprovalRequested(
                requestId = requestId,
                kind = kind,
                threadId = sessionId,
                turnId = activeTurnId ?: "$sessionId:approval",
                itemId = callId ?: "approval-$requestId",
                title = when (kind) {
                    AgentApprovalKind.Command -> "允许电脑执行受限命令？"
                    AgentApprovalKind.FileChange -> "允许电脑修改受限文件？"
                    AgentApprovalKind.Other -> "允许电脑 DSH 扩大权限？"
                },
                detail = payload.string("reason") ?: "电脑上的 DSH 正在请求临时扩大权限",
                availableDecisions = listOf(
                    AgentApprovalDecision.Accept,
                    AgentApprovalDecision.Decline,
                ),
            ),
        )
    }

    fun resolved(payload: JsonObject): RemoteDshEvent? {
        val approvalId = payload.string("approvalId") ?: return null
        val sessionId = payload.string("sessionId") ?: return null
        val row = pending.entries.firstOrNull { it.value.approvalId == approvalId } ?: return null
        pending.remove(row.key)
        return RemoteDshEvent(
            sessionId = sessionId,
            sequence = null,
            event = AgentSessionEvent.ApprovalResolved(row.key, sessionId),
        )
    }
}

internal data class PendingRemoteDshApproval(
    val rpcId: String,
    val approvalId: String,
    val sessionId: String,
)

internal data class RemoteDshApprovalResponse(
    val approval: PendingRemoteDshApproval,
    val outcome: String,
)
