package com.eleckoi.android.feature.chat.ui.message

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.ChatOpeningOption
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun AssistantTools(
    message: ChatMessage,
    appearance: AppearanceTheme,
    regenerateEnabled: Boolean,
    onRegenerate: (ChatMessage) -> Unit,
    onCopy: () -> Unit,
    openingOptions: List<ChatOpeningOption>,
    selectedOpeningIndex: Int,
    onSelectOpeningOption: (String) -> Unit,
) {
    var processSheetOpen by remember(message.id) { mutableStateOf(false) }
    if (processSheetOpen) {
        ChatAgentProcessSheet(
            message = message,
            appearance = appearance,
            onDismiss = { processSheetOpen = false },
        )
    }
    Row(
        modifier = Modifier
            .padding(top = 2.dp)
            .then(if (openingOptions.isNotEmpty()) Modifier.fillMaxWidth() else Modifier),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(15.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ToolIconButton(AppIconPaths.Copy, appearance, onClick = onCopy)
            ToolIconButton(
                AppIconPaths.Refresh,
                appearance,
                enabled = regenerateEnabled,
                onClick = { onRegenerate(message) },
            )
            ToolIconButton(AppIconPaths.Speaker, appearance)
            ToolIconButton(AppIconPaths.Translate, appearance)
            if (message.hasAgentProcessRecord()) {
                ToolIconButton(AppIconPaths.History, appearance, onClick = { processSheetOpen = true })
            }
        }
        if (openingOptions.isNotEmpty()) {
            Spacer(modifier = Modifier.weight(1f))
            OpeningPageControls(
                options = openingOptions,
                selectedIndex = selectedOpeningIndex,
                appearance = appearance,
                onSelect = onSelectOpeningOption,
            )
        }
    }
}

@Composable
internal fun OpeningPageControls(
    options: List<ChatOpeningOption>,
    selectedIndex: Int,
    appearance: AppearanceTheme,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    if (options.size < 2 || selectedIndex !in options.indices) return
    var jumpDialogOpen by remember { mutableStateOf(false) }
    var pageInput by remember { mutableStateOf("") }
    val requestedPage = pageInput.toIntOrNull()
    val requestedIndex = requestedPage?.minus(1)
    val requestedIndexValid = requestedIndex != null && requestedIndex in options.indices

    if (jumpDialogOpen) {
        val submitJump = {
            val index = requestedIndex
            if (index != null && index in options.indices) {
                onSelect(options[index].id)
                jumpDialogOpen = false
            }
        }
        AlertDialog(
            onDismissRequest = { jumpDialogOpen = false },
            title = {
                Text(
                    text = "跳转到开场白",
                    color = appearance.mobileText,
                )
            },
            text = {
                OutlinedTextField(
                    value = pageInput,
                    onValueChange = { value ->
                        pageInput = value.filter(Char::isDigit).take(5)
                    },
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
                TextButton(onClick = submitJump, enabled = requestedIndexValid) {
                    Text("跳转")
                }
            },
            dismissButton = {
                TextButton(onClick = { jumpDialogOpen = false }) {
                    Text("取消")
                }
            },
            containerColor = appearance.mobileSurface,
            titleContentColor = appearance.mobileText,
            textContentColor = appearance.mobileMuted,
        )
    }

    Row(
        modifier = modifier,
        horizontalArrangement = if (compact) Arrangement.Start else Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OpeningPageArrow(
            paths = AppIconPaths.ChevronLeft,
            contentDescription = "上一条开场白",
            enabled = selectedIndex > 0,
            appearance = appearance,
            onClick = { onSelect(options[selectedIndex - 1].id) },
            compact = compact,
        )
        Text(
            text = "${selectedIndex + 1}/${options.size}",
            modifier = Modifier
                .padding(horizontal = if (compact) 1.dp else 3.dp)
                .semantics {
                    contentDescription = "第 ${selectedIndex + 1} 条，共 ${options.size} 条开场白，点击跳转"
                    role = Role.Button
                }
                .noRippleClickable {
                    pageInput = (selectedIndex + 1).toString()
                    jumpDialogOpen = true
                },
            color = appearance.mobileMuted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
        )
        OpeningPageArrow(
            paths = AppIconPaths.ChevronRight,
            contentDescription = "下一条开场白",
            enabled = selectedIndex < options.lastIndex,
            appearance = appearance,
            onClick = { onSelect(options[selectedIndex + 1].id) },
            compact = compact,
        )
    }
}

@Composable
private fun OpeningPageArrow(
    paths: List<String>,
    contentDescription: String,
    enabled: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
    compact: Boolean = false,
) {
    Box(
        modifier = Modifier
            .size(if (compact) 18.dp else 24.dp)
            .semantics {
                this.contentDescription = contentDescription
                role = Role.Button
            }
            .then(if (enabled) Modifier.noRippleClickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        StrokeSvgIcon(
            paths = paths,
            color = if (enabled) appearance.mobileMuted else appearance.mobileSoft.copy(alpha = 0.45f),
            iconSize = if (compact) 14.dp else 17.dp,
            strokeWidth = 1.9f,
        )
    }
}

