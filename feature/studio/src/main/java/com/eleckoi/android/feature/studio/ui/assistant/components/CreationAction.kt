package com.eleckoi.android.feature.studio.ui.assistant.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun CreationAction(
    label: String,
    appearance: AppearanceTheme,
    emphasized: Boolean,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .defaultMinSize(minHeight = 44.dp)
            .clip(RoundedCornerShape(18.dp))
            .background(
                if (emphasized) {
                    appearance.mobileBlue.copy(alpha = 0.14f)
                } else {
                    appearance.mobileMuted.copy(alpha = 0.10f)
                },
            )
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = when {
                !enabled -> appearance.mobileMuted.copy(alpha = 0.55f)
                emphasized -> appearance.mobileBlue
                else -> appearance.mobileText
            },
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}
