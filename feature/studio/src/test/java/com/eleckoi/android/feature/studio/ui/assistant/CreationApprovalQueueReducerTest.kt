package com.eleckoi.android.feature.studio.ui.assistant

import com.eleckoi.android.feature.conversation.markdown.*
import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.model.*
import com.eleckoi.android.feature.conversation.timeline.ui.*

import com.eleckoi.android.engine.agent.api.AgentApprovalDecision
import com.eleckoi.android.engine.agent.api.AgentApprovalKind
import com.eleckoi.android.feature.studio.ui.assistant.approval.CreationApprovalQueueReducer
import com.eleckoi.android.feature.studio.ui.assistant.approval.creationApprovalDecisionLabel
import org.junit.Assert.assertEquals
import org.junit.Test

class CreationApprovalQueueReducerTest {
    @Test
    fun `keeps concurrent approvals ordered and removes only the resolved request`() {
        val first = request(1)
        val second = request(2)
        val queued = CreationApprovalQueueReducer.enqueue(
            CreationApprovalQueueReducer.enqueue(emptyList(), first),
            second,
        )

        assertEquals(listOf(1L, 2L), queued.map(CreationApprovalRequest::requestId))
        assertEquals(listOf(2L), CreationApprovalQueueReducer.remove(queued, 1).map(CreationApprovalRequest::requestId))
    }

    @Test
    fun `does not replace an existing request with the same json rpc id`() {
        val first = request(7, title = "original")
        val duplicate = request(7, title = "duplicate")

        assertEquals(
            listOf(first),
            CreationApprovalQueueReducer.enqueue(listOf(first), duplicate),
        )
    }

    @Test
    fun `attaches a late file diff only to its matching approval`() {
        val first = request(1, itemId = "patch-1")
        val second = request(2, itemId = "patch-2")

        val updated = CreationApprovalQueueReducer.updateReviewForItem(
            listOf(first, second),
            threadId = "thread",
            turnId = "turn",
            itemId = "patch-2",
            reviewContent = "@@ diff @@",
        )

        assertEquals("", updated[0].reviewContent)
        assertEquals("@@ diff @@", updated[1].reviewContent)
    }

    @Test
    fun `file approval labels mirror Harness patch choices even before a comparison arrives`() {
        val approval = request(
            id = 1,
            kind = AgentApprovalKind.FileChange,
            reviewContent = "",
            availableDecisions = listOf(
                AgentApprovalDecision.Accept,
                AgentApprovalDecision.AcceptForSession,
                AgentApprovalDecision.Cancel,
            ),
        )

        assertEquals(
            "仅允许本次修改",
            creationApprovalDecisionLabel(approval, AgentApprovalDecision.Accept),
        )
        assertEquals(
            "对这些文件不再询问",
            creationApprovalDecisionLabel(approval, AgentApprovalDecision.AcceptForSession),
        )
        assertEquals(
            "拒绝并调整做法",
            creationApprovalDecisionLabel(approval, AgentApprovalDecision.Cancel),
        )
    }

    @Test
    fun `file approval with comparison permits session choice when Harness advertises it`() {
        val approval = request(
            id = 1,
            kind = AgentApprovalKind.FileChange,
            reviewContent = "@@ -1 +1 @@\n-old\n+new",
            availableDecisions = listOf(
                AgentApprovalDecision.Accept,
                AgentApprovalDecision.AcceptForSession,
            ),
        )

        assertEquals(
            "对这些文件不再询问",
            creationApprovalDecisionLabel(approval, AgentApprovalDecision.AcceptForSession),
        )
    }

    private fun request(
        id: Long,
        title: String = "approval",
        itemId: String = "item",
        kind: AgentApprovalKind = AgentApprovalKind.Command,
        reviewContent: String = "",
        availableDecisions: List<AgentApprovalDecision> =
            listOf(AgentApprovalDecision.Accept, AgentApprovalDecision.Decline),
    ) = CreationApprovalRequest(
        requestId = id,
        kind = kind,
        threadId = "thread",
        turnId = "turn",
        itemId = itemId,
        title = title,
        detail = "pnpm test",
        reviewContent = reviewContent,
        availableDecisions = availableDecisions,
    )
}
