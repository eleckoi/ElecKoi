package com.eleckoi.android.feature.chat.ui.loading

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.ThinkingMascotSpriteFrame
import com.eleckoi.android.foundation.design.components.ThinkingMascotSpriteIcon
import com.eleckoi.android.foundation.design.components.ThinkingMascotSpriteStyle

@Composable
fun CatThinkingIndicator(
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val iconSize = 24.dp
    val trackWidth = 62.dp
    val travelDistance = trackWidth - iconSize
    val transition = rememberInfiniteTransition(label = "whale-maid-thinking")
    val phaseMillis by transition.animateFloat(
        initialValue = 0f,
        targetValue = CatThinkingCycleMillis,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = CatThinkingCycleMillis.toInt(),
                easing = LinearEasing,
            ),
            repeatMode = RepeatMode.Restart,
        ),
        label = "whale-maid-thinking-phase",
    )
    val rollingRight = phaseMillis < CatRollDurationMillis
    val rollingLeft = phaseMillis in CatReturnStartMillis..CatReturnEndMillis
    val horizontalProgress = when {
        rollingRight -> phaseMillis / CatRollDurationMillis
        phaseMillis < CatReturnStartMillis -> 1f
        rollingLeft -> 1f - (
            (phaseMillis - CatReturnStartMillis) /
                (CatReturnEndMillis - CatReturnStartMillis)
            )
        else -> 0f
    }.coerceIn(0f, 1f)
    val rotation = when {
        rollingRight -> 360f * horizontalProgress
        rollingLeft -> -360f * (1f - horizontalProgress)
        else -> 0f
    }

    Box(modifier = modifier.height(32.dp), contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .width(trackWidth)
                .height(30.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            CatDustTrail(
                horizontalProgress = horizontalProgress,
                rollingRight = rollingRight,
                rollingLeft = rollingLeft,
                color = appearance.mobileMuted,
                modifier = Modifier.fillMaxSize(),
            )
            ThinkingMascotSpriteIcon(
                frame = thinkingMascotBlinkFrame(phaseMillis),
                style = ThinkingMascotSpriteStyle.HalfBody,
                modifier = Modifier
                    .size(iconSize)
                    .offset(x = travelDistance * horizontalProgress)
                    .graphicsLayer { rotationZ = rotation },
            )
        }
    }
}

@Composable
private fun CatDustTrail(
    horizontalProgress: Float,
    rollingRight: Boolean,
    rollingLeft: Boolean,
    color: Color,
    modifier: Modifier = Modifier,
) {
    if (!rollingRight && !rollingLeft) return
    val movementProgress = if (rollingRight) horizontalProgress else 1f - horizontalProgress
    Canvas(modifier = modifier) {
        val iconSizePx = 24.dp.toPx()
        val travelDistancePx = 38.dp.toPx()
        val catLeft = travelDistancePx * horizontalProgress
        val direction = if (rollingRight) 1f else -1f
        val trailingEdge = if (rollingRight) catLeft + 3.dp.toPx() else catLeft + iconSizePx - 3.dp.toPx()
        val floorY = size.height * 0.76f
        val particleOffsets = floatArrayOf(0f, 0.34f, 0.68f, 0.84f)

        particleOffsets.forEachIndexed { index, offset ->
            val life = (movementProgress * 3.2f + offset) % 1f
            val drift = (4f + life * (9f + index * 1.2f)).dp.toPx()
            val lift = (life * (5f + index % 2 * 2f)).dp.toPx()
            val particleSize = (2.6f - life * 1.2f).dp.toPx()
            drawRect(
                color = color.copy(alpha = (0.58f * (1f - life)).coerceAtLeast(0.08f)),
                topLeft = Offset(
                    x = trailingEdge - direction * drift,
                    y = floorY - lift - (index % 2) * 1.5.dp.toPx(),
                ),
                size = Size(particleSize, particleSize),
            )
        }
    }
}

private fun thinkingMascotBlinkFrame(phaseMillis: Float): ThinkingMascotSpriteFrame {
    fun frameAt(blinkStart: Float): ThinkingMascotSpriteFrame? = when (phaseMillis) {
        in blinkStart..(blinkStart + 70f) -> ThinkingMascotSpriteFrame.HalfClosed
        in (blinkStart + 70f)..(blinkStart + 170f) -> ThinkingMascotSpriteFrame.Closed
        in (blinkStart + 170f)..(blinkStart + 240f) -> ThinkingMascotSpriteFrame.HalfClosed
        else -> null
    }
    return frameAt(CatRightBlinkStartMillis)
        ?: frameAt(CatLeftBlinkStartMillis)
        ?: ThinkingMascotSpriteFrame.Open
}

private const val CatRollDurationMillis = 800f
private const val CatRightBlinkStartMillis = 1_000f
private const val CatReturnStartMillis = 1_500f
private const val CatReturnEndMillis = 2_300f
private const val CatLeftBlinkStartMillis = 2_500f
private const val CatThinkingCycleMillis = 3_000f
