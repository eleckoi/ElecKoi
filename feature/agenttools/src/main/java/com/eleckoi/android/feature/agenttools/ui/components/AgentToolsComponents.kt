package com.eleckoi.android.feature.agenttools.ui.components

import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun AgentToolSwitch(
    checked: Boolean,
    appearance: AppearanceTheme,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    Switch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        enabled = enabled,
        colors = SwitchDefaults.colors(
            checkedThumbColor = appearance.mobileAccentFg,
            checkedTrackColor = appearance.mobileBlue,
            uncheckedThumbColor = appearance.mobileSurface,
            uncheckedTrackColor = appearance.mobileSoft.copy(alpha = 0.55f),
            uncheckedBorderColor = Color.Transparent,
            disabledCheckedThumbColor = appearance.mobileAccentFg.copy(alpha = 0.72f),
            disabledCheckedTrackColor = appearance.mobileBlue.copy(alpha = 0.42f),
        ),
    )
}
