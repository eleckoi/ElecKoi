package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AvatarCircle
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.themedListRowClickable
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryConversation
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorHeader
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryHeaderSearchAction
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StorySearchHeader
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.*

@Composable
internal fun DynamicConversationListPage(
    conversations: List<SettingLibraryConversation>,
    loading: Boolean,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onOpenConversation: (SettingLibraryConversation) -> Unit,
) {
    val listState = rememberLazyListState()
    var search by remember { mutableStateOf("") }
    var searchOpen by remember { mutableStateOf(false) }
    BackHandler(enabled = searchOpen) {
        searchOpen = false
        search = ""
    }
    val visibleConversations = remember(conversations, search) {
        val query = search.trim()
        if (query.isBlank()) {
            conversations
        } else {
            conversations.filter { conversation ->
                conversation.characterName.contains(query, ignoreCase = true) ||
                    conversation.title.contains(query, ignoreCase = true) ||
                    conversation.summary.contains(query, ignoreCase = true) ||
                    conversation.updatedAt.contains(query, ignoreCase = true)
            }
        }
    }

    PinnedStatusScaffold(appearance = appearance, imeAware = false, backgroundColor = appearance.mobileBg) {
        if (searchOpen) {
            StorySearchHeader(
                query = search,
                placeholder = "搜索聊天记录",
                appearance = appearance,
                onQueryChange = { search = it },
                onClose = {
                    searchOpen = false
                    search = ""
                },
            )
        } else {
            StoryEditorHeader(
                title = "动态设定",
                appearance = appearance,
                onBack = onBack,
                action = {
                    StoryHeaderSearchAction(
                        appearance = appearance,
                        onClick = { searchOpen = true },
                    )
                },
            )
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().background(appearance.mobileBg),
            contentPadding = PaddingValues(top = 8.dp, bottom = 26.dp),
        ) {
            when {
                loading && conversations.isEmpty() -> item(key = "loading") {
                    DynamicConversationListMessage("正在读取", appearance)
                }

                visibleConversations.isEmpty() -> item(key = "empty") {
                    DynamicConversationListMessage(
                        if (search.isBlank()) "还没有动态设定" else "没有找到相关对话",
                        appearance,
                    )
                }

                else -> items(
                    items = visibleConversations,
                    key = SettingLibraryConversation::sessionId,
                ) { conversation ->
                    DynamicConversationRow(
                        conversation = conversation,
                        appearance = appearance,
                        onClick = { onOpenConversation(conversation) },
                    )
                }
            }
        }
    }
}

@Composable
internal fun DynamicConversationListMessage(
    text: String,
    appearance: AppearanceTheme,
) {
    Box(
        modifier = Modifier.fillMaxWidth().height(180.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = appearance.mobileMuted, fontSize = 15.sp)
    }
}

@Composable
private fun DynamicConversationRow(
    conversation: SettingLibraryConversation,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            .themedListRowClickable(appearance = appearance, onClick = onClick)
            .padding(start = 20.dp, end = 22.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarCircle(
            name = conversation.characterName.ifBlank { conversation.title },
            size = 42,
            fontSize = 15,
            appearance = appearance,
            avatarPath = conversation.characterAvatar,
        )
        Column(modifier = Modifier.weight(1f).padding(start = 12.dp, end = 12.dp)) {
            Text(
                text = conversation.characterName.ifBlank { conversation.title.ifBlank { "未命名角色" } },
                color = appearance.mobileText,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = conversation.summary.trim().ifBlank { "新对话" },
                modifier = Modifier.padding(top = 4.dp),
                color = appearance.mobileMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = dynamicConversationListTime(conversation.updatedAt),
            color = appearance.mobileMuted,
            fontSize = 11.sp,
            maxLines = 1,
        )
    }
}
