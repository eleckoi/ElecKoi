package com.eleckoi.android.feature.chat.ui

import java.time.OffsetDateTime

internal fun shouldAcceptObservedChatDraft(
    currentSessionId: String?,
    currentUpdatedAt: String?,
    observedSessionId: String,
    observedUpdatedAt: String,
    isSending: Boolean,
): Boolean {
    if (isSending) return false
    if (currentSessionId.isNullOrBlank() || currentSessionId != observedSessionId) return true
    if (currentUpdatedAt.isNullOrBlank() || currentUpdatedAt == observedUpdatedAt) return true

    val currentRevision = runCatching { OffsetDateTime.parse(currentUpdatedAt).toInstant() }.getOrNull()
    val observedRevision = runCatching { OffsetDateTime.parse(observedUpdatedAt).toInstant() }.getOrNull()
    if (currentRevision == null || observedRevision == null) {
        // Imported histories may use a non-Instant timestamp. Do not freeze legitimate updates
        // when their ordering cannot be established.
        return true
    }
    return !observedRevision.isBefore(currentRevision)
}
