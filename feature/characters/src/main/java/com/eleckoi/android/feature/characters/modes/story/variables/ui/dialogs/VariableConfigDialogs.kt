package com.eleckoi.android.feature.characters.modes.story.variables.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppInsetTextField

@Composable
internal fun VariableNameDialog(
    title: String,
    value: String,
    duplicate: Boolean,
    duplicateText: String,
    confirmText: String,
    appearance: AppearanceTheme,
    onValueChange: (String) -> Unit,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    val name = value.trim()
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, color = appearance.mobileText) },
        text = {
            Column {
                AppInsetTextField(
                    value = value,
                    onValueChange = { onValueChange(it.take(60)) },
                    appearance = appearance,
                    textStyle = TextStyle(color = appearance.mobileText, fontSize = 16.sp),
                )
                if (duplicate) {
                    Text(duplicateText, color = appearance.mobileBlue, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                }
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank() && !duplicate, onClick = onConfirm) { Text(confirmText) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
        containerColor = appearance.mobileSurface,
    )
}

@Composable
internal fun VariableDeleteConfirmDialog(
    kindLabel: String,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("删除$kindLabel？", color = appearance.mobileText) },
        text = {
            Text(
                if (kindLabel == "变量组") "会同时删除这个变量组里的子变量组和变量。" else "会删除这个变量。",
                color = appearance.mobileMuted,
            )
        },
        confirmButton = { TextButton(onClick = onConfirm) { Text("删除") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
        containerColor = appearance.mobileSurface,
    )
}
