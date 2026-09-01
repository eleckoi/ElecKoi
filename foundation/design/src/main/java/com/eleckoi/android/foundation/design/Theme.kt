package com.eleckoi.android.foundation.design

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val ElecKoiDanger = Color(0xFFE05260)
val ElecKoiSuccess = Color(0xFF2FA866)

private val ElecKoiColorScheme = lightColorScheme(
    primary = Color(0xFFC47D91),
    background = Color(0xFFF2E8EE),
    surface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFFF4F5F7),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceContainerLow = Color(0xFFFCFCFD),
    surfaceContainer = Color(0xFFFFFFFF),
    surfaceContainerHigh = Color(0xFFF5F6F8),
    surfaceContainerHighest = Color(0xFFEEF0F3),
    onPrimary = Color.White,
    onBackground = Color(0xFF161821),
    onSurface = Color(0xFF161821),
    onSurfaceVariant = Color(0xFF6F7580),
    outline = Color(0xFFBFC4CC),
    outlineVariant = Color(0xFFE2E5E9),
)

@Composable
fun ElecKoiTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ElecKoiColorScheme,
        content = content,
    )
}
