package com.eleckoi.android.feature.chat.ui.blocks.reasoning

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit

@Composable
fun ReasoningShimmer(
    text: String,
    running: Boolean,
    color: Color,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
) {
    if (!running) {
        Text(
            text = text,
            modifier = modifier,
            color = color,
            fontSize = fontSize,
            fontWeight = FontWeight.Medium,
        )
        return
    }
    ReasoningShimmerText(
        text = text,
        color = color,
        fontSize = fontSize,
        phase = rememberReasoningShimmerPhase(),
        modifier = modifier,
    )
}

/**
 * The sweep position, hoisted so several labels can share one clock. Status rows swap their text
 * while the sweep keeps running; restarting the gradient per label would read as a stutter.
 */
@Composable
fun rememberReasoningShimmerPhase(): Float {
    val transition = rememberInfiniteTransition(label = "reasoning-shimmer")
    val shift by transition.animateFloat(
        initialValue = -0.45f,
        targetValue = 1.45f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1_400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "reasoning-shimmer-shift",
    )
    return shift
}

@Composable
fun ReasoningShimmerText(
    text: String,
    color: Color,
    fontSize: TextUnit,
    phase: Float,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier = modifier) {
        val width = constraints.maxWidth.toFloat().coerceAtLeast(1f)
        val center = width * phase
        Text(
            text = text,
            fontSize = fontSize,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            // Merged onto the ambient style rather than built fresh: a bare TextStyle would drop
            // the reader's chosen font, which is pushed through LocalTextStyle.
            style = LocalTextStyle.current.copy(
                brush = Brush.linearGradient(
                    colors = listOf(
                        color.copy(alpha = 0.48f),
                        color,
                        color.copy(alpha = 0.48f),
                    ),
                    start = Offset(center - width * 0.28f, 0f),
                    end = Offset(center + width * 0.28f, 0f),
                ),
            ),
        )
    }
}
