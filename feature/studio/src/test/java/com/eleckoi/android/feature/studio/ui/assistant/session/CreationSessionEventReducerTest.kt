package com.eleckoi.android.feature.studio.ui.assistant.session

import com.eleckoi.android.feature.conversation.markdown.*
import com.eleckoi.android.feature.conversation.timeline.*
import com.eleckoi.android.feature.conversation.timeline.model.*
import com.eleckoi.android.feature.conversation.timeline.ui.*

import com.eleckoi.android.engine.agent.api.AgentApprovalDecision
import com.eleckoi.android.engine.agent.api.AgentApprovalKind
import com.eleckoi.android.engine.agent.api.AgentSessionEvent
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import org.junit.Assert.assertEquals
import org.junit.Test

class CreationSessionEventReducerTest {
    @Test
    fun `turn diff becomes review content for a later approval`() {
        val reducer = CreationSessionEventReducer()
        val afterDiff = reducer.reduce(
            AiCreationAssistantUiState(),
            AgentSessionEvent.TurnDiffUpdated(
                threadId = "thread",
                turnId = "turn",
                diff = "diff --git a/index.html b/index.html",
            ),
        )

        val afterApproval = reducer.reduce(
            afterDiff,
            AgentSessionEvent.ApprovalRequested(
                requestId = 7L,
                kind = AgentApprovalKind.FileChange,
                threadId = "thread",
                turnId = "turn",
                itemId = "item",
                title = "写入文件",
                detail = "index.html",
                availableDecisions = listOf(AgentApprovalDecision.Accept),
            ),
        )

        assertEquals(
            "diff --git a/index.html b/index.html",
            afterApproval.pendingApprovals.single().reviewContent,
        )
    }
}
