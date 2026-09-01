package com.eleckoi.android.app.service

import com.eleckoi.android.feature.chat.model.ChatListItem
import com.eleckoi.android.feature.preferences.UiPreferences
import kotlinx.coroutines.flow.Flow

/** App-shell-only contract. Feature contracts live with their owning feature. */
interface ShellService {
    val chatListFlow: Flow<List<ChatListItem>>
    val uiPreferencesFlow: Flow<UiPreferences>

    suspend fun setPinnedChatIds(ids: List<String>): UiPreferences
    suspend fun setHiddenChatIds(ids: List<String>): UiPreferences
    suspend fun setOptionalCommonPage(tabKey: String?, order: List<String>): UiPreferences
    suspend fun setCommonPageOrder(order: List<String>): UiPreferences
}
