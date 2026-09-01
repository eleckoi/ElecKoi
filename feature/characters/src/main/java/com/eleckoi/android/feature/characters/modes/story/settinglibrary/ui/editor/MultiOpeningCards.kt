package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryOpeningMessage
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun PrimaryOpeningCard(
    message: SettingLibraryOpeningMessage,
    expanded: Boolean,
    canDelete: Boolean,
    appearance: AppearanceTheme,
    onToggle: () -> Unit,
    onTitleChange: (String) -> Unit,
    onContentChange: (String) -> Unit,
    onDuplicate: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .openingCardSurface(appearance),
    ) {
        OpeningHeaderRow(
            title = "主开场白",
            subtitle = message.title.ifBlank { "未命名开场白" },
            expanded = expanded,
            appearance = appearance,
            onToggle = onToggle,
            titleStyle = TextStyle(
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
            ),
            trailing = {
                Text(
                    text = "默认",
                    color = appearance.mobileBlue,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(end = 4.dp),
                )
            },
        )
        OpeningEditorVisibility(visible = expanded) {
            OpeningEditorContent(
                message = message,
                canDelete = canDelete,
                appearance = appearance,
                onTitleChange = onTitleChange,
                onContentChange = onContentChange,
                onDuplicate = onDuplicate,
                onDelete = onDelete,
            )
        }
    }
}

@Composable
internal fun BackupOpeningGroupCard(
    messages: List<SettingLibraryOpeningMessage>,
    expandedId: String?,
    appearance: AppearanceTheme,
    onToggle: (String) -> Unit,
    onMoveUp: (String) -> Unit,
    onMoveDown: (String) -> Unit,
    onTitleChange: (String, String) -> Unit,
    onContentChange: (String, String) -> Unit,
    onDuplicate: (SettingLibraryOpeningMessage) -> Unit,
    onDelete: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .openingCardSurface(appearance),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 18.dp, end = 16.dp, top = 17.dp, bottom = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "备用开场白",
                color = appearance.mobileText,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = "${messages.size} 条",
                color = appearance.mobileMuted,
                fontSize = 12.sp,
            )
        }
        if (messages.isEmpty()) {
            Text(
                text = "暂无备用开场白，点击右上角“新建”添加。",
                color = appearance.mobileMuted,
                fontSize = 13.sp,
                lineHeight = 20.sp,
                modifier = Modifier.padding(start = 18.dp, end = 18.dp, bottom = 18.dp),
            )
        } else {
            messages.forEachIndexed { index, message ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(0.5.dp)
                        .padding(horizontal = 16.dp)
                        .background(appearance.mobileMuted.copy(alpha = 0.14f)),
                )
                BackupOpeningRow(
                    message = message,
                    expanded = expandedId == message.id,
                    canMoveUp = index > 0,
                    canMoveDown = index < messages.lastIndex,
                    appearance = appearance,
                    onToggle = { onToggle(message.id) },
                    onMoveUp = { onMoveUp(message.id) },
                    onMoveDown = { onMoveDown(message.id) },
                    onTitleChange = { onTitleChange(message.id, it) },
                    onContentChange = { onContentChange(message.id, it) },
                    onDuplicate = { onDuplicate(message) },
                    onDelete = { onDelete(message.id) },
                )
            }
        }
    }
}

@Composable
internal fun BackupOpeningRow(
    message: SettingLibraryOpeningMessage,
    expanded: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    appearance: AppearanceTheme,
    onToggle: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onTitleChange: (String) -> Unit,
    onContentChange: (String) -> Unit,
    onDuplicate: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        OpeningHeaderRow(
            title = message.title.ifBlank { "未命名开场白" },
            subtitle = message.content.ifBlank { "尚未填写开场白" },
            expanded = expanded,
            appearance = appearance,
            onToggle = onToggle,
            trailing = {
                OpeningOrderAction(
                    icon = Icons.Rounded.KeyboardArrowUp,
                    description = "上移${message.title}",
                    enabled = canMoveUp,
                    appearance = appearance,
                    onClick = onMoveUp,
                )
                OpeningOrderAction(
                    icon = Icons.Rounded.KeyboardArrowDown,
                    description = "下移${message.title}",
                    enabled = canMoveDown,
                    appearance = appearance,
                    onClick = onMoveDown,
                )
            },
        )
        OpeningEditorVisibility(visible = expanded) {
            OpeningEditorContent(
                message = message,
                canDelete = true,
                appearance = appearance,
                onTitleChange = onTitleChange,
                onContentChange = onContentChange,
                onDuplicate = onDuplicate,
                onDelete = onDelete,
            )
        }
    }
}

