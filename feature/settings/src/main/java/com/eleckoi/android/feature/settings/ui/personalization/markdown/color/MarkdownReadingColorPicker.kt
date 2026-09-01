package com.eleckoi.android.feature.settings.ui.personalization.markdown

import android.graphics.Color as AndroidColor
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun ReadingColorPickerDialog(
    role: MarkdownReadingColorRole,
    initial: Color,
    followsTheme: Boolean,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onFollowTheme: () -> Unit,
    onSave: (Color) -> Unit,
) {
    val initialHsv = remember(initial) { initial.toHsv() }
    var hue by remember(initial) { mutableFloatStateOf(initialHsv[0]) }
    var saturation by remember(initial) { mutableFloatStateOf(initialHsv[1]) }
    var value by remember(initial) { mutableFloatStateOf(initialHsv[2]) }
    var hexText by remember(initial) { mutableStateOf(initial.hex().removePrefix("#")) }
    val selected = Color(AndroidColor.HSVToColor(floatArrayOf(hue, saturation, value)))

    fun updateSelection(nextHue: Float, nextSaturation: Float, nextValue: Float) {
        hue = nextHue.coerceIn(0f, 360f)
        saturation = nextSaturation.coerceIn(0f, 1f)
        value = nextValue.coerceIn(0f, 1f)
        hexText = Color(AndroidColor.HSVToColor(floatArrayOf(hue, saturation, value)))
            .hex()
            .removePrefix("#")
    }

    fun updateFromHex(input: String) {
        val normalized = input.removePrefix("#")
            .filter { it.isDigit() || it.uppercaseChar() in 'A'..'F' }
            .take(6)
            .uppercase()
        hexText = normalized
        normalized.toColorOrNull()?.let { color ->
            val hsv = color.toHsv()
            hue = hsv[0]
            saturation = hsv[1]
            value = hsv[2]
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = appearance.mobileSurface,
        shape = RoundedCornerShape(28.dp),
        title = {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(role.label, color = appearance.mobileText, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                Text(
                    if (followsTheme) "当前使用主题自动颜色" else "正在编辑自定义颜色",
                    color = appearance.mobileMuted,
                    fontSize = 12.sp,
                )
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(48.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(selected)
                            .border(Dp.Hairline, appearance.mobileLine, RoundedCornerShape(14.dp)),
                    )
                    OutlinedTextField(
                        value = hexText,
                        onValueChange = ::updateFromHex,
                        modifier = Modifier
                            .weight(1f)
                            .padding(start = 12.dp),
                        label = { Text("HEX 色值") },
                        prefix = { Text("#") },
                        singleLine = true,
                        isError = hexText.isNotEmpty() && hexText.length != 6,
                        supportingText = {
                            if (hexText.isNotEmpty() && hexText.length != 6) {
                                Text("请输入 6 位十六进制颜色")
                            }
                        },
                    )
                }
                Text("取色面板", color = appearance.mobileMuted, fontSize = 12.sp)
                ColorSpectrumPicker(
                    hue = hue,
                    saturation = saturation,
                    value = value,
                    onSelect = { nextSaturation, nextValue ->
                        updateSelection(hue, nextSaturation, nextValue)
                    },
                )
                Text("色相", color = appearance.mobileMuted, fontSize = 12.sp)
                HuePicker(hue = hue, onHueChange = { updateSelection(it, saturation, value) })
            }
        },
        confirmButton = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = onFollowTheme,
                    colors = ButtonDefaults.textButtonColors(contentColor = appearance.mobileBlue),
                ) {
                    Text("恢复主题")
                }
                Spacer(Modifier.weight(1f))
                OutlinedButton(
                    onClick = onDismiss,
                    border = BorderStroke(Dp.Hairline, appearance.mobileLine),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = appearance.mobileText),
                ) {
                    Text("取消")
                }
                Button(
                    onClick = { onSave(selected) },
                    modifier = Modifier.padding(start = 8.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = appearance.mobileBlue,
                        contentColor = appearance.mobileAccentFg,
                    ),
                ) {
                    Text("保存")
                }
            }
        },
    )
}

@Composable
private fun ColorSpectrumPicker(
    hue: Float,
    saturation: Float,
    value: Float,
    onSelect: (saturation: Float, value: Float) -> Unit,
) {
    var size by remember { mutableStateOf(IntSize.Zero) }
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(164.dp)
            .clip(RoundedCornerShape(16.dp))
            .onSizeChanged { size = it }
            .pointerInput(hue, size) {
                fun selectAt(position: Offset) {
                    val width = size.width.toFloat().coerceAtLeast(1f)
                    val height = size.height.toFloat().coerceAtLeast(1f)
                    onSelect(
                        (position.x / width).coerceIn(0f, 1f),
                        (1f - position.y / height).coerceIn(0f, 1f),
                    )
                }
                detectDragGestures(
                    onDragStart = ::selectAt,
                    onDrag = { change, _ -> selectAt(change.position) },
                )
            },
    ) {
        val corner = CornerRadius(16.dp.toPx())
        drawRoundRect(brush = Brush.horizontalGradient(listOf(Color.White, hueColor(hue))), cornerRadius = corner)
        drawRoundRect(brush = Brush.verticalGradient(listOf(Color.Transparent, Color.Black)), cornerRadius = corner)
        val marker = Offset(size.width * saturation, size.height * (1f - value))
        drawCircle(Color.Black.copy(alpha = 0.36f), radius = 10.dp.toPx(), center = marker, style = Stroke(4.dp.toPx()))
        drawCircle(Color.White, radius = 10.dp.toPx(), center = marker, style = Stroke(2.dp.toPx()))
    }
}

@Composable
private fun HuePicker(hue: Float, onHueChange: (Float) -> Unit) {
    var size by remember { mutableStateOf(IntSize.Zero) }
    Canvas(
        modifier = Modifier
            .fillMaxWidth()
            .height(30.dp)
            .clip(RoundedCornerShape(15.dp))
            .onSizeChanged { size = it }
            .pointerInput(size) {
                fun selectAt(position: Offset) {
                    val width = size.width.toFloat().coerceAtLeast(1f)
                    onHueChange((position.x / width * 360f).coerceIn(0f, 360f))
                }
                detectDragGestures(
                    onDragStart = ::selectAt,
                    onDrag = { change, _ -> selectAt(change.position) },
                )
            },
    ) {
        val corner = CornerRadius(15.dp.toPx())
        drawRoundRect(
            brush = Brush.horizontalGradient(
                listOf(Color.Red, Color.Yellow, Color.Green, Color.Cyan, Color.Blue, Color.Magenta, Color.Red),
            ),
            cornerRadius = corner,
        )
        val marker = Offset(size.width * (hue / 360f), size.height / 2f)
        drawCircle(Color.Black.copy(alpha = 0.40f), radius = 10.dp.toPx(), center = marker, style = Stroke(4.dp.toPx()))
        drawCircle(Color.White, radius = 10.dp.toPx(), center = marker, style = Stroke(2.dp.toPx()))
    }
}
