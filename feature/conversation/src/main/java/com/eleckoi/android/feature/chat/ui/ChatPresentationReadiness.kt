package com.eleckoi.android.feature.chat.ui

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import com.eleckoi.android.feature.preferences.ChatAvatarShape
import com.eleckoi.android.feature.preferences.ChatLayoutMode
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.chat.model.ChatMessage
import kotlinx.coroutines.flow.first

/** Everything that can remount rows or invalidate a completed Markdown render plan. */
internal data class ChatPresentationSignature(
    val sessionId: String,
    val contentRevision: Int,
    val layoutMode: ChatLayoutMode,
    val roleplayCardPanel: Boolean,
    val assistantBubbleEnabled: Boolean,
    val wideBubbleLayout: Boolean,
    val bubbleCornerRadius: Float,
    val avatarSize: Float,
    val avatarShape: ChatAvatarShape,
    val nameFontSize: Float,
    val nameAvatarSpacing: Float,
    val horizontalPadding: Float,
    val replySpacing: Float,
    val turnSpacing: Float,
    val messageFontSize: Float,
    val lineHeightMultiplier: Float,
    val letterSpacing: Float,
    val paragraphSpacing: Float,
    val appearance: AppearanceTheme,
)

internal fun ChatUiState.presentationSignature(
    sessionId: String,
    contentRevision: Int,
) = ChatPresentationSignature(
    sessionId = sessionId,
    contentRevision = contentRevision,
    layoutMode = chatLayoutMode,
    roleplayCardPanel = chatRoleplayCardPanel,
    assistantBubbleEnabled = assistantBubbleEnabled,
    wideBubbleLayout = chatBubbleWideLayout,
    bubbleCornerRadius = chatBubbleCornerRadius,
    avatarSize = chatAvatarSize,
    avatarShape = chatAvatarShape,
    nameFontSize = chatNameFontSize,
    nameAvatarSpacing = chatNameAvatarSpacing,
    horizontalPadding = chatAreaHorizontalPadding,
    replySpacing = chatReplySpacing,
    turnSpacing = chatTurnSpacing,
    messageFontSize = chatMessageFontSize,
    lineHeightMultiplier = chatLineHeightMultiplier,
    letterSpacing = chatLetterSpacing,
    paragraphSpacing = chatParagraphSpacing,
    appearance = appearance,
)

/**
 * A presentation revision stays hidden while it is allowed to measure its real Markdown plans.
 * Cache misses cost latency, never a user-visible half-rendered list or a corrective jump.
 */
@Stable
internal class ChatPresentationReadinessState internal constructor(
    private val signature: ChatPresentationSignature,
    initiallyRevealed: Boolean,
) {
    private val readyItemKeys = mutableStateMapOf<String, Unit>()
    private val revealedState = mutableStateOf(initiallyRevealed)

    val revealed: Boolean
        get() = revealedState.value

    fun markItemReady(key: String) {
        readyItemKeys[key] = Unit
    }

    internal fun isItemReady(key: String): Boolean = key in readyItemKeys

    internal fun reveal() {
        revealedState.value = true
        ChatPresentationReadyCache.put(signature)
    }
}

@Composable
internal fun rememberChatPresentationReadiness(
    signature: ChatPresentationSignature,
    allowCachedReveal: Boolean = true,
): ChatPresentationReadinessState = remember(signature) {
    ChatPresentationReadinessState(
        signature = signature,
        initiallyRevealed = allowCachedReveal && ChatPresentationReadyCache.contains(signature),
    )
}

/** A route disposal is not a cold start. Keep only the last verified revision for immediate re-entry. */
private object ChatPresentationReadyCache {
    private var latestSignature: ChatPresentationSignature? = null

    @Synchronized
    fun contains(signature: ChatPresentationSignature): Boolean = latestSignature == signature

    @Synchronized
    fun put(signature: ChatPresentationSignature) {
        latestSignature = signature
    }
}

/** Captured once per route entry: live deltas never restart the presentation gate mid-stream. */
internal fun chatPresentationContentRevision(messages: List<ChatMessage>): Int {
    var result = 1
    messages.forEach { message ->
        result = 31 * result + message.id.hashCode()
        result = 31 * result + message.content.hashCode()
        result = 31 * result + message.reasoningContent.hashCode()
        result = 31 * result + message.toolCalls.hashCode()
        result = 31 * result + message.imageAttachments.hashCode()
    }
    return result
}

internal data class ChatPresentationFrame(
    val totalItemsCount: Int,
    val expectedItemsCount: Int,
    val visibleTimelineKeys: Set<String>,
    val readyTimelineKeys: Set<String>,
    val footerVisible: Boolean,
    val historyReady: Boolean,
    val timelineReady: Boolean,
    val requireFooter: Boolean,
)

internal fun ChatPresentationFrame.canReveal(): Boolean =
    historyReady &&
        timelineReady &&
        totalItemsCount == expectedItemsCount &&
        visibleTimelineKeys.all(readyTimelineKeys::contains) &&
        (!requireFooter || footerVisible)

internal fun ChatPresentationFrame.needsFooterRestore(): Boolean =
    historyReady &&
        timelineReady &&
        totalItemsCount == expectedItemsCount &&
        requireFooter &&
        !footerVisible

/** Reveals only after readiness survives two real layout frames; no delay or guessed timeout. */
@Composable
internal fun BindChatPresentationReadiness(
    state: ChatPresentationReadinessState,
    listState: LazyListState,
    timelineKeys: Set<String>,
    historyReady: Boolean,
    timelineReady: Boolean,
    requireFooter: Boolean,
) {
    fun snapshot(): ChatPresentationFrame {
        val layout = listState.layoutInfo
        val visibleTimelineKeys = layout.visibleItemsInfo
            .mapNotNull { item -> (item.key as? String)?.takeIf(timelineKeys::contains) }
            .toSet()
        val readyTimelineKeys = visibleTimelineKeys.filterTo(mutableSetOf(), state::isItemReady)
        return ChatPresentationFrame(
            totalItemsCount = layout.totalItemsCount,
            expectedItemsCount = timelineKeys.size + 1,
            visibleTimelineKeys = visibleTimelineKeys,
            readyTimelineKeys = readyTimelineKeys,
            footerVisible = layout.visibleItemsInfo.any { it.key == ChatBottomAnchorKey },
            historyReady = historyReady,
            timelineReady = timelineReady,
            requireFooter = requireFooter,
        )
    }

    LaunchedEffect(state, listState, timelineKeys, historyReady, timelineReady, requireFooter) {
        while (!state.revealed) {
            val candidate = snapshotFlow(::snapshot).first { frame ->
                frame.canReveal() || frame.needsFooterRestore()
            }
            if (candidate.needsFooterRestore()) {
                // Rich rows can finish at a larger height without causing a Compose recomposition.
                // Correct the hidden initial viewport from the actual LazyList measurement instead
                // of relying on ChatScreen's pre-draw SideEffect to happen to run again.
                listState.scrollToItem(timelineKeys.size)
                continue
            }
            withFrameNanos { }
            withFrameNanos { }
            val settled = snapshot()
            when {
                settled.needsFooterRestore() -> {
                    listState.scrollToItem(timelineKeys.size)
                }
                settled.canReveal() -> {
                    state.reveal()
                }
            }
        }
    }
}

internal const val ChatBottomAnchorKey = "bottom-anchor"
