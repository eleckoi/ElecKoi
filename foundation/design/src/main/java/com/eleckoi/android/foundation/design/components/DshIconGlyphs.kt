package com.eleckoi.android.foundation.design.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun DshFolderGlyph(
    expanded: Boolean,
    tint: Color,
    modifier: Modifier = Modifier,
    iconSize: Dp = 20.dp,
) {
    TranslatedFilledSvgIcon(
        paths = if (expanded) DshIconPaths.FolderOpenOutline else DshIconPaths.FolderClose,
        color = tint,
        modifier = modifier,
        iconSize = iconSize,
        viewportSize = DshIconPaths.Viewport16,
    )
}

@Composable
fun DshProjectAddGlyph(
    tint: Color,
    modifier: Modifier = Modifier,
    iconSize: Dp = 20.dp,
) {
    TranslatedFilledSvgIcon(
        paths = DshIconPaths.ProjectAdd,
        color = tint,
        modifier = modifier,
        iconSize = iconSize,
        viewportSize = DshIconPaths.Viewport16,
    )
}

@Composable
fun DshGeneralGlyph(
    tint: Color,
    modifier: Modifier = Modifier,
    iconSize: Dp = 14.dp,
) {
    TranslatedFilledSvgIcon(
        paths = DshIconPaths.Globe,
        color = tint,
        modifier = modifier,
        iconSize = iconSize,
        viewportSize = DshIconPaths.Viewport14,
    )
}

@Composable
fun DshSettingsGlyph(
    tint: Color,
    modifier: Modifier = Modifier,
    iconSize: Dp = 20.dp,
) {
    TranslatedFilledSvgIcon(
        paths = DshIconPaths.Settings,
        color = tint,
        modifier = modifier,
        iconSize = iconSize,
        viewportSize = DshIconPaths.Viewport16,
    )
}

@Composable
fun DshSearchGlyph(
    tint: Color,
    modifier: Modifier = Modifier,
    iconSize: Dp = 20.dp,
) {
    TranslatedFilledSvgIcon(
        paths = DshIconPaths.Search,
        color = tint,
        modifier = modifier,
        iconSize = iconSize,
        viewportSize = DshIconPaths.Viewport16,
    )
}

@Composable
fun DshTrashGlyph(
    tint: Color,
    modifier: Modifier = Modifier,
    iconSize: Dp = 20.dp,
) {
    TranslatedFilledSvgIcon(
        paths = DshIconPaths.Trash,
        color = tint,
        modifier = modifier,
        iconSize = iconSize,
        viewportSize = DshIconPaths.Viewport16,
    )
}
