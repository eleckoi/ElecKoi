package com.eleckoi.android.feature.chat.ui.screen

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.layout.LocalPinnableContainer
import androidx.compose.ui.layout.PinnableContainer
import kotlinx.coroutines.flow.distinctUntilChanged

/** Keeps rows that own Android platform views alive only near the visible LazyColumn window. */
@Composable
internal fun KeepPlatformViewRowAliveNearViewport(
    enabled: Boolean,
    itemIndex: Int,
    itemKey: String,
    listState: LazyListState,
) {
    if (!enabled) return
    val container = LocalPinnableContainer.current ?: return
    val controller = remember(itemKey, container) {
        PlatformViewRowPinController(container)
    }
    DisposableEffect(controller) {
        controller.pin()
        onDispose { controller.release() }
    }
    LaunchedEffect(controller, itemIndex, listState) {
        snapshotFlow {
            val visibleItems = listState.layoutInfo.visibleItemsInfo
            shouldPinPlatformViewRow(
                itemIndex = itemIndex,
                firstVisibleIndex = visibleItems.firstOrNull()?.index,
                lastVisibleIndex = visibleItems.lastOrNull()?.index,
            )
        }
            .distinctUntilChanged()
            .collect { shouldPin ->
                if (shouldPin) controller.pin() else controller.release()
            }
    }
}

internal fun shouldPinPlatformViewRow(
    itemIndex: Int,
    firstVisibleIndex: Int?,
    lastVisibleIndex: Int?,
    bufferItems: Int = PlatformViewPinBufferItems,
): Boolean {
    if (firstVisibleIndex == null || lastVisibleIndex == null) return true
    return itemIndex >= firstVisibleIndex - bufferItems &&
        itemIndex <= lastVisibleIndex + bufferItems
}

private class PlatformViewRowPinController(
    private val container: PinnableContainer,
) {
    private var handle: PinnableContainer.PinnedHandle? = null

    fun pin() {
        if (handle != null) return
        handle = container.pin()
    }

    fun release() {
        val pinned = handle ?: return
        handle = null
        pinned.release()
    }
}

private const val PlatformViewPinBufferItems = 2
