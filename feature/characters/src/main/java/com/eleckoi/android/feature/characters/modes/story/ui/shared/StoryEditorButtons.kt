package com.eleckoi.android.feature.characters.modes.story.ui.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.ui.settings.CrystalIconShape
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.paperCutPalette

@Composable
internal fun ManagementActionButton(
    text: String,
    icon: List<String>,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Row(
        modifier = modifier
            .height(42.dp)
            .clip(StoryEditorShapes.Control)
            .background(appearance.mobileSurface)
            .border(1.dp, appearance.mobileMuted.copy(alpha = 0.14f), StoryEditorShapes.Control)
            .noRippleClickable(onClick = { if (enabled) onClick() })
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        val color = if (enabled) appearance.mobileText else appearance.mobileMuted
        StrokeSvgIcon(icon, color, iconSize = 16.dp, strokeWidth = 1.65f)
        Text(text, modifier = Modifier.padding(start = 5.dp), color = color, fontSize = 12.sp, maxLines = 1)
    }
}

@Composable
internal fun HelperText(text: String, appearance: AppearanceTheme) {
    Text(
        text,
        color = appearance.mobileMuted,
        fontSize = 12.sp,
        lineHeight = 17.sp,
        modifier = Modifier.padding(top = 8.dp),
    )
}

@Composable
internal fun PaperIconButton(
    text: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val paper = appearance.paperCutPalette()
    Box(
        modifier = modifier
            .size(40.dp)
            .clip(CrystalIconShape)
            .background(paper.actionFace)
            .border(1.dp, paper.border.copy(alpha = 0.72f), CrystalIconShape)
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = paper.actionText, fontSize = 24.sp, fontWeight = FontWeight.Light)
    }
}

@Composable
internal fun StepButton(
    text: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .size(28.dp)
            .clip(StoryEditorShapes.Small)
            .background(appearance.mobileSurface)
            .border(1.dp, appearance.mobileMuted.copy(alpha = 0.14f), StoryEditorShapes.Small)
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = appearance.mobileText, fontSize = 18.sp)
    }
}
