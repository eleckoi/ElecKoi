package com.eleckoi.android.foundation.design.components

import android.view.HapticFeedbackConstants
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

@Composable
internal fun CropTool(
    paths: List<String>,
    label: String,
    tint: Color,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .sizeIn(minWidth = 48.dp, minHeight = 48.dp)
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 10.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        StrokeSvgIcon(paths, tint, iconSize = 23.dp)
        Text(label, color = tint, fontSize = 11.sp, modifier = Modifier.padding(top = 5.dp))
    }
}

/**
 * 角度尺。刻度跟着手指走，中间那根指针不动——读数永远在同一个位置，不用追着看。每过 1° 给一下
 * 轻震，每 5° 重一点，回到 0° 吸附住并确认一下，就是手机自带裁剪器那种顿挫感。
 */
@Composable
internal fun AngleRuler(
    angle: Float,
    appearance: AppearanceTheme,
    onAngleChange: (Float) -> Unit,
    onScrubStart: () -> Unit,
    onScrubEnd: () -> Unit,
) {
    val density = LocalDensity.current
    val view = LocalView.current
    val pxPerDegree = with(density) { 9.dp.toPx() }
    // pointerInput 的代码块只在 key 变化时重启，直接闭包捕获 angle 会永远停在第一次组合时的值，
    // 每一下拖动都从那个旧值重算，尺子看着就像拖不动。这里始终读最新的。
    val latestAngle by rememberUpdatedState(angle)
    val latestOnAngleChange by rememberUpdatedState(onAngleChange)

    Column(modifier = Modifier.fillMaxWidth().background(BarBackground).padding(top = 14.dp)) {
        Text(
            "${angle.roundToInt()}°",
            modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp),
            color = if (abs(angle) < 0.5f) BarMuted else appearance.mobileBlue,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
        // 尺子是中间的一段，不贴边。通栏的尺子看不出中心在哪，指针也就失去了参照。
        Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 46.dp).height(46.dp)) {
            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(pxPerDegree) {
                        // 累加的是没吸附过的原始角度，不然一进 0° 附近就被吸住，再也拖不出来。
                        var scrubbed = 0f
                        var lastTick = 0
                        detectHorizontalDragGestures(
                            onDragStart = {
                                scrubbed = latestAngle
                                lastTick = latestAngle.roundToInt()
                                onScrubStart()
                            },
                            onDragEnd = onScrubEnd,
                            onDragCancel = onScrubEnd,
                        ) { change, dragAmount ->
                            change.consume()
                            scrubbed = (scrubbed - dragAmount / pxPerDegree).coerceIn(-MaxAngle, MaxAngle)
                            val snapped = if (abs(scrubbed) < AngleSnapWindow) 0f else scrubbed
                            val tick = snapped.roundToInt()
                            if (tick != lastTick) {
                                lastTick = tick
                                view.performHapticFeedback(
                                    when {
                                        tick == 0 -> HapticFeedbackConstants.CONFIRM
                                        tick % 5 == 0 -> HapticFeedbackConstants.TEXT_HANDLE_MOVE
                                        else -> HapticFeedbackConstants.CLOCK_TICK
                                    },
                                )
                            }
                            latestOnAngleChange(snapped)
                        }
                    },
            ) {
                val centerX = size.width / 2f
                val visible = (size.width / 2f / pxPerDegree).toInt() + 2
                val first = (floor(angle).toInt() - visible).coerceAtLeast(-MaxAngle.toInt())
                val last = (floor(angle).toInt() + visible).coerceAtMost(MaxAngle.toInt())
                for (degree in first..last) {
                    val x = centerX + (degree - angle) * pxPerDegree
                    val major = degree % 5 == 0
                    val tickHeight = if (major) 17.dp.toPx() else 10.dp.toPx()
                    drawLine(
                        color = BarText.copy(alpha = if (major) 0.72f else 0.28f),
                        start = Offset(x, size.height / 2f - tickHeight / 2f),
                        end = Offset(x, size.height / 2f + tickHeight / 2f),
                        strokeWidth = 1.5.dp.toPx(),
                    )
                }
                drawLine(
                    color = appearance.mobileBlue,
                    start = Offset(centerX, size.height / 2f - 12.dp.toPx()),
                    end = Offset(centerX, size.height / 2f + 12.dp.toPx()),
                    strokeWidth = 2.5.dp.toPx(),
                )
            }
        }
    }
}
