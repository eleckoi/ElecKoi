package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryOpeningMessage
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.settingLibraryOpeningEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.withOpeningMessages
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorCardSpacing
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorHeader
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.ConfirmDialog
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.noRippleClickable
import java.util.UUID

@Composable
internal fun MultiOpeningEditorPage(
    entry: SettingLibraryEntry,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onEntryChange: ((SettingLibraryEntry) -> SettingLibraryEntry) -> Unit,
) {
    val normalized = settingLibraryOpeningEntry(entry)
    val displayedMessages = remember(
        normalized.openingMessages,
        normalized.defaultOpeningMessageId,
    ) {
        normalized.primaryFirstOpeningMessages()
    }
    val primaryMessage = displayedMessages.first()
    val backupMessages = displayedMessages.drop(1)
    var expandedId by remember(entry.id) { mutableStateOf<String?>(primaryMessage.id) }
    var pendingDeleteId by remember(entry.id) { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    val listScrollable by remember(listState) {
        derivedStateOf {
            listState.canScrollBackward || listState.canScrollForward
        }
    }

    fun updateMessages(
        defaultId: String? = null,
        transform: (List<SettingLibraryOpeningMessage>) -> List<SettingLibraryOpeningMessage>,
    ) {
        onEntryChange { current ->
            val source = settingLibraryOpeningEntry(current)
            source.withOpeningMessages(
                messages = transform(source.primaryFirstOpeningMessages()),
                defaultMessageId = defaultId ?: source.defaultOpeningMessageId,
            )
        }
    }

    fun createBackup() {
        val next = SettingLibraryOpeningMessage(
            id = UUID.randomUUID().toString(),
            title = "",
        )
        expandedId = next.id
        updateMessages(defaultId = primaryMessage.id) { it + next }
    }

    fun moveBackup(messageId: String, offset: Int) {
        updateMessages(defaultId = primaryMessage.id) { messages ->
            val fromIndex = messages.indexOfFirst { it.id == messageId }
            val toIndex = fromIndex + offset
            if (fromIndex <= 0 || toIndex !in 1..messages.lastIndex) {
                messages
            } else {
                messages.toMutableList().apply {
                    add(toIndex, removeAt(fromIndex))
                }
            }
        }
    }

    LaunchedEffect(displayedMessages) {
        if (expandedId != null && displayedMessages.none { it.id == expandedId }) {
            expandedId = primaryMessage.id
        }
    }

    BackHandler(onBack = onBack)
    PinnedStatusScaffold(
        appearance = appearance,
        imeAware = false,
        backgroundColor = appearance.mobileBg,
    ) {
        StoryEditorHeader(
            title = "AI角色开场白",
            appearance = appearance,
            backgroundColor = appearance.mobileBg,
            onBack = onBack,
            actionWidth = 78.dp,
            titleHorizontalPadding = 92.dp,
            action = {
                Row(
                    modifier = Modifier
                        .height(44.dp)
                        .semantics {
                            role = Role.Button
                            contentDescription = "新建备用开场白"
                        }
                        .noRippleClickable(onClick = ::createBackup)
                        .padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Add,
                        contentDescription = null,
                        tint = appearance.mobileBlue,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = "新建",
                        color = appearance.mobileBlue,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Medium,
                        modifier = Modifier.padding(start = 3.dp),
                    )
                }
            },
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .background(appearance.mobileBg)
                .imePadding(),
        ) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                userScrollEnabled = listScrollable,
                contentPadding = PaddingValues(
                    start = 18.dp,
                    end = 18.dp,
                    top = 16.dp,
                    bottom = 24.dp,
                ),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(
                    StoryEditorCardSpacing,
                ),
            ) {
                item(key = "primary-opening") {
                    PrimaryOpeningCard(
                        message = primaryMessage,
                        expanded = expandedId == primaryMessage.id,
                        canDelete = displayedMessages.size > 1,
                        appearance = appearance,
                        onToggle = {
                            expandedId = primaryMessage.id.takeUnless { expandedId == it }
                        },
                        onTitleChange = { title ->
                            updateMessages(defaultId = primaryMessage.id) { messages ->
                                messages.map {
                                    if (it.id == primaryMessage.id) it.copy(title = title.take(40)) else it
                                }
                            }
                        },
                        onContentChange = { content ->
                            updateMessages(defaultId = primaryMessage.id) { messages ->
                                messages.map {
                                    if (it.id == primaryMessage.id) it.copy(content = content) else it
                                }
                            }
                        },
                        onDuplicate = {
                            val copy = primaryMessage.copy(
                                id = UUID.randomUUID().toString(),
                                title = primaryMessage.title.duplicateOpeningTitle(),
                            )
                            expandedId = copy.id
                            updateMessages(defaultId = primaryMessage.id) { messages ->
                                messages.toMutableList().apply { add(1, copy) }
                            }
                        },
                        onDelete = { pendingDeleteId = primaryMessage.id },
                    )
                }
                item(key = "backup-openings") {
                    BackupOpeningGroupCard(
                        messages = backupMessages,
                        expandedId = expandedId,
                        appearance = appearance,
                        onToggle = { messageId ->
                            expandedId = messageId.takeUnless { expandedId == it }
                        },
                        onMoveUp = { moveBackup(it, -1) },
                        onMoveDown = { moveBackup(it, 1) },
                        onTitleChange = { messageId, title ->
                            updateMessages(defaultId = primaryMessage.id) { messages ->
                                messages.map {
                                    if (it.id == messageId) it.copy(title = title.take(40)) else it
                                }
                            }
                        },
                        onContentChange = { messageId, content ->
                            updateMessages(defaultId = primaryMessage.id) { messages ->
                                messages.map {
                                    if (it.id == messageId) it.copy(content = content) else it
                                }
                            }
                        },
                        onDuplicate = { message ->
                            val copy = message.copy(
                                id = UUID.randomUUID().toString(),
                                title = message.title.duplicateOpeningTitle(),
                            )
                            expandedId = copy.id
                            updateMessages(defaultId = primaryMessage.id) { messages ->
                                val sourceIndex = messages.indexOfFirst { it.id == message.id }
                                messages.toMutableList().apply { add(sourceIndex + 1, copy) }
                            }
                        },
                        onDelete = { pendingDeleteId = it },
                    )
                }
            }
        }
    }

    pendingDeleteId?.let { messageId ->
        val message = normalized.openingMessages.firstOrNull { it.id == messageId }
        ConfirmDialog(
            title = "删除“${message?.title.orEmpty().ifBlank { "未命名开场白" }}”？",
            message = "这条开场白会立即从角色设定中移除。",
            appearance = appearance,
            onDismiss = { pendingDeleteId = null },
            onConfirm = {
                pendingDeleteId = null
                val remaining = displayedMessages.filterNot { it.id == messageId }
                if (remaining.isNotEmpty()) {
                    val nextPrimaryId = if (messageId == primaryMessage.id) {
                        remaining.first().id
                    } else {
                        primaryMessage.id
                    }
                    expandedId = nextPrimaryId
                    updateMessages(defaultId = nextPrimaryId) { remaining }
                }
            },
        )
    }

}

