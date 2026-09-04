package com.eleckoi.android.feature.settings.ui.runtime

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.workspace.runtime.model.LocalRuntimeStorageUsage
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.themedListRowClickable

@Composable
internal fun RuntimeStatusCardContainer(
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = appearance.mobileSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, appearance.mobileLine),
    ) {
        Column(modifier = Modifier.padding(RuntimeCardPadding), content = content)
    }
}

@Composable
internal fun RuntimeCardBadge(
    paths: List<String>,
    tint: Color,
    plate: Color,
    strokeWidth: Float = 2.4f,
) {
    Box(
        modifier = Modifier.size(RuntimeBadgeSize).clip(CircleShape).background(plate),
        contentAlignment = Alignment.Center,
    ) {
        StrokeSvgIcon(paths, tint, iconSize = 17.dp, strokeWidth = strokeWidth)
    }
}

@Composable
internal fun RuntimeCardHeading(
    title: String,
    subtitle: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    monospaceSubtitle: Boolean = false,
) {
    Column(modifier) {
        Text(
            text = title,
            color = appearance.mobileText,
            fontSize = 15.5.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.SemiBold,
        )
        if (subtitle.isNotBlank()) {
            Text(
                text = subtitle,
                modifier = Modifier.padding(top = 3.dp),
                color = appearance.mobileMuted,
                fontSize = if (monospaceSubtitle) 11.5.sp else 12.sp,
                lineHeight = 16.sp,
                fontFamily = if (monospaceSubtitle) FontFamily.Monospace else FontFamily.Default,
                maxLines = if (monospaceSubtitle) 2 else Int.MAX_VALUE,
            )
        }
    }
}

@Composable
internal fun RuntimeCardDivider(appearance: AppearanceTheme, top: Dp, bottom: Dp) {
    Box(
        Modifier.padding(top = top, bottom = bottom)
            .fillMaxWidth()
            .height(1.dp)
            .background(appearance.mobileLine),
    )
}

@Composable
internal fun RuntimePrimaryButton(
    label: String,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(appearance.mobileBlue)
            .themedListRowClickable(appearance, onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
internal fun RuntimeQuietButton(label: String, appearance: AppearanceTheme, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .height(48.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(appearance.mobileSearchBg)
            .themedListRowClickable(appearance, onClick = onClick),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, color = appearance.mobileMuted, fontSize = 15.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
internal fun RuntimeReadingRow(
    label: String,
    value: String,
    appearance: AppearanceTheme,
    valueColor: Color = appearance.mobileMuted,
    modifier: Modifier = Modifier,
) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
        Text(label, modifier = Modifier.weight(1f), color = appearance.mobileMuted, fontSize = 12.5.sp)
        Text(value, color = valueColor, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
internal fun RuntimeInsetPanel(
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    verticalPadding: Dp = 11.dp,
    verticalArrangement: Arrangement.Vertical = Arrangement.Top,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier.fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(appearance.mobileSearchBg)
            .padding(horizontal = 13.dp, vertical = verticalPadding),
        verticalArrangement = verticalArrangement,
        content = content,
    )
}

@Composable
internal fun RuntimeFactRow(label: String, value: String, appearance: AppearanceTheme) {
    Row(verticalAlignment = Alignment.Bottom) {
        Text(label, modifier = Modifier.weight(1f), color = appearance.mobileMuted, fontSize = 12.sp)
        Text(value, color = appearance.mobileText, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
internal fun RuntimeCapacityBar(
    usage: LocalRuntimeStorageUsage,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val weights = if (usage.measured) {
        listOf(usage.ubuntuBytes, usage.harnessBytes, usage.toolchainBytes)
            .map { it.coerceAtLeast(1L).toFloat() }
    } else listOf(0.62f, 0.24f, 0.14f)
    val colors = if (usage.measured) runtimeCapacityColors(appearance)
    else List(3) { appearance.mobileLine }
    Row(
        modifier = modifier.fillMaxWidth().height(9.dp)
            .then(if (usage.measured) Modifier else Modifier.alpha(0.7f)),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        weights.forEachIndexed { index, weight ->
            Box(
                Modifier.weight(weight).fillMaxHeight()
                    .clip(
                        when (index) {
                            0 -> RoundedCornerShape(topStart = 5.dp, bottomStart = 5.dp)
                            weights.lastIndex -> RoundedCornerShape(topEnd = 5.dp, bottomEnd = 5.dp)
                            else -> RoundedCornerShape(0.dp)
                        },
                    )
                    .background(colors[index]),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun RuntimeCapacityLegend(
    usage: LocalRuntimeStorageUsage,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val colors = runtimeCapacityColors(appearance)
    val entries = listOf(
        Triple("Ubuntu", usage.ubuntuBytes, colors[0]),
        Triple("Harness", usage.harnessBytes, colors[1]),
        Triple("工具链", usage.toolchainBytes, colors[2]),
    )
    FlowRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        entries.forEach { (label, bytes, color) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(color))
                Text(label, color = appearance.mobileMuted, fontSize = 11.sp)
                Text(formatRuntimeBytes(bytes), color = appearance.mobileSoft, fontSize = 10.5.sp, fontFamily = FontFamily.Monospace)
            }
        }
    }
}

internal enum class RuntimeComponentState { Verified, Pending, Absent }

@Composable
internal fun RuntimeComponentChips(
    state: RuntimeComponentState,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val labels = listOf("Ubuntu", "DeepSeek Harness", "Landlock 边界", "ripgrep")
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        labels.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                pair.forEach { label -> RuntimeComponentChip(label, state, appearance, Modifier.weight(1f)) }
            }
        }
    }
}

@Composable
private fun RuntimeComponentChip(
    label: String,
    state: RuntimeComponentState,
    appearance: AppearanceTheme,
    modifier: Modifier,
) {
    val absent = state == RuntimeComponentState.Absent
    val shape = RoundedCornerShape(9.dp)
    Row(
        modifier = modifier.height(if (absent) 28.dp else 30.dp)
            .clip(shape)
            .then(
                if (absent) Modifier.border(1.dp, appearance.mobileLine, shape)
                else Modifier.background(appearance.mobileSearchBg),
            )
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        if (state == RuntimeComponentState.Verified) {
            StrokeSvgIcon(AppIconPaths.Check, appearance.mobileBlue, iconSize = 12.dp, strokeWidth = 2.8f)
        } else RuntimeHollowDot(appearance.mobileSoft)
        Text(
            text = label,
            color = if (state == RuntimeComponentState.Verified) appearance.mobileMuted else appearance.mobileSoft,
            fontSize = 12.sp,
            maxLines = 1,
        )
    }
}

internal enum class RuntimeStepMark { Done, Current, Failed, Pending }

@Composable
internal fun RuntimeMaintenanceSteps(
    phases: List<RuntimeMaintenancePhase>,
    currentIndex: Int,
    currentMark: RuntimeStepMark,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        phases.forEachIndexed { index, phase ->
            val mark = when {
                index < currentIndex -> RuntimeStepMark.Done
                index == currentIndex -> currentMark
                else -> RuntimeStepMark.Pending
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                when (mark) {
                    RuntimeStepMark.Done -> StrokeSvgIcon(AppIconPaths.Check, appearance.mobileBlue, iconSize = 12.dp, strokeWidth = 2.8f)
                    RuntimeStepMark.Current -> RuntimeHollowDot(appearance.mobileBlue)
                    RuntimeStepMark.Failed -> StrokeSvgIcon(AppIconPaths.X, ElecKoiDanger, iconSize = 12.dp, strokeWidth = 2.6f)
                    RuntimeStepMark.Pending -> RuntimeHollowDot(appearance.mobileSoft)
                }
                Text(
                    phase.label,
                    modifier = Modifier.weight(1f),
                    color = if (mark == RuntimeStepMark.Current || mark == RuntimeStepMark.Failed) appearance.mobileText else appearance.mobileSoft,
                    fontSize = 12.sp,
                )
                when (mark) {
                    RuntimeStepMark.Done -> RuntimeStepState("完成", appearance.mobileSoft)
                    RuntimeStepMark.Current -> RuntimeStepState("进行中", appearance.mobileBlue)
                    else -> Unit
                }
            }
        }
    }
}

@Composable
private fun RuntimeStepState(label: String, color: Color) {
    Text(label, color = color, fontSize = 10.5.sp, fontFamily = FontFamily.Monospace)
}

@Composable
private fun RuntimeHollowDot(color: Color) {
    Box(Modifier.size(12.dp).border(1.6.dp, color, CircleShape))
}

@Composable
internal fun RuntimeProgressRing(fraction: Float?, appearance: AppearanceTheme) {
    Box(Modifier.size(RuntimeBadgeSize), contentAlignment = Alignment.Center) {
        RuntimeRingCanvas(fraction, appearance.mobileBlue, appearance.mobileLine.copy(alpha = 0.9f))
    }
}

@Composable
private fun RuntimeRingCanvas(fraction: Float?, ring: Color, track: Color) {
    val transition = rememberInfiniteTransition(label = "runtimeRing")
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(1_150, easing = CubicBezierEasing(0.45f, 0.05f, 0.55f, 0.95f))),
        label = "runtimeRingAngle",
    )
    val settled by animateFloatAsState(
        targetValue = fraction?.coerceIn(0f, 1f) ?: 0f,
        animationSpec = tween(260),
        label = "runtimeRingFraction",
    )
    Canvas(Modifier.fillMaxSize()) {
        val stroke = 3.4f * density
        val diameter = size.minDimension - stroke
        val topLeft = Offset((size.width - diameter) / 2f, (size.height - diameter) / 2f)
        val arcSize = Size(diameter, diameter)
        drawArc(track, 0f, 360f, false, topLeft, arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
        drawArc(
            color = ring,
            startAngle = if (fraction == null) angle - 90f else -90f,
            sweepAngle = if (fraction == null) 86f else (settled * 360f).coerceAtLeast(2f),
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(stroke, cap = StrokeCap.Round),
        )
    }
}

@Composable
internal fun RuntimeProgressTrack(
    fraction: Float,
    fill: Color,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier.fillMaxWidth().height(9.dp).clip(RoundedCornerShape(5.dp))
            .background(appearance.mobileLine.copy(alpha = 0.9f)),
    ) {
        Box(
            Modifier.fillMaxHeight().fillMaxWidth(fraction.coerceIn(0f, 1f))
                .clip(RoundedCornerShape(5.dp)).background(fill),
        )
    }
}

private fun runtimeCapacityColors(appearance: AppearanceTheme): List<Color> = listOf(
    appearance.mobileBlue,
    appearance.mobileBlue.copy(alpha = 0.62f),
    appearance.mobileBlue.copy(alpha = 0.28f),
)

internal val RuntimeBadgeSize = 32.dp
private val RuntimeCardPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 20.dp)
