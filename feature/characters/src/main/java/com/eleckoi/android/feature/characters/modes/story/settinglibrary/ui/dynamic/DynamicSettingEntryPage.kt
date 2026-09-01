package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.BubbleActionMenu
import com.eleckoi.android.foundation.design.components.MobileHeaderMenuAction
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.settingLibraryGroupPath
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryConversation
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryTriggerMode
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isFixedEntry
import com.eleckoi.android.feature.characters.modes.story.ui.shared.PlainInput
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorHeader
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.ConfirmDialog
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.*

@Composable
internal fun DynamicSettingEntryPage(
    selection: DynamicSettingEntrySelection,
    saving: Boolean,
    creating: Boolean = false,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onSave: (title: String, content: String) -> Unit,
    onDelete: (() -> Unit)?,
) {
    val groups = remember(selection.conversation.library.groups) {
        selection.conversation.library.groups.associateBy { it.id }
    }
    val groupPath = settingLibraryGroupPath(groups[selection.entry.groupId], groups)
    val displayPath = listOf(selection.conversation.title, groupPath)
        .filter(String::isNotBlank)
        .joinToString("/")
    val scrollState = rememberScrollState()
    var title by remember(selection.entry.id) { mutableStateOf(selection.entry.title) }
    var content by remember(selection.entry.id) { mutableStateOf(selection.entry.content) }
    var menuOpen by remember(selection.entry.id) { mutableStateOf(false) }
    var confirmDelete by remember(selection.entry.id) { mutableStateOf(false) }
    val changed = creating || title != selection.entry.title || content != selection.entry.content
    val canSave = changed && title.trim().isNotBlank() && content.trim().isNotBlank() && !saving
    val editable = !selection.entry.isFixedEntry() &&
        selection.entry.triggerMode == SettingLibraryTriggerMode.AgentTool

    if (!editable) {
        DynamicReadOnlySettingEntryPage(selection, appearance, onBack)
        return
    }

    LaunchedEffect(selection.entry.title, selection.entry.content, saving) {
        if (!saving) {
            title = selection.entry.title
            content = selection.entry.content
        }
    }

    PinnedStatusScaffold(appearance = appearance, imeAware = false, backgroundColor = appearance.mobileBg) {
        StoryEditorHeader(
            title = if (creating) "新建动态设定" else "编辑动态设定",
            appearance = appearance,
            onBack = onBack,
            action = if (!creating && onDelete != null) {
                {
                Box(contentAlignment = Alignment.Center) {
                    DynamicOverflowMenuButton(
                        enabled = !saving,
                        onClick = { menuOpen = true },
                    )
                    BubbleActionMenu(
                        expanded = menuOpen,
                        actions = listOf(
                            MobileHeaderMenuAction(
                                label = "删除设定",
                                icon = AppIconPaths.Trash,
                                tint = ElecKoiDanger,
                                onClick = { confirmDelete = true },
                            ),
                        ),
                        appearance = appearance,
                        onDismiss = { menuOpen = false },
                    )
                }
                }
            } else {
                null
            },
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .background(appearance.mobileBg)
                .imePadding()
                .verticalScroll(scrollState)
                .padding(horizontal = 18.dp, vertical = 16.dp),
        ) {
            if (displayPath.isNotBlank()) {
                Text(displayPath, color = appearance.mobileMuted, fontSize = 13.sp)
            }
            PlainInput(
                label = "设定标题",
                value = title,
                appearance = appearance,
                scrollState = scrollState,
                imeBottomPx = 0,
                minHeight = 58,
                placeholder = "设定标题",
                singleLine = true,
                groupedStyle = true,
                onChange = { title = it.take(120) },
            )
            PlainInput(
                label = "设定正文",
                value = content,
                appearance = appearance,
                scrollState = scrollState,
                imeBottomPx = 0,
                minHeight = 300,
                placeholder = "写入这段对话使用的设定",
                immersiveTitle = "设定正文",
                groupedStyle = true,
                onChange = { content = it },
            )
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 22.dp, bottom = 12.dp)
                    .height(48.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(
                        if (canSave) appearance.mobileBlue else appearance.mobileMuted.copy(alpha = 0.15f),
                    )
                    .noRippleClickable(enabled = canSave) { onSave(title.trim(), content.trim()) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    when {
                        saving -> "正在保存"
                        creating -> "创建设定"
                        else -> "保存修改"
                    },
                    color = if (canSave) appearance.mobileSurface else appearance.mobileMuted,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
    if (confirmDelete) {
        ConfirmDialog(
            title = "删除这条设定？",
            message = "这条设定将从当前对话中移除，母设定不会被删除。",
            confirmText = "删除设定",
            destructive = true,
            appearance = appearance,
            onDismiss = { confirmDelete = false },
            onConfirm = {
                confirmDelete = false
                onDelete?.invoke()
            },
        )
    }
}

@Composable
private fun DynamicReadOnlySettingEntryPage(
    selection: DynamicSettingEntrySelection,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
) {
    val groups = remember(selection.conversation.library.groups) {
        selection.conversation.library.groups.associateBy { it.id }
    }
    val groupPath = settingLibraryGroupPath(groups[selection.entry.groupId], groups)
    val displayPath = listOf(selection.conversation.title, groupPath)
        .filter(String::isNotBlank)
        .joinToString("/")
    PinnedStatusScaffold(appearance = appearance, imeAware = false, backgroundColor = appearance.mobileBg) {
        StoryEditorHeader(title = selection.entry.title, appearance = appearance, onBack = onBack)
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(appearance.mobileBg),
            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
        ) {
            item {
                if (displayPath.isNotBlank()) {
                    Text(displayPath, color = appearance.mobileMuted, fontSize = 13.sp)
                }
                Text(
                    selection.entry.content.ifBlank { "暂无正文" },
                    modifier = Modifier.padding(top = if (displayPath.isBlank()) 0.dp else 16.dp),
                    color = if (selection.entry.content.isBlank()) appearance.mobileMuted else appearance.mobileText,
                    fontSize = 15.sp,
                    lineHeight = 23.sp,
                )
            }
        }
    }
}

internal data class DynamicSettingEntrySelection(
    val conversation: SettingLibraryConversation,
    val entry: SettingLibraryEntry,
)
