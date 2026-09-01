package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable

/** Lets users identify the JSON family before choosing the file to import. */
@Composable
internal fun SettingLibraryImportSourceDialog(
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onImportElecKoi: () -> Unit,
    onImportSillyTavernWorldBook: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("选择导入来源", color = appearance.mobileText) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SettingLibraryImportSourceRow(
                    title = "本项目设定库",
                    description = "导入 ElecKoi 导出的设定库",
                    appearance = appearance,
                    onClick = onImportElecKoi,
                )
                SettingLibraryImportSourceRow(
                    title = "酒馆世界书",
                    description = "导入 SillyTavern 世界书 JSON",
                    appearance = appearance,
                    onClick = onImportSillyTavernWorldBook,
                )
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
        containerColor = appearance.mobileSurface,
    )
}

@Composable
private fun SettingLibraryImportSourceRow(
    title: String,
    description: String,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .clip(RoundedCornerShape(12.dp))
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        StrokeSvgIcon(
            paths = AppIconPaths.Import,
            color = appearance.mobileText,
            iconSize = 23.dp,
            strokeWidth = 1.8f,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = appearance.mobileText,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = description,
                color = appearance.mobileMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
