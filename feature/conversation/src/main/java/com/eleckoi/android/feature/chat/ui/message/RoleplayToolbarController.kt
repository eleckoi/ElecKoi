package com.eleckoi.android.feature.chat.ui.message

import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToDownIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned

@Stable
internal class RoleplayToolbarController {
    var expandedMessageId by mutableStateOf<String?>(null)
        private set

    /**
     * The header is allowed to use the compact title width only after the expanded actions have
     * finished fading away. Keeping this separate from [expandedMessageId] prevents the title
     * from moving underneath a still-visible toolbar during collapse.
     */
    var titleExpandedMessageId by mutableStateOf<String?>(null)
        private set

    private val toolbarBounds = mutableStateMapOf<String, Rect>()

    fun expand(messageId: String) {
        expandedMessageId = messageId
        titleExpandedMessageId = messageId
    }

    fun dismiss() {
        expandedMessageId = null
    }

    fun finishCollapsePresentation(messageId: String) {
        if (expandedMessageId != messageId && titleExpandedMessageId == messageId) {
            titleExpandedMessageId = null
        }
    }

    fun updateBounds(messageId: String, bounds: Rect) {
        toolbarBounds[messageId] = bounds
    }

    fun removeBounds(messageId: String) {
        toolbarBounds.remove(messageId)
        if (expandedMessageId == messageId) {
            dismiss()
        }
        if (titleExpandedMessageId == messageId) {
            titleExpandedMessageId = null
        }
    }

    fun containsExpandedToolbar(pointInWindow: Offset): Boolean {
        val messageId = expandedMessageId ?: return false
        return toolbarBounds[messageId]?.contains(pointInWindow) == true
    }
}

internal fun Modifier.dismissRoleplayToolbarOnOutsidePress(
    controller: RoleplayToolbarController,
): Modifier = composed {
    val rootBounds = remember { mutableStateOf(Rect.Zero) }
    pointerInput(controller) {
        awaitPointerEventScope {
            while (true) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val down = event.changes.firstOrNull { it.changedToDownIgnoreConsumed() } ?: continue
                if (controller.expandedMessageId == null) continue
                val root = rootBounds.value
                val pointInWindow = Offset(root.left + down.position.x, root.top + down.position.y)
                if (!controller.containsExpandedToolbar(pointInWindow)) {
                    controller.dismiss()
                }
            }
        }
    }.onGloballyPositioned { coordinates ->
        rootBounds.value = coordinates.boundsInWindow()
    }
}

internal fun Modifier.roleplayToolbarRegion(
    controller: RoleplayToolbarController,
    messageId: String,
): Modifier = composed {
    DisposableEffect(controller, messageId) {
        onDispose { controller.removeBounds(messageId) }
    }
    onGloballyPositioned { coordinates ->
        controller.updateBounds(messageId, coordinates.boundsInWindow())
    }
}
