package com.eleckoi.android.foundation.design.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger

@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    appearance: AppearanceTheme,
    confirmText: String = "确认",
    dismissText: String = "取消",
    destructive: Boolean = false,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, color = appearance.mobileText) },
        text = { Text(message, color = appearance.mobileMuted) },
        confirmButton = {
            DialogConfirmButton(confirmText, appearance, destructive = destructive, onClick = onConfirm)
        },
        dismissButton = { DialogDismissButton(dismissText, appearance, onDismiss) },
        containerColor = appearance.mobileSurface,
    )
}

/**
 * A dialog action in the app's own colours.
 *
 * `TextButton` reads its content colour from `MaterialTheme`, which this app never configures — it
 * themes everything through [AppearanceTheme] instead. So every AlertDialog in the app was drawing
 * its actions in stock M3 pink next to UI that is otherwise blue. These two close that gap; reach
 * for them instead of a bare `TextButton` inside a dialog.
 */
@Composable
fun DialogConfirmButton(
    text: String,
    appearance: AppearanceTheme,
    enabled: Boolean = true,
    destructive: Boolean = false,
    onClick: () -> Unit,
) {
    TextButton(
        onClick = onClick,
        enabled = enabled,
        colors = ButtonDefaults.textButtonColors(
            contentColor = if (destructive) ElecKoiDanger else appearance.mobileBlue,
        ),
    ) {
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun DialogDismissButton(
    text: String,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    TextButton(
        onClick = onClick,
        colors = ButtonDefaults.textButtonColors(contentColor = appearance.mobileMuted),
    ) {
        Text(text)
    }
}
