package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.selectionPalette

@Composable
fun CharacterActionButtons(
    appearance: AppearanceTheme,
    isAssistantRunning: Boolean,
    onOpenManager: () -> Unit,
    onOpenAssistant: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val selection = appearance.selectionPalette()
    Column(modifier = modifier.fillMaxWidth()) {
        CharacterActionRow(
            label = "角色卡管理器",
            icon = AppIconPaths.CharacterManager,
            iconCircles = listOf(SvgCircle(17.4f, 17f, 2.65f)),
            iconColor = selection.indicator,
            appearance = appearance,
            onClick = onOpenManager,
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 48.dp)
                .height(0.5.dp)
                .background(appearance.mobileLine),
        )
        CharacterActionRow(
            label = "AI 创作助手",
            icon = AppIconPaths.Sparkles,
            iconCircles = emptyList(),
            iconColor = selection.indicator,
            appearance = appearance,
            showBadge = isAssistantRunning,
            onClick = onOpenAssistant,
        )
    }
}

/** QQ-style region break between character utilities and the character/group-chat directory. */
@Composable
fun CharacterDirectoryBoundary(appearance: AppearanceTheme) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(8.dp)
            .background(appearance.mobileTabbarBg),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(0.5.dp)
                .background(appearance.mobileLine),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(0.5.dp)
                .align(Alignment.BottomCenter)
                .background(appearance.mobileLine),
        )
    }
}

@Composable
private fun CharacterActionRow(
    label: String,
    icon: List<String>,
    iconCircles: List<SvgCircle>,
    iconColor: Color,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
    showBadge: Boolean = false,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(contentAlignment = Alignment.TopEnd) {
            StrokeSvgIcon(
                paths = icon,
                circles = iconCircles,
                color = iconColor,
                iconSize = 22.dp,
                strokeWidth = 1.85f,
            )
            if (showBadge) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(appearance.mobileBlue),
                )
            }
        }
        Text(
            text = label,
            modifier = Modifier
                .padding(start = 10.dp)
                .weight(1f),
            color = appearance.mobileText,
            fontSize = 16.5.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
        )
        StrokeSvgIcon(
            paths = AppIconPaths.ChevronRight,
            color = appearance.mobileSoft,
            iconSize = 17.dp,
            strokeWidth = 1.85f,
        )
    }
}

@Composable
fun SegmentTabs(
    left: String,
    right: String,
    appearance: AppearanceTheme,
    activeLeft: Boolean = true,
    onLeft: () -> Unit = {},
    onRight: () -> Unit = {},
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .height(44.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SegmentTab(
            text = left,
            active = activeLeft,
            appearance = appearance,
            modifier = Modifier
                .weight(1f)
                .noRippleClickable(onClick = onLeft),
        )
        SegmentTab(
            text = right,
            active = !activeLeft,
            appearance = appearance,
            modifier = Modifier
                .weight(1f)
                .noRippleClickable(onClick = onRight),
        )
    }
}

@Composable
private fun SegmentTab(
    text: String,
    active: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier,
) {
    val selection = appearance.selectionPalette()
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier.weight(1f),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = text,
                color = if (active) selection.activeText else selection.mutedText,
                fontSize = 17.sp,
                fontWeight = FontWeight.Medium,
            )
        }
        Box(
            modifier = Modifier
                .height(3.dp)
                .fillMaxWidth(if (active) 0.44f else 0f)
                .clip(RoundedCornerShape(999.dp))
                .background(if (active) selection.indicator else Color.Transparent),
        )
    }
}
