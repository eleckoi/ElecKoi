package com.eleckoi.android.feature.chat.ui.screen

import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.ui.ChatVisualReplyKey

internal fun shouldPinLiveReplyStructure(
    messageId: String,
    activeMessageId: String?,
    watchedMessageIds: Set<String>,
): Boolean = messageId == activeMessageId || messageId in watchedMessageIds

/** A modal message editor owns focus; the conversation behind it must ignore blank-tap dismissal. */
internal fun shouldEnableChatBlankTapFocusDismiss(editingMessageOpen: Boolean): Boolean =
    !editingMessageOpen

internal fun shouldAnchorGeneratingChatToEnd(
    replyPresentationActive: Boolean,
    liveReplyGeometryActive: Boolean,
    userBrowsedAwayFromBottom: Boolean,
    isDragged: Boolean,
): Boolean = replyPresentationActive &&
    liveReplyGeometryActive &&
    !userBrowsedAwayFromBottom &&
    !isDragged

internal fun isCurrentLiveReplyMeasurement(
    activeKey: ChatVisualReplyKey?,
    measuredKey: ChatVisualReplyKey?,
): Boolean = activeKey != null && activeKey == measuredKey

internal fun shouldShowChatWaitingReply(
    providerActive: Boolean,
    latestMessageRole: MessageRole?,
    liveReplyGeometryActive: Boolean,
): Boolean = providerActive &&
    latestMessageRole == MessageRole.User &&
    !liveReplyGeometryActive

internal fun shouldReserveRoleplayWaitingReplySlot(
    roleplayWebActive: Boolean,
    requestQueued: Boolean,
    waitingForFirstRenderableReply: Boolean,
): Boolean = roleplayWebActive && (requestQueued || waitingForFirstRenderableReply)

internal fun shouldReserveNativeChatWaitingReplySlot(
    roleplayWebActive: Boolean,
    waitingForFirstRenderableReply: Boolean,
): Boolean = !roleplayWebActive && waitingForFirstRenderableReply

/**
 * A real user tail owns the footer while the provider has not published an assistant row yet.
 * Before regeneration truncation the old assistant is still the tail, so this cannot scroll the
 * branch that is about to be removed.
 */
internal fun shouldWaitingUserTailOwnBottom(
    waitingForFirstRenderableReply: Boolean,
    userBrowsedAwayFromBottom: Boolean,
): Boolean = waitingForFirstRenderableReply && !userBrowsedAwayFromBottom

internal val ChatWaitingReplySlotHeight = 28.dp
internal val ChatComposerTimelineGap = 8.dp

internal fun shouldChatComposerGeometryMutationOwnBottom(
    measuredHeightPx: Int,
    appliedHeightPx: Int,
    userBrowsedAwayFromBottom: Boolean,
): Boolean = measuredHeightPx > 0 &&
    measuredHeightPx != appliedHeightPx &&
    !userBrowsedAwayFromBottom
