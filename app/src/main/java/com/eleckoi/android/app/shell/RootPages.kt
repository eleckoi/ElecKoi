package com.eleckoi.android.app.shell

import com.eleckoi.android.foundation.design.components.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.ConfirmDialog
import com.eleckoi.android.feature.characters.model.CharacterMode
import com.eleckoi.android.feature.characters.model.UserProfile
import com.eleckoi.android.feature.chat.model.ChatListItem

private class MessagesRootEditorState {
    var keyword by mutableStateOf("")
}

@Composable
private fun rememberMessagesRootEditorState(): MessagesRootEditorState {
    return remember { MessagesRootEditorState() }
}

@Composable
internal fun MessagesRootPage(
    user: UserProfile,
    chats: List<ChatListItem>,
    pinnedChatIds: List<String>,
    hiddenChatIds: List<String>,
    activeChatSessionIds: Map<String, String>,
    characterModesById: Map<String, String>,
    appearance: AppearanceTheme,
    searchOpen: Boolean,
    onSearchOpenChange: (Boolean) -> Unit,
    onAdd: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenChat: (String) -> Unit,
    onTogglePinnedChat: (String) -> Unit,
    onHideChat: (String) -> Unit,
) {
    val editorState = rememberMessagesRootEditorState()

    with(editorState) {
    LaunchedEffect(searchOpen) {
        if (!searchOpen) keyword = ""
    }
    val key = keyword.trim().lowercase()
    val pinned = pinnedChatIds.toSet()
    val conversationChats = orderMessageChats(
        chats = chats,
        pinnedChatIds = pinnedChatIds,
        hiddenChatIds = hiddenChatIds,
        activeChatSessionIds = activeChatSessionIds,
        characterModesById = characterModesById,
    )
    val filtered = filterMessageRootSearch(conversationChats, key)
    val pinnedItems = conversationChats.filter { it.id in pinned }
    val regularItems = conversationChats.filterNot { it.id in pinned }
    if (searchOpen) {
        RootSearchPage(
            query = keyword,
            placeholder = "搜索会话",
            accentColor = appearance.mobileBlue,
            onQueryChange = { keyword = it },
            onBack = {
                keyword = ""
                onSearchOpenChange(false)
            },
        ) { searchAppearance ->
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 8.dp),
            ) {
                if (key.isNotBlank() && filtered.isEmpty()) {
                    item { MobileEmptyState("没有搜索结果", searchAppearance) }
                }
                if (key.isNotBlank()) {
                    items(filtered, key = { "search-${it.id}" }) { chat ->
                        MessageChatRow(
                            chat = chat,
                            isPinned = chat.id in pinned,
                            appearance = searchAppearance,
                            onOpenChat = { sessionId ->
                                keyword = ""
                                onSearchOpenChange(false)
                                onOpenChat(sessionId)
                            },
                            onTogglePinnedChat = onTogglePinnedChat,
                            onHideChat = onHideChat,
                        )
                    }
                }
            }
        }
        return@with
    }
    MobileRootSurface(
        appearance = appearance,
        header = {
            MobileProfileHeader(
                userName = user.userName,
                userAvatarPath = user.userAvatar,
                title = user.userName.ifBlank { "用户" },
                subtitle = "在线 - WiFi",
                appearance = appearance,
                onSearch = { onSearchOpenChange(true) },
                onAdd = onAdd,
                onOpenProfile = onOpenProfile,
            )
        },
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = 0.dp),
        ) {
            if (conversationChats.isEmpty()) {
                item { MobileEmptyState("还没有会话", appearance) }
            }
            if (pinnedItems.isNotEmpty()) {
                item("pinned-section") {
                    MessageListSectionHeader(
                        label = "置顶",
                        showPin = true,
                        appearance = appearance,
                    )
                }
                items(pinnedItems, key = { "pinned-${it.id}" }) { chat ->
                    MessageChatRow(
                        chat = chat,
                        isPinned = true,
                        appearance = appearance,
                        onOpenChat = onOpenChat,
                        onTogglePinnedChat = onTogglePinnedChat,
                        onHideChat = onHideChat,
                    )
                }
                if (regularItems.isNotEmpty()) {
                    item("regular-section") {
                        MessageListSectionHeader(
                            label = "最近消息",
                            appearance = appearance,
                        )
                    }
                }
            }
            items(regularItems, key = { it.id }) { chat ->
                MessageChatRow(
                    chat = chat,
                    isPinned = false,
                    appearance = appearance,
                    onOpenChat = onOpenChat,
                    onTogglePinnedChat = onTogglePinnedChat,
                    onHideChat = onHideChat,
                )
            }
        }
    }
    }
}

internal fun orderMessageChats(
    chats: List<ChatListItem>,
    pinnedChatIds: List<String>,
    hiddenChatIds: List<String> = emptyList(),
    activeChatSessionIds: Map<String, String> = emptyMap(),
    characterModesById: Map<String, String> = emptyMap(),
): List<ChatListItem> {
    val pinned = pinnedChatIds.toSet()
    val pinnedOrder = pinnedChatIds.withIndex().associate { it.value to it.index }
    return chats
        .sortedWith(
            compareByDescending<ChatListItem> { it.id in pinned }
                .thenBy { pinnedOrder[it.id] ?: Int.MAX_VALUE }
                .thenByDescending { it.updatedAt },
        )
        .collapseByCharacter(activeChatSessionIds, characterModesById)
        .filterNot { it.id in hiddenChatIds }
}

private fun List<ChatListItem>.collapseByCharacter(
    activeChatSessionIds: Map<String, String>,
    characterModesById: Map<String, String>,
): List<ChatListItem> {
    val byId = associateBy(ChatListItem::id)
    val byCharacter = linkedMapOf<String, ChatListItem>()
    forEach { chat ->
        val key = chat.characterId.ifBlank { chat.characterName.ifBlank { chat.id } }
        if (key !in byCharacter) {
            val currentMode = characterModesById[key]
                ?.let { CharacterMode.fromStorage(it).storageValue }
            val modeActive = currentMode
                ?.let { mode -> activeChatSessionIds["$key:$mode"] }
                ?.let(byId::get)
                ?.takeIf { candidate ->
                    candidate.characterId == chat.characterId &&
                        CharacterMode.fromStorage(candidate.characterMode).storageValue == currentMode
                }
            val currentModeLatest = currentMode?.let { mode ->
                firstOrNull { candidate ->
                    candidate.characterId == chat.characterId &&
                        CharacterMode.fromStorage(candidate.characterMode).storageValue == mode
                }
            }
            val characterActive = activeChatSessionIds[key]
                ?.let(byId::get)
                ?.takeIf { candidate ->
                    candidate.characterId == chat.characterId &&
                        (currentMode == null ||
                            CharacterMode.fromStorage(candidate.characterMode).storageValue == currentMode)
                }
            byCharacter[key] = modeActive ?: characterActive ?: currentModeLatest ?: chat
        }
    }
    return byCharacter.values.toList()
}

internal fun messageRootEntryTitle(chat: ChatListItem): String =
    chat.characterName.ifBlank { chat.title.ifBlank { "新对话" } }

internal fun filterMessageRootSearch(
    chats: List<ChatListItem>,
    keyword: String,
): List<ChatListItem> {
    val key = keyword.trim().lowercase()
    if (key.isBlank()) return chats
    return chats.filter { chat ->
        listOf(chat.title, chat.characterName, chat.summary)
            .joinToString(" ")
            .lowercase()
            .contains(key)
    }
}

@Composable
private fun MessageChatRow(
    chat: ChatListItem,
    isPinned: Boolean,
    appearance: AppearanceTheme,
    onOpenChat: (String) -> Unit,
    onTogglePinnedChat: (String) -> Unit,
    onHideChat: (String) -> Unit,
) {
    var menuOpen by remember(chat.id) { mutableStateOf(false) }
    var hideConfirmationOpen by remember(chat.id) { mutableStateOf(false) }
    Box(modifier = Modifier.fillMaxWidth()) {
        MobileConversationRow(
            title = messageRootEntryTitle(chat),
            subtitle = chat.summary.ifBlank { "新对话" },
            avatarName = messageRootEntryTitle(chat),
            avatarPath = chat.characterAvatar,
            sideText = formatShortDate(chat.updatedAt),
            appearance = appearance,
            pinned = isPinned,
            onLongClick = { menuOpen = true },
            onClick = { onOpenChat(chat.id) },
        )
        Box(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(end = 14.dp)
                .size(1.dp),
        ) {
            MessageContextMenu(
                expanded = menuOpen,
                isPinned = isPinned,
                appearance = appearance,
                onTogglePinned = { onTogglePinnedChat(chat.id) },
                onHide = { hideConfirmationOpen = true },
                onDismiss = { menuOpen = false },
            )
        }
    }
    if (hideConfirmationOpen) {
        ConfirmDialog(
            title = "删除消息入口？",
            message = "只会从消息列表隐藏这个入口；角色和聊天记录都会保留。",
            appearance = appearance,
            confirmText = "删除入口",
            destructive = true,
            onDismiss = { hideConfirmationOpen = false },
            onConfirm = {
                hideConfirmationOpen = false
                onHideChat(chat.id)
            },
        )
    }
}

@Composable
private fun MessageListSectionHeader(
    label: String,
    appearance: AppearanceTheme,
    showPin: Boolean = false,
) {
    androidx.compose.foundation.layout.Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(36.dp)
            .padding(start = 17.dp, end = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showPin) {
            Icon(
                imageVector = Icons.Outlined.PushPin,
                contentDescription = null,
                tint = appearance.mobileBlue,
                modifier = Modifier
                    .padding(end = 7.dp)
                    .size(16.dp),
            )
        }
        Text(
            text = label,
            color = appearance.mobileMuted,
            fontSize = 12.5.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun MessageContextMenu(
    expanded: Boolean,
    isPinned: Boolean,
    appearance: AppearanceTheme,
    onTogglePinned: () -> Unit,
    onHide: () -> Unit,
    onDismiss: () -> Unit,
) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
        modifier = Modifier.width(176.dp),
        shape = RoundedCornerShape(16.dp),
        containerColor = appearance.mobileSurface,
        tonalElevation = 0.dp,
        shadowElevation = 8.dp,
    ) {
        DropdownMenuItem(
            text = {
                Text(
                    text = if (isPinned) "取消置顶" else "置顶",
                    color = appearance.mobileText,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                )
            },
            leadingIcon = {
                Icon(
                    imageVector = Icons.Outlined.PushPin,
                    contentDescription = null,
                    tint = appearance.mobileMuted,
                    modifier = Modifier.size(19.dp),
                )
            },
            onClick = {
                onDismiss()
                onTogglePinned()
            },
            modifier = Modifier.heightIn(min = 52.dp),
        )
        Box(
            modifier = Modifier
                .padding(horizontal = 14.dp)
                .fillMaxWidth()
                .height(1.dp)
                .background(appearance.mobileLine),
        )
        DropdownMenuItem(
            text = {
                Text(
                    text = "删除入口",
                    color = ElecKoiDanger,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Medium,
                )
            },
            leadingIcon = {
                StrokeSvgIcon(
                    paths = AppIconPaths.Trash,
                    color = ElecKoiDanger,
                    iconSize = 19.dp,
                    strokeWidth = 1.7f,
                )
            },
            onClick = {
                onDismiss()
                onHide()
            },
            modifier = Modifier.heightIn(min = 52.dp),
        )
    }
}
