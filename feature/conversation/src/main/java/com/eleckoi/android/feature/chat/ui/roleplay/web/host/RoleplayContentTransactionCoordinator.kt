package com.eleckoi.android.feature.chat.ui.roleplay.web.host

import com.eleckoi.android.feature.chat.ui.roleplay.web.model.RoleplayTranscriptModel

internal class RoleplayContentTransactionCoordinator {
    data class Transaction(
        val id: Long,
        val baseId: Long,
        val sessionId: String,
        val model: RoleplayTranscriptModel,
    )

    data class Commit(
        val model: RoleplayTranscriptModel,
        val hasNewerCandidate: Boolean,
    )

    private var nextId = 0L
    private var committedId = 0L
    private var committedModel: RoleplayTranscriptModel? = null
    private var inFlight: Transaction? = null
    private var latestCandidate: RoleplayTranscriptModel? = null

    val baseline: RoleplayTranscriptModel?
        get() = committedModel

    val hasInFlight: Boolean
        get() = inFlight != null

    fun offer(model: RoleplayTranscriptModel) {
        latestCandidate = model
    }

    fun begin(model: RoleplayTranscriptModel): Transaction? {
        if (inFlight != null) return null
        return Transaction(
            id = ++nextId,
            baseId = committedId,
            sessionId = model.sessionId,
            model = model,
        ).also { inFlight = it }
    }

    fun acknowledge(id: Long, sessionId: String): Commit? {
        val pending = inFlight ?: return null
        if (pending.id != id || pending.sessionId != sessionId) return null
        committedId = pending.id
        committedModel = pending.model
        inFlight = null
        return Commit(
            model = pending.model,
            hasNewerCandidate = latestCandidate !== pending.model,
        )
    }

    fun reject(id: Long): Boolean {
        val pending = inFlight ?: return false
        if (pending.id != id) return false
        inFlight = null
        committedModel = null
        return true
    }

    fun acceptsPresentation(id: Long, sessionId: String): Boolean =
        id in 1..committedId && committedModel?.sessionId == sessionId

    fun resetPage() {
        nextId = 0L
        committedId = 0L
        committedModel = null
        inFlight = null
    }
}
