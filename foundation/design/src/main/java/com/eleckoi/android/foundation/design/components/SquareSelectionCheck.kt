package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun SquareSelectionCheck(
    selected: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val selectedColor = appearance.mobileBlue.copy(alpha = if (enabled) 1f else 0.45f)
    val outlineColor = appearance.mobileLine.copy(alpha = if (enabled) 1f else 0.45f)
    val shape = RoundedCornerShape(6.dp)
    Box(
        modifier = modifier
            .size(24.dp)
            .background(if (selected) selectedColor else Color.Transparent, shape)
            .border(1.5.dp, if (selected) selectedColor else outlineColor, shape),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = appearance.mobileAccentFg.copy(alpha = if (enabled) 1f else 0.72f),
                modifier = Modifier.size(17.dp),
            )
        }
    }
}
