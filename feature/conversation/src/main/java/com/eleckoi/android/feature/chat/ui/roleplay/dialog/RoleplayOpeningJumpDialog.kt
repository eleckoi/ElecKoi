package com.eleckoi.android.feature.chat.ui.roleplay.dialog

import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import com.eleckoi.android.feature.chat.model.ChatOpeningOption
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun RoleplayOpeningJumpDialog(
    options: List<ChatOpeningOption>,
    selectedIndex: Int,
    appearance: AppearanceTheme,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var pageInput by remember(selectedIndex) {
        mutableStateOf((selectedIndex + 1).coerceAtLeast(1).toString())
    }
    val requestedIndex = pageInput.toIntOrNull()?.minus(1)
    val requestedIndexValid = requestedIndex != null && requestedIndex in options.indices
    val submitJump: () -> Unit = {
        requestedIndex?.takeIf { it in options.indices }?.let { index ->
            onSelect(options[index].id)
            onDismiss()
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("跳转到开场白", color = appearance.mobileText) },
        text = {
            OutlinedTextField(
                value = pageInput,
                onValueChange = { value -> pageInput = value.filter(Char::isDigit).take(5) },
                singleLine = true,
                label = { Text("页码（1–${options.size}）") },
                isError = pageInput.isNotEmpty() && !requestedIndexValid,
                supportingText = if (pageInput.isNotEmpty() && !requestedIndexValid) {
                    { Text("请输入 1 到 ${options.size}") }
                } else {
                    null
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Number,
                    imeAction = ImeAction.Done,
                ),
                keyboardActions = KeyboardActions(onDone = { submitJump() }),
            )
        },
        confirmButton = {
            TextButton(onClick = submitJump, enabled = requestedIndexValid) { Text("跳转") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
        containerColor = appearance.mobileSurface,
        titleContentColor = appearance.mobileText,
        textContentColor = appearance.mobileMuted,
    )
}
