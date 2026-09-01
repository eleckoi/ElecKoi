package com.eleckoi.android.feature.studio.ui.assistant.approval

import com.eleckoi.android.engine.agent.api.AgentApprovalKind
import com.eleckoi.android.feature.studio.ui.assistant.CreationApprovalRequest

internal object CreationApprovalQueueReducer {
    fun enqueue(
        current: List<CreationApprovalRequest>,
        request: CreationApprovalRequest,
    ): List<CreationApprovalRequest> {
        if (current.any { it.requestId == request.requestId }) return current
        return current + request
    }

    fun remove(
        current: List<CreationApprovalRequest>,
        requestId: Long,
    ): List<CreationApprovalRequest> = current.filterNot { it.requestId == requestId }

    fun updateReviewForItem(
        current: List<CreationApprovalRequest>,
        threadId: String,
        turnId: String,
        itemId: String,
        reviewContent: String,
    ): List<CreationApprovalRequest> {
        if (reviewContent.isBlank()) return current
        return current.map { request ->
            if (
                request.threadId == threadId &&
                request.turnId == turnId &&
                request.itemId == itemId
            ) request.copy(reviewContent = reviewContent) else request
        }
    }

    fun updateReviewForTurn(
        current: List<CreationApprovalRequest>,
        threadId: String,
        turnId: String,
        reviewContent: String,
    ): List<CreationApprovalRequest> {
        if (reviewContent.isBlank()) return current
        return current.map { request ->
            if (
                request.kind == AgentApprovalKind.FileChange &&
                request.threadId == threadId &&
                request.turnId == turnId &&
                request.reviewContent.isBlank()
            ) request.copy(reviewContent = reviewContent) else request
        }
    }
}
