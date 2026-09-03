package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToDownIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.selectionPalette
import kotlinx.coroutines.delay

@Stable
class FocusDismissRegistry {
    val inputBounds = mutableStateListOf<Rect>()
}

val LocalFocusDismissRegistry = compositionLocalOf<FocusDismissRegistry?> { null }

/**
 * Lets the full visual input surface focus its actual text editor without consuming its tap.
 *
 * Focus is requested only after a complete tap. A pointer-down is deliberately not enough: when
 * the field is inside a vertically scrolling form, a drag also starts with a pointer-down and
 * must remain a scroll rather than opening the keyboard.
 */
fun Modifier.focusInputOnPointerDown(focusRequester: FocusRequester): Modifier =
    pointerInput(focusRequester) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            val up = waitForUpOrCancellation()
            if (up != null && !down.isConsumed && !up.isConsumed) {
                focusRequester.requestFocus()
            }
        }
    }

fun Modifier.noRippleClickable(
    enabled: Boolean = true,
    onClick: () -> Unit,
): Modifier = composed {
    clickable(
        enabled = enabled,
        interactionSource = remember { MutableInteractionSource() },
        indication = null,
        onClick = onClick,
    )
}

@OptIn(ExperimentalFoundationApi::class)
fun Modifier.themedListRowClickable(
    appearance: AppearanceTheme,
    enabled: Boolean = true,
    selected: Boolean = false,
    selectedBackground: Color? = null,
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit,
): Modifier = composed {
    val selection = appearance.selectionPalette()
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val instantPressed = remember { mutableStateOf(false) }
    LaunchedEffect(instantPressed.value) {
        if (instantPressed.value) {
            delay(MinVisiblePressMillis)
            instantPressed.value = false
        }
    }
    val background = when {
        pressed || instantPressed.value -> selection.activeContainer
        selected -> selectedBackground ?: selection.activeContainer
        else -> Color.Transparent
    }
    this
        .pointerInput(enabled) {
            if (!enabled) return@pointerInput
            awaitPointerEventScope {
                while (true) {
                    val downEvent = awaitPointerEvent(PointerEventPass.Initial)
                    downEvent.changes.firstOrNull { it.changedToDownIgnoreConsumed() } ?: continue
                    instantPressed.value = true
                }
            }
        }
        .background(background)
        .combinedClickable(
            enabled = enabled,
            interactionSource = interactionSource,
            indication = null,
            onLongClick = onLongClick,
            onClick = onClick,
        )
}

private const val MinVisiblePressMillis = 55L

fun Modifier.clearFocusOnBlankTap(
    enabled: Boolean = true,
    onBlankTap: (() -> Unit)? = null,
): Modifier = composed {
    if (!enabled) {
        this
    } else {
        val focusManager = LocalFocusManager.current
        val keyboardController = LocalSoftwareKeyboardController.current
        val registry = LocalFocusDismissRegistry.current
        val currentOnBlankTap by rememberUpdatedState(onBlankTap)
        val rootBounds = remember { mutableStateOf(Rect.Zero) }
        pointerInput(focusManager, keyboardController, registry) {
            awaitPointerEventScope {
                while (true) {
                    val event = awaitPointerEvent(PointerEventPass.Initial)
                    val down = event.changes.firstOrNull { it.changedToDownIgnoreConsumed() } ?: continue
                    val root = rootBounds.value
                    val pointInWindow = Offset(root.left + down.position.x, root.top + down.position.y)
                    val tappedInput = registry?.inputBounds?.any { bounds -> bounds.contains(pointInWindow) } == true
                    if (!tappedInput) {
                        currentOnBlankTap?.invoke()
                        focusManager.clearFocus(force = true)
                        keyboardController?.hide()
                    }
                }
            }
        }.onGloballyPositioned { rootBounds.value = it.boundsInWindow() }
    }
}

fun Modifier.focusDismissInputRegion(): Modifier = composed {
    val registry = LocalFocusDismissRegistry.current
    if (registry == null) {
        this
    } else {
        val boundsState = remember { mutableStateOf<Rect?>(null) }
        DisposableEffect(registry) {
            onDispose {
                boundsState.value?.let { registry.inputBounds.remove(it) }
            }
        }
        onGloballyPositioned { coordinates ->
            val oldBounds = boundsState.value
            if (oldBounds != null) {
                registry.inputBounds.remove(oldBounds)
            }
            val newBounds = coordinates.boundsInWindow()
            boundsState.value = newBounds
            registry.inputBounds.add(newBounds)
        }
    }
}

fun Modifier.imeBringIntoViewOnFocus(
    scrollState: ScrollState?,
    imeBottomPx: Int,
    margin: Dp = 16.dp,
): Modifier = composed {
    if (scrollState == null) {
        this
    } else {
        val view = LocalView.current
        val density = LocalDensity.current
        val focused = remember { mutableStateOf(false) }
        val bounds = remember { mutableStateOf<Rect?>(null) }
        val marginPx = with(density) { margin.toPx() }

        // Keyed on focus and the keyboard only — never on the field's bounds.
        //
        // Bounds change every time the field moves, and scrolling moves it, so keying the effect on
        // them turned this into a loop: drag up, the bounds change, the effect re-runs, and it
        // scrolls the field's bottom back into view. A field shorter than the space above the
        // keyboard never tripped it, because the overflow was zero; a field that grows with its
        // content is always taller than that, so every drag got yanked back.
        LaunchedEffect(focused.value, imeBottomPx) {
            if (!focused.value || imeBottomPx <= 0) return@LaunchedEffect
            // One frame for the keyboard inset to land in layout before measuring against it.
            withFrameNanos { }
            val currentBounds = bounds.value ?: return@LaunchedEffect
            val keyboardTop = view.height - imeBottomPx
            val overflow = currentBounds.bottom - (keyboardTop - marginPx)
            if (overflow > 0f) {
                scrollState.scrollBy(overflow)
            }
        }

        this
            .onGloballyPositioned { bounds.value = it.boundsInWindow() }
            .onFocusChanged { focused.value = it.isFocused }
    }
}
