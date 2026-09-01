package com.eleckoi.android.feature.chat.ui

import com.eleckoi.android.feature.chat.api.ChatService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Mutations of the current draft that are independent from loading, Paging, and generation. */
internal class ChatDraftMutationController(
    private val scope: CoroutineScope,
    private val chatService: ChatService,
    private val state: () -> ChatUiState,
    private val updateState: ((ChatUiState) -> ChatUiState) -> Unit,
    private val isCurrentSession: (String) -> Boolean,
) {
    fun regenerateImage(messageId: String, attachmentId: String) {
        val current = state()
        val sessionId = current.draft?.session?.id.orEmpty()
        if (sessionId.isBlank() || current.isSending) return
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    chatService.regenerateImage(sessionId, messageId, attachmentId)
                }
            }.onSuccess { next ->
                if (isCurrentSession(sessionId)) {
                    updateState { it.withDraft(next) }
                }
            }.onRealFailure { error ->
                if (isCurrentSession(sessionId)) {
                    updateState { it.copy(errorMessage = error.message ?: "重新生成图片失败") }
                }
            }
        }
    }

    fun selectOpeningOption(openingOptionId: String) {
        val current = state()
        val draft = current.draft ?: return
        if (
            current.isSending ||
            !draft.openingSelectionEnabled ||
            openingOptionId == draft.selectedOpeningOptionId
        ) {
            return
        }
        val sessionId = draft.session.id
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    chatService.selectChatOpening(sessionId, openingOptionId)
                }
            }.onSuccess { next ->
                if (isCurrentSession(sessionId)) {
                    updateState { it.withDraft(next) }
                }
            }.onRealFailure { error ->
                if (isCurrentSession(sessionId)) {
                    updateState { it.copy(errorMessage = error.message ?: "更换开场白失败") }
                }
            }
        }
    }

    fun saveCharacterImagePrompt(
        prompt: String,
        onFinished: (Result<String>) -> Unit,
    ) {
        val characterId = state().draft?.session?.characterId.orEmpty()
        if (characterId.isBlank()) {
            onFinished(Result.failure(IllegalStateException("当前没有角色")))
            return
        }
        scope.launch {
            val result = runCatching {
                withContext(Dispatchers.IO) {
                    chatService.saveCharacterImagePrompt(characterId, prompt).persona.imagePrompt
                }
            }
            result.onSuccess { saved ->
                updateState { current ->
                    val draft = current.draft
                    if (draft == null) {
                        current
                    } else {
                        current.copy(
                            draft = draft.copy(
                                session = draft.session.copy(
                                    characterPersona = draft.session.characterPersona.copy(imagePrompt = saved),
                                ),
                            ),
                        )
                    }
                }
            }
            onFinished(result)
        }
    }
}
