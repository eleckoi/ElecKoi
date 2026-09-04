package com.eleckoi.android.feature.agenttools.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppSwitch

@Composable
internal fun AgentToolSwitch(
    checked: Boolean,
    appearance: AppearanceTheme,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    AppSwitch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        appearance = appearance,
        modifier = modifier,
        enabled = enabled,
    )
}
