package com.eleckoi.android.feature.chat.ui.sheets

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.AppearanceTheme
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Bottom-anchored modal surface whose dedicated handle supports downward dismissal.
 *
 * Use this for fixed-height settings screens whose children own vertical scrolling. Unlike
 * Material3 ModalBottomSheet, unconsumed child flings cannot move or overshoot this surface; only
 * the top handle can translate it, and that translation is clamped so the sheet cannot move up.
 */
@Composable
internal fun FixedModalSheet(
    onDismissRequest: () -> Unit,
    appearance: AppearanceTheme,
    content: @Composable () -> Unit,
) {
    var dragOffsetPx by remember { mutableFloatStateOf(0f) }
    var reboundJob by remember { mutableStateOf<Job?>(null) }
    val scope = rememberCoroutineScope()
    val dismissThresholdPx = with(LocalDensity.current) { 72.dp.toPx() }

    fun settleHandle() {
        reboundJob?.cancel()
        val initialOffset = dragOffsetPx
        reboundJob = scope.launch {
            animate(
                initialValue = initialOffset,
                targetValue = 0f,
                animationSpec = tween(durationMillis = 200),
            ) { value, _ ->
                dragOffsetPx = value
            }
        }
    }

    Dialog(
        onDismissRequest = onDismissRequest,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        // The platform dialog normally adds its own dim layer. Disable it so the explicit scrim
        // below remains the single source of truth and matches the rest of the chat overlays.
        val dialogView = LocalView.current
        SideEffect {
            (dialogView.parent as? DialogWindowProvider)?.window?.setDimAmount(0f)
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.32f))
                .noRippleClickable(onClick = onDismissRequest),
            contentAlignment = Alignment.BottomCenter,
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .fillMaxHeight(0.88f)
                    .offset { IntOffset(x = 0, y = dragOffsetPx.roundToInt()) }
                    // Consume blank-surface taps so only the surrounding scrim dismisses.
                    .noRippleClickable(onClick = {}),
                shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
                color = appearance.mobileSurface,
                contentColor = appearance.mobileText,
                shadowElevation = 12.dp,
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(28.dp)
                            .pointerInput(onDismissRequest, dismissThresholdPx) {
                                detectVerticalDragGestures(
                                    onDragStart = { reboundJob?.cancel() },
                                    onVerticalDrag = { change, dragAmount ->
                                        change.consume()
                                        dragOffsetPx = (dragOffsetPx + dragAmount).coerceAtLeast(0f)
                                    },
                                    onDragEnd = {
                                        if (dragOffsetPx >= dismissThresholdPx) {
                                            onDismissRequest()
                                        } else {
                                            settleHandle()
                                        }
                                    },
                                    onDragCancel = ::settleHandle,
                                )
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Box(
                            modifier = Modifier
                                .width(36.dp)
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp))
                                .background(appearance.mobileSoft.copy(alpha = 0.78f)),
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        content()
                    }
                }
            }
        }
    }
}
