package com.eleckoi.android.feature.chat.ui

import com.eleckoi.android.feature.chat.api.ChatService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal class ChatHistoryTransferController(
    private val scope: CoroutineScope,
    private val chatService: ChatService,
    private val state: () -> ChatUiState,
    private val updateState: ((ChatUiState) -> ChatUiState) -> Unit,
    private val emitEffect: suspend (ChatEffect) -> Unit,
) {
    fun export(sessionIds: List<String>) {
        val characterId = currentCharacterId()
        if (characterId.isBlank()) return
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    chatService.exportChatHistory(characterId, sessionIds)
                }
            }.onSuccess { json ->
                emitEffect(
                    ChatEffect.ExportHistoryReady(
                        json = json,
                        fileName = "eleckoi-chat-history-${System.currentTimeMillis()}.json",
                    ),
                )
            }.onRealFailure { error ->
                updateState { it.copy(errorMessage = error.message ?: "导出聊天记录失败") }
            }
        }
    }

    fun import(json: String) {
        val characterId = currentCharacterId()
        if (characterId.isBlank()) return
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    chatService.importChatHistory(characterId, json)
                }
            }.onRealFailure { error ->
                updateState { it.copy(errorMessage = error.message ?: "导入聊天记录失败") }
            }
        }
    }

    private fun currentCharacterId(): String {
        val current = state()
        return current.draft?.session?.characterId ?: current.chatCharacterId
    }
}
