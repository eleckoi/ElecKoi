package com.eleckoi.android.foundation.design.components

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt

val MobileSwipeActionWidth: Dp = 76.dp

private const val SwipeSnapFraction = 0.4f
private const val SwipeSettleMillis = 280
private val SwipeSettleEasing = CubicBezierEasing(0.22f, 1f, 0.28f, 1f)

@Stable
class MobileSwipeState {
    var openKey: String? by mutableStateOf(null)
        private set

    fun open(key: String) {
        openKey = key
    }

    fun close() {
        openKey = null
    }
}

@Composable
fun rememberMobileSwipeState(): MobileSwipeState = remember { MobileSwipeState() }

data class MobileSwipeAction(
    val label: String,
    val containerColor: Color,
    val contentColor: Color,
    val onClick: () -> Unit,
    val icon: @Composable (Color) -> Unit,
)

/**
 * Lets a list row slide left to reveal fixed-width actions. Only the key stored in [state] stays
 * open, so opening a second row automatically closes the first one.
 *
 * [content] receives the safe row click: the first tap after a drag, or a tap while any row is
 * open, only closes the actions instead of opening the destination.
 */
@Composable
fun MobileSwipeRow(
    key: String,
    state: MobileSwipeState,
    actions: List<MobileSwipeAction>,
    rowHeight: Dp,
    rowContainerColor: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable (onRowClick: () -> Unit) -> Unit,
) {
    if (actions.isEmpty()) {
        content(onClick)
        return
    }

    val density = LocalDensity.current
    val revealPx = with(density) { (MobileSwipeActionWidth * actions.size).toPx() }
    var offsetPx by remember(key) { mutableFloatStateOf(0f) }
    var dragging by remember(key) { mutableStateOf(false) }
    var dragged by remember(key) { mutableStateOf(false) }
    var openedAtDragStart by remember(key) { mutableStateOf(false) }
    val open = state.openKey == key

    LaunchedEffect(open, revealPx, dragging) {
        if (!dragging) {
            animate(
                initialValue = offsetPx,
                targetValue = if (open) -revealPx else 0f,
                animationSpec = tween(SwipeSettleMillis, easing = SwipeSettleEasing),
            ) { value, _ ->
                offsetPx = value
            }
        }
    }

    val shifted by remember(key) { derivedStateOf { offsetPx < -0.5f } }
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(rowHeight)
            .clipToBounds(),
    ) {
        if (shifted) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .background(rowContainerColor),
                horizontalArrangement = Arrangement.End,
            ) {
                actions.forEach { action ->
                    Column(
                        modifier = Modifier
                            .width(MobileSwipeActionWidth)
                            .fillMaxHeight()
                            .background(action.containerColor)
                            .noRippleClickable {
                                state.close()
                                action.onClick()
                            },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        action.icon(action.contentColor)
                        Spacer(modifier = Modifier.height(5.dp))
                        Text(
                            text = action.label,
                            color = action.contentColor,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.Medium,
                        )
                    }
                }
            }
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .offset { IntOffset(offsetPx.roundToInt(), 0) }
                .background(if (shifted) rowContainerColor else Color.Transparent)
                .pointerInput(key, revealPx, open) {
                    detectHorizontalDragGestures(
                        onDragStart = {
                            openedAtDragStart = open
                            dragging = true
                            dragged = false
                        },
                        onDragEnd = {
                            val snapOpen = shouldOpenMobileSwipeActions(
                                offsetPx = offsetPx,
                                revealPx = revealPx,
                                openedAtDragStart = openedAtDragStart,
                            )
                            if (snapOpen) state.open(key) else if (open) state.close()
                            dragging = false
                        },
                        onDragCancel = {
                            dragging = false
                        },
                        onHorizontalDrag = { change, delta ->
                            change.consume()
                            dragged = true
                            offsetPx = (offsetPx + delta).coerceIn(-revealPx, 0f)
                        },
                    )
                },
        ) {
            content {
                when {
                    dragged -> dragged = false
                    state.openKey != null -> state.close()
                    else -> onClick()
                }
            }
        }
    }
}

internal fun shouldOpenMobileSwipeActions(
    offsetPx: Float,
    revealPx: Float,
    openedAtDragStart: Boolean = false,
): Boolean {
    if (revealPx <= 0f) return false
    val openBoundary = if (openedAtDragStart) {
        -revealPx * (1f - SwipeSnapFraction)
    } else {
        -revealPx * SwipeSnapFraction
    }
    return offsetPx < openBoundary
}
