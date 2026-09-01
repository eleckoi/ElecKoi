package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.eleckoi.android.foundation.design.AppearanceTheme
import kotlin.math.roundToInt

/** Latest native token sample used to explain the active model context budget. */
data class ContextWindowUsage(
    val latestTokens: Long? = null,
    val totalTokens: Long? = null,
    val modelContextWindow: Long? = null,
)

@Composable
fun ContextWindowUsageControl(
    usage: ContextWindowUsage?,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier = modifier) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .noRippleClickable { expanded = true }
                .semantics { contentDescription = "上下文窗口用量" },
            contentAlignment = Alignment.Center,
        ) {
            ContextWindowRing(usage = usage, appearance = appearance)
        }
        ContextWindowUsagePopup(
            expanded = expanded,
            usage = usage,
            appearance = appearance,
            onDismissRequest = { expanded = false },
        )
    }
}

@Composable
private fun ContextWindowRing(
    usage: ContextWindowUsage?,
    appearance: AppearanceTheme,
) {
    val contextWindow = usage?.modelContextWindow?.takeIf { it > 0L }
    val usedTokens = usage?.latestTokens?.coerceAtLeast(0L)
    val usedFraction = if (contextWindow != null && usedTokens != null) {
        (usedTokens.toFloat() / contextWindow.toFloat()).coerceIn(0f, 1f)
    } else {
        0f
    }
    Canvas(modifier = Modifier.size(18.dp)) {
        val strokeWidth = 2.25.dp.toPx()
        drawArc(
            color = appearance.mobileMuted.copy(alpha = 0.22f),
            startAngle = -90f,
            sweepAngle = 360f,
            useCenter = false,
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
        )
        if (usedFraction > 0f) {
            drawArc(
                color = appearance.mobileMuted,
                startAngle = -90f,
                sweepAngle = usedFraction * 360f,
                useCenter = false,
                style = Stroke(width = strokeWidth, cap = StrokeCap.Round),
            )
        }
    }
}

@Composable
private fun ContextWindowUsagePopup(
    expanded: Boolean,
    usage: ContextWindowUsage?,
    appearance: AppearanceTheme,
    onDismissRequest: () -> Unit,
) {
    if (!expanded) return
    val density = LocalDensity.current
    val positionProvider = remember(density) {
        AboveAnchorPopupPositionProvider(
            windowMarginPx = with(density) { 8.dp.roundToPx() },
            anchorGapPx = with(density) { 5.dp.roundToPx() },
            anchorInsetPx = with(density) { 92.dp.roundToPx() },
        )
    }
    Popup(
        popupPositionProvider = positionProvider,
        onDismissRequest = onDismissRequest,
        properties = PopupProperties(focusable = false),
    ) {
        Surface(
            modifier = Modifier.width(220.dp),
            shape = RoundedCornerShape(14.dp),
            color = appearance.mobileSurface,
            tonalElevation = 0.dp,
            shadowElevation = 8.dp,
            border = BorderStroke(1.dp, appearance.mobileLine),
        ) {
            Column(modifier = Modifier.padding(horizontal = 15.dp, vertical = 12.dp)) {
                Text(
                    "上下文窗口",
                    color = appearance.mobileText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                )
                val contextWindow = usage?.modelContextWindow?.takeIf { it > 0L }
                val activeTokens = usage?.latestTokens?.coerceAtLeast(0L)
                when {
                    contextWindow != null && activeTokens != null -> {
                        val usedPercent = (
                            activeTokens.toDouble() / contextWindow.toDouble() * 100.0
                            ).coerceIn(0.0, 100.0).roundToInt()
                        Text(
                            "$usedPercent% 已用（剩余 ${100 - usedPercent}%）",
                            color = appearance.mobileText,
                            fontSize = 13.sp,
                            lineHeight = 19.sp,
                        )
                        Text(
                            "已用 ${formatTokenCount(activeTokens)} Token，共 ${formatTokenCount(contextWindow)}",
                            color = appearance.mobileText,
                            fontSize = 13.sp,
                            lineHeight = 19.sp,
                        )
                    }
                    usage?.totalTokens != null -> Text(
                        "已累计使用 ${formatTokenCount(usage.totalTokens.coerceAtLeast(0L))} Token",
                        color = appearance.mobileText,
                        fontSize = 13.sp,
                        lineHeight = 19.sp,
                    )
                    else -> Text(
                        "等待 Agent Harness 返回用量数据",
                        color = appearance.mobileMuted,
                        fontSize = 13.sp,
                        lineHeight = 19.sp,
                    )
                }
            }
        }
    }
}

private fun formatTokenCount(tokens: Long): String = when {
    tokens >= 1_000_000L -> formatCompactTokenCount(tokens, 1_000_000L, "m")
    tokens >= 1_000L -> formatCompactTokenCount(tokens, 1_000L, "k")
    else -> tokens.toString()
}

private fun formatCompactTokenCount(tokens: Long, unit: Long, suffix: String): String {
    val whole = tokens / unit
    val remainder = tokens % unit
    if (remainder == 0L) return "$whole$suffix"
    val tenths = ((remainder * 10L) / unit).coerceIn(0L, 9L)
    return if (tenths == 0L) "$whole$suffix" else "$whole.$tenths$suffix"
}
