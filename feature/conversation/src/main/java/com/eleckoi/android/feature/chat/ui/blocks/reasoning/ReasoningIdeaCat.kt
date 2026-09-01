package com.eleckoi.android.feature.chat.ui.blocks.reasoning

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.components.ThinkingMascotSpriteFrame
import com.eleckoi.android.foundation.design.components.ThinkingMascotSpriteIcon
import com.eleckoi.android.foundation.design.components.ThinkingMascotSpriteStyle
import com.eleckoi.android.feature.chat.ui.LocalChatRenderingPreferences
import com.eleckoi.android.feature.preferences.ChatTimelineThinkingAnimation

/** The blinking whale-maid mascot displayed beside a reasoning surface. */
@Suppress("UNUSED_PARAMETER")
@Composable
fun ReasoningIdeaCat(
    coverColor: Color,
    surfaceVisible: Boolean,
    animated: Boolean = true,
    styleOverride: ChatTimelineThinkingAnimation? = null,
    modifier: Modifier = Modifier,
) {
    val style = styleOverride ?: LocalChatRenderingPreferences.current.timelineThinkingAnimation
    if (style == ChatTimelineThinkingAnimation.Bars) {
        TimelineThinkingBars(
            animated = animated,
            modifier = modifier,
        )
        return
    }
    val entrance = if (animated) {
        var reveal by remember { mutableFloatStateOf(0f) }
        LaunchedEffect(Unit) { reveal = 1f }
        val animatedEntrance by androidx.compose.animation.core.animateFloatAsState(
            targetValue = reveal,
            animationSpec = spring(
                dampingRatio = 0.72f,
                stiffness = 260f,
            ),
            label = "reasoning-peek-entrance",
        )
        animatedEntrance
    } else {
        1f
    }
    val blinkPhase: Float
    val bulbScale: Float
    val sparkAlpha: Float
    val mascotTilt: Float
    if (animated) {
        val transition = rememberInfiniteTransition(label = "reasoning-idea-whale-maid")
        blinkPhase = transition.animateFloat(
            initialValue = 0f,
            targetValue = BlinkCycleMillis,
            animationSpec = infiniteRepeatable(
                animation = tween(BlinkCycleMillis.toInt(), easing = LinearEasing),
                repeatMode = RepeatMode.Restart,
            ),
            label = "reasoning-mascot-blink",
        ).value
        bulbScale = transition.animateFloat(
            initialValue = 0.84f,
            targetValue = 1.12f,
            animationSpec = infiniteRepeatable(
                animation = tween(560, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "reasoning-bulb-scale",
        ).value
        sparkAlpha = transition.animateFloat(
            initialValue = 0.22f,
            targetValue = 0.95f,
            animationSpec = infiniteRepeatable(
                animation = tween(420, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "reasoning-bulb-sparks",
        ).value
        mascotTilt = transition.animateFloat(
            initialValue = -10.5f,
            targetValue = -6.5f,
            animationSpec = infiniteRepeatable(
                animation = tween(1_050, easing = FastOutSlowInEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "reasoning-mascot-tilt",
        ).value
    } else {
        blinkPhase = 0f
        bulbScale = 1f
        sparkAlpha = 0.72f
        mascotTilt = 0f
    }

    Box(
        modifier = modifier
            .size(width = 27.dp, height = 24.dp)
            .graphicsLayer { alpha = entrance.coerceIn(0f, 1f) },
    ) {
        ThinkingMascotSpriteIcon(
            frame = reasoningBlinkFrame(blinkPhase),
            style = when (style) {
                ChatTimelineThinkingAnimation.Bars -> ThinkingMascotSpriteStyle.BigHead
                ChatTimelineThinkingAnimation.HalfBody -> ThinkingMascotSpriteStyle.HalfBody
                ChatTimelineThinkingAnimation.BigHead -> ThinkingMascotSpriteStyle.BigHead
            },
            modifier = Modifier
                .size(21.dp)
                .align(Alignment.BottomStart)
                .graphicsLayer {
                    rotationZ = mascotTilt
                    transformOrigin = TransformOrigin(0.5f, 0.86f)
                },
        )
        PixelIdeaBulb(
            sparkAlpha = sparkAlpha,
            modifier = Modifier
                .size(8.dp)
                .align(Alignment.TopEnd)
                .offset(x = (-3).dp, y = 1.dp)
                .graphicsLayer {
                    alpha = ((entrance - 0.42f) / 0.58f).coerceIn(0f, 1f)
                    scaleX = bulbScale
                    scaleY = bulbScale
                },
        )
    }
}

@Composable
private fun TimelineThinkingBars(
    animated: Boolean,
    modifier: Modifier = Modifier,
) {
    val phase = if (animated) {
        val transition = rememberInfiniteTransition(label = "timeline-thinking-bars")
        transition.animateFloat(
            initialValue = 0f,
            targetValue = (Math.PI * 2.0).toFloat(),
            animationSpec = infiniteRepeatable(
                animation = tween(780, easing = LinearEasing),
                repeatMode = RepeatMode.Restart,
            ),
            label = "timeline-thinking-bars-phase",
        ).value
    } else {
        0f
    }
    Canvas(modifier = modifier.size(width = 27.dp, height = 24.dp)) {
        val widths = 3.dp.toPx()
        val gaps = 2.5.dp.toPx()
        val baseHeights = floatArrayOf(9.dp.toPx(), 17.dp.toPx(), 12.dp.toPx())
        val totalWidth = widths * baseHeights.size + gaps * (baseHeights.size - 1)
        val left = (size.width - totalWidth) / 2f
        baseHeights.forEachIndexed { index, baseHeight ->
            val wave = if (animated) {
                (0.5f + 0.5f * kotlin.math.sin(phase + index * 2.1f))
            } else {
                1f
            }
            val height = baseHeight * (0.48f + wave * 0.52f)
            drawRoundRect(
                color = TimelineThinkingBarsColor.copy(alpha = 0.48f + wave * 0.52f),
                topLeft = Offset(
                    x = left + index * (widths + gaps),
                    y = (size.height - height) / 2f,
                ),
                size = Size(widths, height),
                cornerRadius = CornerRadius(widths / 2f),
            )
        }
    }
}

@Composable
private fun PixelIdeaBulb(
    sparkAlpha: Float,
    modifier: Modifier,
) {
    Canvas(modifier = modifier) {
        val pixel = size.minDimension / 10f
        val light = Color(0xFFFFD65A)
        val core = Color(0xFFFFF2A6)
        val shade = Color(0xFFE39A32)

        fun pixelRect(x: Float, y: Float, width: Float = 1f, height: Float = 1f, color: Color) {
            drawRect(
                color = color,
                topLeft = Offset(x * pixel, y * pixel),
                size = Size(width * pixel, height * pixel),
            )
        }

        // Three alternating square rays keep the icon recognizably pixel-art at very small sizes.
        pixelRect(1f, 2f, color = light.copy(alpha = sparkAlpha))
        pixelRect(4.5f, 0f, color = core.copy(alpha = 1f - sparkAlpha * 0.45f))
        pixelRect(8f, 2f, color = light.copy(alpha = sparkAlpha))

        pixelRect(3f, 2f, 4f, 1f, light)
        pixelRect(2f, 3f, 6f, 3f, light)
        pixelRect(3f, 3f, 3f, 2f, core)
        pixelRect(3f, 6f, 4f, 1f, shade)
        pixelRect(4f, 7f, 2f, 1f, shade.copy(alpha = 0.86f))
    }
}

private fun reasoningBlinkFrame(phaseMillis: Float): ThinkingMascotSpriteFrame = when (phaseMillis) {
    in 820f..900f,
    in 1_020f..1_100f -> ThinkingMascotSpriteFrame.HalfClosed
    in 900f..1_020f -> ThinkingMascotSpriteFrame.Closed
    in 1_900f..1_970f,
    in 2_070f..2_140f -> ThinkingMascotSpriteFrame.HalfClosed
    in 1_970f..2_070f -> ThinkingMascotSpriteFrame.Closed
    else -> ThinkingMascotSpriteFrame.Open
}

private const val BlinkCycleMillis = 2_700f
private val TimelineThinkingBarsColor = Color(0xFFA9CCEF)
