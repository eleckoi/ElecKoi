package com.eleckoi.android.feature.chat.ui.loading

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.preferences.ChatWaitingAnimation
import kotlin.math.PI
import kotlin.math.sin

/**
 * A presentation-only status for the interval before the first renderable assistant event.
 *
 * It deliberately has no message model, avatar, name or surface. Every chat layout places it in a
 * fixed-height status slot directly above the composer, so fading it in never moves the timeline.
 */
@Composable
fun ChatWaitingReply(
    appearance: AppearanceTheme,
    animation: ChatWaitingAnimation,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TypingDotsGap),
    ) {
        Text(
            text = "Typing",
            color = appearance.mobileMuted,
            fontSize = 13.sp,
            fontStyle = FontStyle.Italic,
            letterSpacing = 0.35.sp,
        )
        when (animation) {
            ChatWaitingAnimation.Dots -> DotsThinkingIndicator(appearance = appearance)
            ChatWaitingAnimation.Cat -> CatThinkingIndicator(appearance = appearance)
        }
    }
}

@Composable
fun DotsThinkingIndicator(
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "dots-thinking")
    Row(
        modifier = modifier.height(DotsRowHeight),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(DotGap),
    ) {
        repeat(DotCount) { index ->
            val phase by transition.animateFloat(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(
                        durationMillis = DotsCycleMillis,
                        easing = LinearEasing,
                    ),
                    repeatMode = RepeatMode.Restart,
                    initialStartOffset = StartOffset(index * DotStaggerMillis),
                ),
                label = "dots-thinking-phase-$index",
            )
            val lift = if (phase < DotActiveFraction) {
                sin(phase / DotActiveFraction * PI.toFloat())
            } else {
                0f
            }
            Box(
                modifier = Modifier
                    .size(DotSize)
                    .graphicsLayer {
                        translationY = -DotLift.toPx() * lift
                        alpha = DotRestAlpha + (DotPeakAlpha - DotRestAlpha) * lift
                    }
                    .background(color = appearance.mobileMuted, shape = CircleShape),
            )
        }
    }
}

private const val DotCount = 3
private const val DotsCycleMillis = 1_250
private const val DotStaggerMillis = 160
private const val DotActiveFraction = 0.3f
private const val DotRestAlpha = 0.35f
private const val DotPeakAlpha = 0.9f
private val DotSize = 6.dp
private val DotGap = 5.dp
private val DotLift = 4.dp
private val DotsRowHeight = 20.dp
private val TypingDotsGap = 7.dp
