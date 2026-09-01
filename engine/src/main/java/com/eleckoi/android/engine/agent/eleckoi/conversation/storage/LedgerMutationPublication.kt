package com.eleckoi.android.engine.agent.eleckoi.conversation

internal data class LedgerMutationPublicationPlan(
    val advanceConversationRevision: Boolean,
    val rebuildDisplayCache: Boolean,
    val clearDisplayCache: Boolean,
)

internal fun ledgerMutationPublicationPlan(
    rebuildDisplayCache: Boolean,
): LedgerMutationPublicationPlan = if (rebuildDisplayCache) {
    LedgerMutationPublicationPlan(
        advanceConversationRevision = true,
        rebuildDisplayCache = true,
        clearDisplayCache = false,
    )
} else {
    LedgerMutationPublicationPlan(
        advanceConversationRevision = false,
        rebuildDisplayCache = false,
        clearDisplayCache = true,
    )
}

