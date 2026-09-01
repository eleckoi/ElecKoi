package com.eleckoi.android.feature.studio.ui.assistant.screen.conversation

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem

/** Window-space hit targets for user messages currently composed by the lazy list. */
internal class CreationUserMessageTapTargets {
    private val targets = linkedMapOf<String, Pair<CreationTimelineItem, Rect>>()

    fun update(item: CreationTimelineItem, bounds: Rect?) {
        if (bounds == null || bounds.isEmpty) {
            targets.remove(item.id)
        } else {
            targets[item.id] = item to bounds
        }
    }

    fun itemAt(pointInWindow: Offset): CreationTimelineItem? = targets.values
        .lastOrNull { (_, bounds) -> bounds.contains(pointInWindow) }
        ?.first
}

/** Recognizes an unconsumed single tap without stealing vertical scrolling from the list. */
internal fun Modifier.editVisibleCreationUserMessageOnTap(
    enabled: Boolean,
    targets: CreationUserMessageTapTargets,
    onEdit: (CreationTimelineItem) -> Unit,
): Modifier = composed {
    val currentOnEdit by rememberUpdatedState(onEdit)
    val rootBounds = remember { mutableStateOf(Rect.Zero) }
    pointerInput(enabled, targets) {
        if (!enabled) return@pointerInput
        awaitEachGesture {
            val down = awaitFirstDown(
                requireUnconsumed = false,
                pass = PointerEventPass.Initial,
            )
            val pointerId = down.id
            val start = down.position
            var releasedAt: Offset? = null
            var movedBeyondTapSlop = false

            while (true) {
                val event = awaitPointerEvent(pass = PointerEventPass.Initial)
                val change = event.changes.firstOrNull { it.id == pointerId } ?: break
                if ((change.position - start).getDistance() > viewConfiguration.touchSlop) {
                    movedBeyondTapSlop = true
                }
                if (!change.pressed) {
                    releasedAt = change.position
                    break
                }
            }

            val localRelease = releasedAt
            if (!movedBeyondTapSlop && localRelease != null) {
                val root = rootBounds.value
                val pointInWindow = Offset(
                    x = root.left + localRelease.x,
                    y = root.top + localRelease.y,
                )
                targets.itemAt(pointInWindow)?.let(currentOnEdit)
            }
        }
    }.onGloballyPositioned { coordinates ->
        rootBounds.value = coordinates.boundsInWindow()
    }
}
