package com.eleckoi.android.feature.characters.modes.story.ui

import androidx.compose.runtime.Composable
import androidx.compose.material3.Icon
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.characters.ui.settings.components.CharacterToolTile
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon

@Composable
internal fun StoryToolCard(
    title: String,
    subtitle: String,
    icon: List<String>,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    layoutScale: Float = 1f,
    onClick: () -> Unit = {},
) {
    CharacterToolTile(
        title = title,
        subtitle = subtitle,
        appearance = appearance,
        modifier = modifier,
        layoutScale = layoutScale,
        onClick = onClick,
    ) { color ->
        StrokeSvgIcon(
            paths = icon,
            color = color,
            iconSize = (25f * layoutScale).dp,
            strokeWidth = 1.7f,
        )
    }
}

@Composable
internal fun StoryToolCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    layoutScale: Float = 1f,
    onClick: () -> Unit = {},
) {
    CharacterToolTile(
        title = title,
        subtitle = subtitle,
        appearance = appearance,
        modifier = modifier,
        layoutScale = layoutScale,
        onClick = onClick,
    ) { color ->
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size((27f * layoutScale).dp),
        )
    }
}
