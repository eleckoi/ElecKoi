package com.eleckoi.android.feature.chat.ui.blocks.markdown

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

/**
 * Keeps only the stable list state owned by a conversation.
 *
 * Compose already provides lazy composition, item prefetch and platform fling physics. History
 * loading must happen before the data boundary, not by clipping the user's fling to the current
 * render-cache window.
 */
@Composable
fun rememberMarkdownHistoryListController(
    scopeKey: String,
    stateRevisionKey: Any = scopeKey,
    initialFirstVisibleItemIndex: Int = 0,
): MarkdownHistoryListController {
    val listState = remember(scopeKey, stateRevisionKey) {
        // 数据第一次真正到达时创建一次底部位置。后续 Markdown 拆块只改变项目数量，
        // 不重建状态，交给稳定 item key 保持当前位置。
        LazyListState(
            firstVisibleItemIndex = initialFirstVisibleItemIndex,
            firstVisibleItemScrollOffset = 0,
        )
    }
    return MarkdownHistoryListController(listState)
}

data class MarkdownHistoryListController(
    val listState: LazyListState,
)

internal fun markdownCacheOwnerKey(scopeKey: String, itemId: String): String = "$scopeKey:$itemId"
