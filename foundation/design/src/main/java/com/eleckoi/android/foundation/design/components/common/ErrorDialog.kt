package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
fun ErrorDialog(
    message: String,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
) {
    val title = when {
        message.contains("校验") && message.contains("变量") -> "变量校验失败"
        else -> "操作失败"
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, color = appearance.mobileText) },
        text = {
            SelectionContainer {
                Text(
                    text = message,
                    modifier = Modifier.heightIn(max = 320.dp).verticalScroll(rememberScrollState()),
                    color = appearance.mobileMuted,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("知道了", color = appearance.mobileBlue)
            }
        },
        containerColor = appearance.mobileSurface,
    )
}
