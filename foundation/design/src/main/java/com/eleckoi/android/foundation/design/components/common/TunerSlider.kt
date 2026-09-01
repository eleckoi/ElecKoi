package com.eleckoi.android.foundation.design.components.common

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Remove
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import java.util.Locale
import kotlin.math.abs
import kotlin.math.round
import kotlin.math.roundToInt

// Hand-rolled instead of Material3's Slider. The stock one reads MaterialTheme.colorScheme.primary,
// which in this project is a leftover value nobody owns, and its bar-shaped thumb does not match
// the rest of the UI. Every colour here comes from AppearanceTheme, so custom themes stay legible.
@Composable
fun TunerSlider(
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    appearance: AppearanceTheme,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    onInteractionStart: () -> Unit = {},
    onInteractionFinished: () -> Unit = {},
) {
    val thumbSize = 18.dp
    val interactionHeight = 44.dp
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .height(interactionHeight),
    ) {
        val density = LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val thumbPx = with(density) { thumbSize.toPx() }
        val travelPx = (widthPx - thumbPx).coerceAtLeast(1f)
        val span = (range.endInclusive - range.start).takeIf { it > 0f } ?: 1f
        val fraction = ((value - range.start) / span).coerceIn(0f, 1f)

        fun emitAt(x: Float) = onValueChange(
            tunerValueAtPosition(
                positionX = x,
                width = widthPx,
                thumbWidth = thumbPx,
                range = range,
            ),
        )

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(4.dp)
                .align(Alignment.CenterStart)
                .clip(CircleShape)
                .background(appearance.mobileSoft.copy(alpha = 0.4f)),
        )
        Box(
            modifier = Modifier
                .width(with(density) { (thumbPx / 2f + fraction * travelPx).toDp() })
                .height(4.dp)
                .align(Alignment.CenterStart)
                .clip(CircleShape)
                .background(appearance.mobileText),
        )
        Box(
            modifier = Modifier
                .offset { IntOffset((fraction * travelPx).roundToInt(), 0) }
                .size(thumbSize)
                .align(Alignment.CenterStart)
                .clip(CircleShape)
                .background(appearance.mobileSurface)
                .border(0.5.dp, appearance.mobileSoft, CircleShape),
        )
        Box(
            modifier = Modifier
                .matchParentSize()
                .pointerInput(range) {
                    // Tap and drag used to be two recognizers on the same node. The tap recognizer
                    // could consume the down event before the drag recognizer owned the gesture,
                    // leaving the value stuck at the initial touch point. One pointer stream makes
                    // both tapping and continuous dragging deterministic.
                    awaitEachGesture {
                        val down = awaitFirstDown(requireUnconsumed = false)
                        onInteractionStart()
                        try {
                            emitAt(down.position.x)
                            down.consume()

                            var pressed = true
                            while (pressed) {
                                val change = awaitPointerEvent().changes
                                    .firstOrNull { it.id == down.id }
                                    ?: break
                                emitAt(change.position.x)
                                pressed = change.pressed
                                change.consume()
                            }
                        } finally {
                            onInteractionFinished()
                        }
                    }
                },
        )
    }
}

@Composable
fun TunerSliderRow(
    title: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    appearance: AppearanceTheme,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    step: Float = 0.1f,
    valueScale: Float = 1f,
    decimalPlaces: Int = 1,
    suffix: String = "",
    defaultValue: Float? = null,
    onSliderInteractionStart: () -> Unit = {},
    onSliderInteractionFinished: () -> Unit = {},
) {
    val focusManager = LocalFocusManager.current
    val formatValue = remember(valueScale, decimalPlaces) {
        { raw: Float ->
            String.format(Locale.US, "%.${decimalPlaces}f", raw * valueScale)
        }
    }
    var editorText by remember { mutableStateOf(formatValue(value)) }
    var editorFocused by remember { mutableStateOf(false) }

    fun emit(next: Float) {
        onValueChange(snapTunerValue(next, range, step))
    }

    LaunchedEffect(value, editorFocused, formatValue) {
        if (!editorFocused) editorText = formatValue(value)
    }

    Column(modifier = modifier.padding(bottom = 14.dp)) {
        Text(
            title,
            color = appearance.mobileText,
            fontSize = 13.sp,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 7.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PrecisionIconButton(
                icon = Icons.Rounded.Remove,
                contentDescription = "$title 减少",
                appearance = appearance,
                onClick = { emit(value - step) },
            )
            Box(
                modifier = Modifier
                    .padding(horizontal = 4.dp)
                    .width(if (decimalPlaces >= 2) 58.dp else 52.dp)
                    .height(30.dp)
                    .clip(CircleShape)
                    .background(Color.Transparent)
                    .border(0.5.dp, appearance.mobileLine, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                BasicTextField(
                    value = editorText,
                    onValueChange = { candidate ->
                        if (candidate.length <= 8 && candidate.all { it.isDigit() || it == '.' || it == ',' || it == '-' }) {
                            editorText = candidate
                            candidate.replace(',', '.').toFloatOrNull()?.let { displayed ->
                                emit(displayed / valueScale)
                            }
                        }
                    },
                    modifier = Modifier
                        .width(if (suffix.isBlank()) 44.dp else 34.dp)
                        .onFocusChanged { focusState ->
                            val wasFocused = editorFocused
                            editorFocused = focusState.isFocused
                            if (wasFocused && !focusState.isFocused) {
                                editorText = formatValue(value)
                            }
                        },
                    singleLine = true,
                    textStyle = TextStyle(
                        color = appearance.mobileText,
                        fontSize = 12.5.sp,
                        textAlign = TextAlign.Center,
                    ),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (range.start < 0f) KeyboardType.Text else KeyboardType.Decimal,
                        imeAction = ImeAction.Done,
                    ),
                    keyboardActions = KeyboardActions(
                        // Values already update live while typing; Done only closes the editor.
                        onDone = { focusManager.clearFocus() },
                    ),
                    decorationBox = { innerField ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                                innerField()
                            }
                            if (suffix.isNotBlank()) {
                                Text(suffix, color = appearance.mobileMuted, fontSize = 11.sp)
                            }
                        }
                    },
                )
            }
            PrecisionIconButton(
                icon = Icons.Rounded.Add,
                contentDescription = "$title 增加",
                appearance = appearance,
                onClick = { emit(value + step) },
            )
            if (defaultValue != null) {
                PrecisionIconButton(
                    icon = Icons.Rounded.Refresh,
                    contentDescription = "恢复${title}默认值",
                    appearance = appearance,
                    enabled = abs(value - defaultValue) > step / 100f,
                    onClick = { emit(defaultValue) },
                )
            }
        }
        TunerSlider(
            value = value,
            range = range,
            appearance = appearance,
            onValueChange = ::emit,
            onInteractionStart = onSliderInteractionStart,
            onInteractionFinished = onSliderInteractionFinished,
        )
    }
}

@Composable
private fun PrecisionIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    appearance: AppearanceTheme,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.size(30.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (enabled) appearance.mobileMuted else appearance.mobileLine,
            modifier = Modifier.size(16.dp),
        )
    }
}

internal fun snapTunerValue(
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    step: Float,
): Float {
    val clamped = value.coerceIn(range.start, range.endInclusive)
    if (step <= 0f) return clamped
    return (range.start + round((clamped - range.start) / step) * step)
        .coerceIn(range.start, range.endInclusive)
}

internal fun tunerValueAtPosition(
    positionX: Float,
    width: Float,
    thumbWidth: Float,
    range: ClosedFloatingPointRange<Float>,
): Float {
    val travel = (width - thumbWidth).coerceAtLeast(1f)
    val fraction = ((positionX - thumbWidth / 2f) / travel).coerceIn(0f, 1f)
    val span = (range.endInclusive - range.start).takeIf { it > 0f } ?: return range.start
    return range.start + fraction * span
}
