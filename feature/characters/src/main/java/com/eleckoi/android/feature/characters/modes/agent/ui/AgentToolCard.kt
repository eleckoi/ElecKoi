package com.eleckoi.android.feature.characters.modes.agent.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.eleckoi.android.feature.characters.ui.settings.components.CharacterToolTile
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon

@Composable
internal fun AgentToolCard(
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
            iconSize = (22f * layoutScale).dp,
            strokeWidth = 1.6f,
        )
    }
}
