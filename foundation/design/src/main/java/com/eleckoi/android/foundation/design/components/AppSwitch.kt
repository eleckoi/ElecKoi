package com.eleckoi.android.foundation.design.components

import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.eleckoi.android.foundation.design.AppearanceTheme

/** One switch treatment for every ElecKoi surface. */
@Composable
fun AppSwitch(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    appearance: AppearanceTheme,
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
            checkedBorderColor = Color.Transparent,
            uncheckedThumbColor = appearance.mobileAccentFg,
            uncheckedTrackColor = appearance.mobileSoft.copy(alpha = 0.55f),
            uncheckedBorderColor = Color.Transparent,
            disabledCheckedThumbColor = appearance.mobileAccentFg.copy(alpha = 0.72f),
            disabledCheckedTrackColor = appearance.mobileBlue.copy(alpha = 0.42f),
            disabledCheckedBorderColor = Color.Transparent,
            disabledUncheckedThumbColor = appearance.mobileAccentFg.copy(alpha = 0.72f),
            disabledUncheckedTrackColor = appearance.mobileSoft.copy(alpha = 0.28f),
            disabledUncheckedBorderColor = Color.Transparent,
        ),
    )
}
