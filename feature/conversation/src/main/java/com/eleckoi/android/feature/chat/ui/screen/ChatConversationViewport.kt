package com.eleckoi.android.feature.chat.ui.screen

import com.eleckoi.android.feature.chat.ui.*

import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import com.eleckoi.android.feature.chat.ui.message.ChatTimelineItem
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Treats keyboard viewport changes as measured geometry instead of translating the whole
 * conversation. If the reader owned the bottom before a shrink, only the pixels removed from the
 * viewport are consumed as forward scroll. A short conversation cannot consume that scroll and
 * therefore stays where it is. While browsing history, the visible passage follows the composer in
 * both directions; only an active finger drag suspends this compensation.
 */
@Composable
fun BindChatKeyboardViewport(
    sessionId: String,
    listState: LazyListState,
    userBrowsedAwayFromBottom: Boolean,
    isDragged: Boolean,
) {
    LaunchedEffect(sessionId, listState, userBrowsedAwayFromBottom, isDragged) {
        var previousViewportEnd = listState.layoutInfo.viewportEndOffset
        var bottomOwned = keyboardViewportOwnsLiveTail(
            userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
            isDragged = isDragged,
        )

        snapshotFlow {
            KeyboardViewportSnapshot(
                viewportEnd = listState.layoutInfo.viewportEndOffset,
                userBrowsedAwayFromBottom = userBrowsedAwayFromBottom,
                isDragged = isDragged,
            )
        }
            .distinctUntilChanged()
            .collect { snapshot ->
                val scrollDelta = keyboardViewportScrollDelta(
                    previousViewportEnd = previousViewportEnd,
                    currentViewportEnd = snapshot.viewportEnd,
                    bottomOwned = bottomOwned,
                    userBrowsedAwayFromBottom = snapshot.userBrowsedAwayFromBottom,
                    isDragged = snapshot.isDragged,
                )
                val viewportShrank = snapshot.viewportEnd < previousViewportEnd
                previousViewportEnd = snapshot.viewportEnd

                if (scrollDelta != 0) {
                    listState.scrollBy(scrollDelta.toFloat())
                }

                if (!viewportShrank) {
                    bottomOwned = keyboardViewportOwnsLiveTail(
                        userBrowsedAwayFromBottom = snapshot.userBrowsedAwayFromBottom,
                        isDragged = snapshot.isDragged,
                    )
                }
            }
    }
}

/**
 * Bottom ownership is interaction state, not a geometry guess. Final Markdown measurement may
 * briefly expose forward range after generation; that must not suppress an immediately opened
 * keyboard's viewport compensation.
 */
internal fun keyboardViewportOwnsLiveTail(
    userBrowsedAwayFromBottom: Boolean,
    isDragged: Boolean,
): Boolean = !userBrowsedAwayFromBottom && !isDragged

internal fun keyboardViewportScrollDelta(
    previousViewportEnd: Int,
    currentViewportEnd: Int,
    bottomOwned: Boolean,
    userBrowsedAwayFromBottom: Boolean,
    isDragged: Boolean,
): Int = when {
    isDragged -> 0
    // History follows the composer in both directions so the passage being read keeps the same
    // visual relationship to the input area when the keyboard opens and closes.
    userBrowsedAwayFromBottom -> previousViewportEnd - currentViewportEnd
    // At the live tail only compensate a shrink. LazyColumn already resolves an expanding
    // viewport against its content end; applying a second reverse scroll would overshoot it.
    bottomOwned && currentViewportEnd < previousViewportEnd ->
        previousViewportEnd - currentViewportEnd
    else -> 0
}

private data class KeyboardViewportSnapshot(
    val viewportEnd: Int,
    val userBrowsedAwayFromBottom: Boolean,
    val isDragged: Boolean,
)

/**
 * Prefetches older Room pages from one measured conversation viewport. It deliberately does not
 * own message data or generation state.
 */
@Composable
internal fun BindChatConversationViewport(
    sessionId: String,
    timelineItems: List<ChatTimelineItem>,
    listState: LazyListState,
    measuredItemHeightsPx: Map<String, Int>,
    userBrowsedAwayFromBottom: Boolean,
    historyHasMore: Boolean,
    historyPageLoading: Boolean,
    onLoadOlder: () -> Unit,
) {
    var historyPageLoadArmed by remember(sessionId) { mutableStateOf(true) }

    LaunchedEffect(sessionId, timelineItems.size, historyPageLoading) {
        if (!historyPageLoading) historyPageLoadArmed = true
    }
    LaunchedEffect(
        sessionId,
        listState,
        timelineItems,
        userBrowsedAwayFromBottom,
        historyHasMore,
        historyPageLoading,
    ) {
        snapshotFlow {
            val movingTowardHistory =
                userBrowsedAwayFromBottom || listState.isScrollInProgress
            movingTowardHistory to listState.isHistoryStartWithinPreloadRange(
                timelineItems = timelineItems,
                measuredItemHeightsPx = measuredItemHeightsPx,
            )
        }
            .distinctUntilChanged()
            .collect { (movingTowardHistory, historyStartWithinPreloadRange) ->
                if (!movingTowardHistory) return@collect
                if (!historyStartWithinPreloadRange) {
                    historyPageLoadArmed = true
                } else if (
                    shouldRequestOlderChatMessages(
                        historyPageLoadArmed = historyPageLoadArmed,
                        historyHasMore = historyHasMore,
                        historyPageLoading = historyPageLoading,
                    )
                ) {
                    historyPageLoadArmed = false
                    onLoadOlder()
                }
            }
    }
}

internal fun shouldRequestOlderChatMessages(
    historyPageLoadArmed: Boolean,
    historyHasMore: Boolean,
    historyPageLoading: Boolean,
): Boolean = historyPageLoadArmed &&
    historyHasMore &&
    !historyPageLoading

private fun LazyListState.isHistoryStartWithinPreloadRange(
    timelineItems: List<ChatTimelineItem>,
    measuredItemHeightsPx: Map<String, Int>,
): Boolean {
    val info = layoutInfo
    val visible = info.visibleItemsInfo.filter { it.index < timelineItems.size }
    if (visible.isEmpty()) return false
    val viewportHeight = (info.viewportEndOffset - info.viewportStartOffset).coerceAtLeast(1)
    val averageVisibleItemHeight = (
        visible.sumOf { item -> item.size }.toFloat() / visible.size
    ).coerceAtLeast(1f)
    val first = visible.first()
    val clippedFirstItemPx = (info.viewportStartOffset - first.offset).coerceAtLeast(0)
    return isHistoryStartWithinPreloadRange(
        firstVisibleItemIndex = first.index,
        clippedFirstItemPx = clippedFirstItemPx,
        viewportHeightPx = viewportHeight,
        averageVisibleItemHeightPx = averageVisibleItemHeight,
        itemSpacingPx = info.mainAxisItemSpacing,
        timelineItems = timelineItems,
        measuredItemHeightsPx = measuredItemHeightsPx,
    )
}

/**
 * The caller only needs to know whether the history start is inside the preload threshold. Scan
 * backwards from the viewport and stop as soon as that threshold is crossed, instead of summing
 * every item from index zero on each scroll layout update.
 */
internal fun isHistoryStartWithinPreloadRange(
    firstVisibleItemIndex: Int,
    clippedFirstItemPx: Int,
    viewportHeightPx: Int,
    averageVisibleItemHeightPx: Float,
    itemSpacingPx: Int,
    timelineItems: List<ChatTimelineItem>,
    measuredItemHeightsPx: Map<String, Int>,
    preloadScreens: Float = HistoryPagePreloadScreens,
): Boolean {
    val thresholdPx = viewportHeightPx.coerceAtLeast(1) * preloadScreens.coerceAtLeast(0f)
    var estimatedDistancePx = -clippedFirstItemPx.coerceAtLeast(0).toFloat()
    var index = firstVisibleItemIndex.coerceIn(0, timelineItems.size)
    val fallbackHeightPx = averageVisibleItemHeightPx.coerceAtLeast(1f)

    while (index > 0 && estimatedDistancePx <= thresholdPx) {
        index -= 1
        val measuredHeightPx = measuredItemHeightsPx[timelineItems[index].key]
            ?.takeIf { it > 0 }
            ?.toFloat()
            ?: fallbackHeightPx
        estimatedDistancePx += measuredHeightPx + itemSpacingPx.coerceAtLeast(0)
    }
    return estimatedDistancePx.coerceAtLeast(0f) <= thresholdPx
}

private const val HistoryPagePreloadScreens = 1.5f
