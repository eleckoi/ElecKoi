package com.eleckoi.android.feature.chat.ui.screen

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import com.eleckoi.android.feature.chat.model.ChatGenerationMetrics
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.ui.ChatIntent
import com.eleckoi.android.feature.chat.ui.BindChatPresentationReadiness
import com.eleckoi.android.feature.chat.ui.BindLazyListEndFollow
import com.eleckoi.android.feature.chat.ui.ChatPresentationReadinessState
import com.eleckoi.android.feature.chat.ui.ChatUiState
import com.eleckoi.android.feature.chat.ui.ChatViewportGeometrySignature
import com.eleckoi.android.feature.chat.ui.ChatVisualReplyKey
import com.eleckoi.android.feature.chat.ui.ChatVisualReplyPhaseAnchor
import com.eleckoi.android.feature.chat.ui.ChatVisualReplyState
import com.eleckoi.android.feature.chat.ui.LazyListEndFollowBinding
import com.eleckoi.android.feature.chat.ui.chatViewportGeometrySignature
import com.eleckoi.android.feature.chat.ui.phaseAnchor
import com.eleckoi.android.feature.chat.ui.rememberLazyListEndFollowState
import com.eleckoi.android.feature.chat.ui.shouldChatViewportGeometryMutationOwnBottom
import com.eleckoi.android.feature.chat.ui.blocks.markdown.rememberMarkdownHistoryListController
import com.eleckoi.android.feature.chat.ui.message.ChatTimelineItem
import com.eleckoi.android.feature.chat.ui.message.RoleplayToolbarController
import com.eleckoi.android.feature.chat.ui.roleplay.web.surface.RoleplayWebChatController
import com.eleckoi.android.feature.chat.ui.roleplay.web.surface.rememberRoleplayWebChatController
import com.eleckoi.android.feature.preferences.ChatLayoutMode
import com.eleckoi.android.foundation.design.components.ContextWindowUsage
import kotlinx.coroutines.delay

/**
 * Screen-local timeline state. Persisted history still belongs exclusively to Paging; this object
 * coordinates viewport ownership and the transient live tail without introducing another history
 * flow or copying the complete transcript on streamed updates.
 */
internal class ChatTimelineRuntime(
    val sessionId: String,
    val messages: List<ChatMessage>,
    val generationMetrics: ChatGenerationMetrics,
    val contextWindowUsage: ContextWindowUsage?,
    val presentedMessages: List<ChatMessage>,
    val visibleMessages: List<ChatMessage>,
    val timelineItems: List<ChatTimelineItem>,
    val roleplay: Boolean,
    val roleplayWebActive: Boolean,
    val roleplayWebController: RoleplayWebChatController,
    val roleplayWebCanScrollForward: Boolean,
    val userBrowsedAwayFromBottom: Boolean,
    val presentationReadiness: ChatPresentationReadinessState,
    val waitingIndicatorVisible: Boolean,
    val waitingReplySlotReserved: Boolean,
    val nativeWaitingReplySlotReserved: Boolean,
    val replyPresentationActive: Boolean,
    val latestRegenerableMessage: ChatMessage?,
    val listState: LazyListState,
    val endFollowBinding: LazyListEndFollowBinding,
    val waitingUserTurnOwnsBottom: Boolean,
    val timelineItemHeightsPx: MutableMap<String, Int>,
    val composerTopPx: Float,
    val visualReplyState: ChatVisualReplyState,
    val roleplayToolbarController: RoleplayToolbarController,
    val staticExpansionObserver: (Any, Boolean) -> Unit,
    val onRoleplayScrollStateChanged: (Boolean, Boolean) -> Unit,
    val onRoleplayRendererUnavailable: () -> Unit,
    val onRoleplayMessageRendered: (String) -> Unit,
    val onLiveReplyHeightChanged: (ChatVisualReplyKey, Int) -> Unit,
    val onVisualReplyCompleted: (ChatVisualReplyKey) -> Unit,
    val onComposerHeightChanged: (Int) -> Unit,
    val onComposerTopChanged: (Float) -> Unit,
    val resumeToEnd: () -> Unit,
    val submit: () -> Unit,
    val stop: () -> Unit,
    val regenerate: (ChatMessage) -> Unit,
)

@Composable
internal fun rememberChatTimelineRuntime(
    state: ChatUiState,
    onIntent: (ChatIntent) -> Unit,
    onSubmittedMessageInserted: () -> Unit,
): ChatTimelineRuntime {
    val draft = state.draft
    val sessionId = draft?.session?.id.orEmpty()
    val messages = draft?.session?.messages.orEmpty()
    val roleplay = state.chatLayoutMode == ChatLayoutMode.Roleplay
    val endFollowState = rememberLazyListEndFollowState(sessionId)
    val roleplayWebController = rememberRoleplayWebChatController()
    var roleplayWebBrowsingHistory by remember(sessionId) { mutableStateOf(false) }
    var roleplayWebCanScrollForward by remember(sessionId) { mutableStateOf(false) }
    var roleplayWebRendererFailed by remember(sessionId) { mutableStateOf(false) }
    val roleplayWebActive = roleplay && !roleplayWebRendererFailed
    val userBrowsedAwayFromBottom = if (roleplayWebActive) {
        roleplayWebBrowsingHistory
    } else {
        endFollowState.userBrowsingHistory
    }
    val resumeConversationToEnd = {
        endFollowState.resumeToEnd()
        roleplayWebController.scrollToBottom()
        roleplayWebBrowsingHistory = false
        roleplayWebCanScrollForward = false
    }
    val contentProjection = rememberChatTimelineContentProjection(
        state = state,
        sessionId = sessionId,
        messages = messages,
        roleplay = roleplay,
        roleplayWebActive = roleplayWebActive,
        userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
    )
    val presentedMessages = contentProjection.presentedMessages
    val visibleMessages = contentProjection.visibleMessages
    val timelinePresentation = contentProjection.timelinePresentation
    val timelineItems = contentProjection.timelineItems
    val latestMessage = contentProjection.latestMessage
    val generationReplyKey = contentProjection.generationReplyKey
    val markdownCacheScopeKey = contentProjection.markdownCacheScopeKey
    val presentationReadiness = contentProjection.presentationReadiness
    val assistantReplyGeometryPublished =
        latestMessage?.role == MessageRole.Assistant && latestMessage.pending
    val waitingForFirstRenderableReply = shouldShowChatWaitingReply(
        providerActive = state.isSending,
        latestMessageRole = latestMessage?.role,
        liveReplyGeometryActive = assistantReplyGeometryPublished,
    )
    var waitingIndicatorVisible by remember(sessionId) { mutableStateOf(false) }
    LaunchedEffect(sessionId, waitingForFirstRenderableReply) {
        waitingIndicatorVisible = false
        if (waitingForFirstRenderableReply) {
            delay(250)
            waitingIndicatorVisible = true
        }
    }

    val bottomAnchorIndex = timelineItems.size
    val viewportGeometrySignature: ChatViewportGeometrySignature =
        state.chatViewportGeometrySignature()
    var appliedViewportGeometrySignature by remember(sessionId) {
        mutableStateOf(viewportGeometrySignature)
    }
    val viewportGeometryChanged = appliedViewportGeometrySignature != viewportGeometrySignature
    val viewportGeometryMutationOwnsBottom = shouldChatViewportGeometryMutationOwnBottom(
        geometryChanged = viewportGeometryChanged,
        userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
    )
    var measuredComposerHeightPx by remember(sessionId) { mutableIntStateOf(0) }
    var appliedComposerHeightPx by remember(sessionId) { mutableIntStateOf(0) }
    val composerGeometryChanged = measuredComposerHeightPx > 0 &&
        appliedComposerHeightPx != measuredComposerHeightPx
    val composerGeometryMutationOwnsBottom = shouldChatComposerGeometryMutationOwnBottom(
        measuredHeightPx = measuredComposerHeightPx,
        appliedHeightPx = appliedComposerHeightPx,
        userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
    )
    val historyListController = rememberMarkdownHistoryListController(
        scopeKey = markdownCacheScopeKey,
        stateRevisionKey = messages.isNotEmpty(),
        initialFirstVisibleItemIndex = bottomAnchorIndex,
    )
    val listState = historyListController.listState
    var initialViewportSettled by remember(sessionId) { mutableStateOf(false) }
    val openingOwnsBottom = sessionId.isNotBlank() &&
        messages.isNotEmpty() &&
        !initialViewportSettled &&
        !userBrowsedAwayFromBottom
    val presentationOwnsBottom = sessionId.isNotBlank() &&
        messages.isNotEmpty() &&
        !presentationReadiness.revealed &&
        !userBrowsedAwayFromBottom
    val waitingUserTurnOwnsBottom = shouldWaitingUserTailOwnBottom(
        waitingForFirstRenderableReply = waitingForFirstRenderableReply,
        userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
    )
    val preDrawBottomOwner = openingOwnsBottom ||
        presentationOwnsBottom ||
        waitingUserTurnOwnsBottom ||
        composerGeometryMutationOwnsBottom ||
        viewportGeometryMutationOwnsBottom
    val timelineItemHeightsPx = remember(sessionId) { mutableStateMapOf<String, Int>() }
    var composerTopPx by remember(sessionId) { androidx.compose.runtime.mutableFloatStateOf(0f) }
    var pendingSubmitMessageCount by remember(sessionId) { mutableStateOf<Int?>(null) }
    var pendingReplySlotReservation by remember(sessionId) { mutableStateOf(false) }
    val waitingReplySlotReserved = shouldReserveRoleplayWaitingReplySlot(
        roleplayWebActive = roleplayWebActive,
        requestQueued = pendingReplySlotReservation,
        waitingForFirstRenderableReply = waitingForFirstRenderableReply,
    )
    val nativeWaitingReplySlotReserved = shouldReserveNativeChatWaitingReplySlot(
        roleplayWebActive = roleplayWebActive,
        waitingForFirstRenderableReply = waitingForFirstRenderableReply,
    )

    var visualReplyState by remember(sessionId) { mutableStateOf(ChatVisualReplyState()) }
    val presentedVisualReplyState = when {
        generationReplyKey != null -> visualReplyState.begin(generationReplyKey)
        state.generationPresentation == null -> visualReplyState.cancel()
        else -> visualReplyState
    }
    if (presentedVisualReplyState != visualReplyState) {
        SideEffect { visualReplyState = presentedVisualReplyState }
    }
    val acknowledgeRoleplayMessageRendered: (String) -> Unit = { messageId ->
        val completedKey = presentedVisualReplyState.activeKey?.takeIf { key ->
            key.messageId == messageId &&
                visibleMessages.firstOrNull { it.id == messageId }?.pending == false
        }
        if (completedKey != null) {
            val nextVisualState = presentedVisualReplyState.complete(completedKey)
            if (nextVisualState != presentedVisualReplyState) {
                visualReplyState = nextVisualState
                onIntent(
                    ChatIntent.AcknowledgeGenerationPresentation(
                        generation = completedKey.generation,
                    ),
                )
            }
        }
    }
    var measuredLiveReplyKey by remember(sessionId) { mutableStateOf<ChatVisualReplyKey?>(null) }
    var measuredLiveReplyHeightPx by remember(sessionId) { mutableIntStateOf(0) }
    var initiallyAnchoredVisualReplyPhase by remember(sessionId) {
        mutableStateOf<ChatVisualReplyPhaseAnchor?>(null)
    }
    val replyPresentationActive = presentedVisualReplyState.showStopButton(state.isSending)
    val liveReplyGeometryActive = latestMessage?.role == MessageRole.Assistant &&
        (latestMessage.pending || presentedVisualReplyState.isCompleting)
    val activeVisualReplyKey = presentedVisualReplyState.activeKey
    val activeVisualReplyPhase = activeVisualReplyKey?.phaseAnchor(
        finalAnswerVisible = latestMessage?.role == MessageRole.Assistant &&
            (latestMessage.content.isNotBlank() || latestMessage.imageAttachments.isNotEmpty()),
    )
    val liveReplyMeasurementReady = isCurrentLiveReplyMeasurement(
        activeKey = activeVisualReplyKey,
        measuredKey = measuredLiveReplyKey,
    )
    val latestRegenerableMessage = contentProjection.latestRegenerableMessage
    val regenerateMessage: (ChatMessage) -> Unit = { message ->
        resumeConversationToEnd()
        pendingReplySlotReservation = true
        onIntent(ChatIntent.RegenerateFrom(message))
    }
    val endFollowBinding = BindLazyListEndFollow(
        scopeKey = sessionId,
        followState = endFollowState,
        listState = listState,
        nearEndHandoffEnabled = replyPresentationActive,
        streamingHeightFollowEnabled = replyPresentationActive &&
            liveReplyGeometryActive &&
            liveReplyMeasurementReady,
        tailKey = activeVisualReplyKey,
        tailHeightPx = if (liveReplyMeasurementReady) measuredLiveReplyHeightPx else 0,
    )
    val roleplayToolbarController = remember(sessionId) { RoleplayToolbarController() }
    val staticExpansionObserver = remember(endFollowState) {
        { key: Any, expanded: Boolean -> endFollowState.setStaticContentExpanded(key, expanded) }
    }

    BindChatConversationViewport(
        sessionId = sessionId,
        timelineItems = timelineItems,
        listState = listState,
        measuredItemHeightsPx = timelineItemHeightsPx,
        userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
        historyHasMore = state.historyHasMore,
        historyPageLoading = state.historyPageLoading,
        onLoadOlder = { onIntent(ChatIntent.LoadOlderMessages) },
    )
    val timelineKeys = remember(timelineItems) { timelineItems.mapTo(hashSetOf()) { it.key } }
    BindChatPresentationReadiness(
        state = presentationReadiness,
        listState = listState,
        timelineKeys = timelineKeys,
        historyReady = state.historyInitialPageReady,
        timelineReady = timelinePresentation.preparationComplete,
        requireFooter = !userBrowsedAwayFromBottom,
    )
    if (preDrawBottomOwner) SideEffect { listState.requestScrollToItem(bottomAnchorIndex) }
    if (viewportGeometryChanged) {
        SideEffect { appliedViewportGeometrySignature = viewportGeometrySignature }
    }
    if (composerGeometryChanged) {
        SideEffect { appliedComposerHeightPx = measuredComposerHeightPx }
    }
    LaunchedEffect(
        sessionId,
        state.historyInitialPageReady,
        timelinePresentation.preparationComplete,
        bottomAnchorIndex,
        userBrowsedAwayFromBottom,
    ) {
        if (userBrowsedAwayFromBottom) {
            initialViewportSettled = true
            return@LaunchedEffect
        }
        if (
            sessionId.isNotBlank() &&
            state.historyInitialPageReady &&
            timelinePresentation.preparationComplete
        ) {
            withFrameNanos { }
            withFrameNanos { }
            initialViewportSettled = true
        }
    }
    BindChatKeyboardViewport(
        sessionId = sessionId,
        listState = listState,
        userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
        isDragged = endFollowBinding.isDragged,
    )
    if (
        activeVisualReplyPhase != null &&
        activeVisualReplyPhase != initiallyAnchoredVisualReplyPhase &&
        shouldAnchorGeneratingChatToEnd(
            replyPresentationActive = replyPresentationActive,
            liveReplyGeometryActive = liveReplyGeometryActive,
            userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
            isDragged = endFollowBinding.isDragged,
        )
    ) {
        SideEffect {
            listState.requestScrollToItem(bottomAnchorIndex)
            initiallyAnchoredVisualReplyPhase = activeVisualReplyPhase
        }
    }

    val submitMessageInserted = pendingSubmitMessageCount?.let { messages.size > it } == true
    LaunchedEffect(state.isSending, pendingSubmitMessageCount) {
        if (!state.isSending && pendingSubmitMessageCount != null) {
            pendingSubmitMessageCount = null
        }
    }
    LaunchedEffect(sessionId, submitMessageInserted) {
        if (submitMessageInserted) {
            resumeConversationToEnd()
            withFrameNanos { }
            onSubmittedMessageInserted()
            pendingSubmitMessageCount = null
        }
    }
    LaunchedEffect(
        sessionId,
        pendingReplySlotReservation,
        waitingForFirstRenderableReply,
        assistantReplyGeometryPublished,
        state.isSending,
    ) {
        if (!pendingReplySlotReservation) return@LaunchedEffect
        if (waitingForFirstRenderableReply || assistantReplyGeometryPublished) {
            pendingReplySlotReservation = false
        } else if (!state.isSending) {
            delay(2_000)
            pendingReplySlotReservation = false
        }
    }

    return ChatTimelineRuntime(
        sessionId = sessionId,
        messages = messages,
        generationMetrics = contentProjection.generationMetrics,
        contextWindowUsage = contentProjection.contextWindowUsage,
        presentedMessages = presentedMessages,
        visibleMessages = visibleMessages,
        timelineItems = timelineItems,
        roleplay = roleplay,
        roleplayWebActive = roleplayWebActive,
        roleplayWebController = roleplayWebController,
        roleplayWebCanScrollForward = roleplayWebCanScrollForward,
        userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
        presentationReadiness = presentationReadiness,
        waitingIndicatorVisible = waitingIndicatorVisible,
        waitingReplySlotReserved = waitingReplySlotReserved,
        nativeWaitingReplySlotReserved = nativeWaitingReplySlotReserved,
        replyPresentationActive = replyPresentationActive,
        latestRegenerableMessage = latestRegenerableMessage,
        listState = listState,
        endFollowBinding = endFollowBinding,
        waitingUserTurnOwnsBottom = waitingUserTurnOwnsBottom,
        timelineItemHeightsPx = timelineItemHeightsPx,
        composerTopPx = composerTopPx,
        visualReplyState = presentedVisualReplyState,
        roleplayToolbarController = roleplayToolbarController,
        staticExpansionObserver = staticExpansionObserver,
        onRoleplayScrollStateChanged = { browsing, canScroll ->
            roleplayWebBrowsingHistory = browsing
            roleplayWebCanScrollForward = canScroll
        },
        onRoleplayRendererUnavailable = { roleplayWebRendererFailed = true },
        onRoleplayMessageRendered = acknowledgeRoleplayMessageRendered,
        onLiveReplyHeightChanged = { key, heightPx ->
            measuredLiveReplyKey = key
            measuredLiveReplyHeightPx = heightPx
        },
        onVisualReplyCompleted = { completedKey ->
            val nextVisualState = presentedVisualReplyState.complete(completedKey)
            if (nextVisualState != presentedVisualReplyState) {
                visualReplyState = nextVisualState
                onIntent(
                    ChatIntent.AcknowledgeGenerationPresentation(
                        generation = completedKey.generation,
                    ),
                )
            }
        },
        onComposerHeightChanged = { heightPx ->
            if (measuredComposerHeightPx != heightPx) measuredComposerHeightPx = heightPx
        },
        onComposerTopChanged = { composerTopPx = it },
        resumeToEnd = resumeConversationToEnd,
        submit = {
            if (
                (state.input.trim().isNotBlank() || state.inputImages.isNotEmpty()) &&
                !replyPresentationActive &&
                draft != null
            ) {
                pendingSubmitMessageCount = messages.size
                pendingReplySlotReservation = true
                onIntent(ChatIntent.SendMessage)
            }
        },
        stop = {
            visualReplyState = presentedVisualReplyState.cancel()
            presentedVisualReplyState.activeKey?.let { key ->
                onIntent(ChatIntent.AcknowledgeGenerationPresentation(key.generation))
            }
            pendingSubmitMessageCount = null
            pendingReplySlotReservation = false
            onIntent(ChatIntent.StopSending)
        },
        regenerate = regenerateMessage,
    )
}
