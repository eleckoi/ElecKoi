package com.eleckoi.android.feature.studio.ui.assistant.approval

import com.eleckoi.android.engine.agent.api.AgentApprovalDecision
import com.eleckoi.android.engine.agent.api.AgentApprovalKind
import com.eleckoi.android.feature.studio.ui.assistant.CreationApprovalRequest

internal fun creationApprovalDecisionLabel(
    approval: CreationApprovalRequest,
    decision: AgentApprovalDecision,
): String = when (decision) {
    AgentApprovalDecision.Accept -> when (approval.kind) {
        AgentApprovalKind.FileChange -> "仅允许本次修改"
        AgentApprovalKind.Command -> "仅允许本次执行"
        AgentApprovalKind.Other -> "仅允许本次操作"
    }
    AgentApprovalDecision.AcceptForSession -> when (approval.kind) {
        AgentApprovalKind.FileChange -> "对这些文件不再询问"
        AgentApprovalKind.Command -> "本会话内不再询问"
        AgentApprovalKind.Other -> "本会话内允许"
    }
    AgentApprovalDecision.Decline -> "拒绝并继续"
    AgentApprovalDecision.Cancel -> "拒绝并调整做法"
}
