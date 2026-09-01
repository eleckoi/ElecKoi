package com.eleckoi.android.feature.chat.ui.screen

import com.eleckoi.android.feature.chat.ui.*

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import com.eleckoi.android.engine.agent.diagnostics.AgentTurnRequestCapture
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.feature.characters.model.CharacterMode
import com.eleckoi.android.feature.chat.model.ChatDraft
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.modelconfig.model.ModelParameters
import com.eleckoi.android.feature.chat.ui.diagnostics.AgentRequestCaptureDialog
import com.eleckoi.android.feature.chat.ui.sheets.ChatHistorySheet
import com.eleckoi.android.feature.chat.ui.sheets.EditMessageSheet
import com.eleckoi.android.feature.chat.ui.sheets.ModelPickerSheet
import com.eleckoi.android.feature.chat.ui.sheets.SelectMessageTextSheet
import com.eleckoi.android.feature.chat.ui.layout.asRoleplayReadingTheme
import com.eleckoi.android.feature.chat.ui.message.ChatAgentProcessSheet
import com.eleckoi.android.feature.chat.ui.roleplay.dialog.RoleplayOpeningJumpDialog
import com.eleckoi.android.feature.chat.ui.roleplay.web.model.RoleplayTranscriptModel
import com.eleckoi.android.foundation.design.components.ConfirmDialog
import com.eleckoi.android.foundation.design.components.ErrorDialog

/**
 * Collects modal chat surfaces in one layer. The ViewModel remains the sole business-state owner;
 * local selection/diagnostic visibility is returned through narrow dismissal callbacks.
 */
@Composable
internal fun ChatScreenOverlays(
    state: ChatUiState,
    draft: ChatDraft?,
    onIntent: (ChatIntent) -> Unit,
    onSaveModelConfig: (ModelConfig, (Result<ModelConfig>) -> Unit) -> Unit,
    onSaveCharacterImagePrompt: (String, (Result<String>) -> Unit) -> Unit,
    onRefreshModels: (ModelConfig, (Result<ModelConfig>) -> Unit) -> Unit,
    selectedUserMessageText: String?,
    onDismissSelectedText: () -> Unit,
    showRequestCaptures: Boolean,
    requestCaptures: List<AgentTurnRequestCapture>,
    requestCaptureEnabled: Boolean,
    onRequestCaptureEnabledChange: (Boolean) -> Unit,
    onDismissRequestCaptures: () -> Unit,
    onImportHistory: () -> Unit,
    onResumeToEnd: () -> Unit,
) {
    if (state.editingMessage != null) {
        EditMessageSheet(
            editorKey = state.editingMessage.id,
            value = state.editInput,
            appearance = state.appearance,
            onValueChange = { onIntent(ChatIntent.EditInputChanged(it)) },
            onDismiss = { onIntent(ChatIntent.CloseEditMessage) },
            onSubmit = { editedText ->
                onResumeToEnd()
                onIntent(ChatIntent.EditInputChanged(editedText))
                onIntent(ChatIntent.SubmitEditedMessage)
            },
        )
    }

    selectedUserMessageText?.let { text ->
        SelectMessageTextSheet(
            text = text,
            appearance = state.appearance,
            onDismiss = onDismissSelectedText,
        )
    }

    if (state.historyOpen) {
        ChatHistorySheet(
            sessions = state.sessions,
            currentSessionId = draft?.session?.id.orEmpty(),
            currentCharacterId = draft?.session?.characterId ?: state.chatCharacterId,
            currentCharacterMode = draft?.session?.characterMode ?: state.chatCharacterMode,
            characterName = draft?.session?.characterName ?: state.chatCharacterName,
            saveMode = state.historySaveMode,
            appearance = state.appearance,
            onDismiss = { onIntent(ChatIntent.SetHistoryOpen(false)) },
            onLoadChat = { sessionId ->
                onIntent(ChatIntent.LoadDraft(sessionId))
                onIntent(ChatIntent.SetHistoryOpen(false))
            },
            onSaveMode = { onIntent(ChatIntent.ChangeHistorySaveMode(it)) },
            onDelete = { sessionId ->
                onIntent(ChatIntent.DeleteHistoryChat(sessionId))
                if (sessionId == draft?.session?.id) {
                    onIntent(ChatIntent.SetHistoryOpen(false))
                }
            },
            onExport = { onIntent(ChatIntent.ExportHistoryChats(it)) },
            onImport = onImportHistory,
        )
    }

    if (state.modelPickerOpen) {
        ModelPickerSheet(
            configs = state.modelConfigs + state.imageModelConfigs,
            selectedConfigId = draft?.selectedModelConfig?.id.orEmpty(),
            selectedModel = draft?.selectedModel.orEmpty(),
            streamEnabled = draft?.modelParameters?.stream ?: true,
            characterImagePrompt = draft?.session?.characterPersona?.imagePrompt.orEmpty(),
            appearance = state.appearance,
            onDismiss = { onIntent(ChatIntent.SetModelPickerOpen(false)) },
            onSelect = { configId, model ->
                onIntent(
                    ChatIntent.SelectModel(
                        configId,
                        model,
                        draft?.modelParameters ?: ModelParameters(),
                    ),
                )
            },
            onStreamChange = { stream ->
                val currentDraft = state.draft ?: return@ModelPickerSheet
                onIntent(
                    ChatIntent.SelectModel(
                        currentDraft.selectedModelConfig.id,
                        currentDraft.selectedModel,
                        currentDraft.modelParameters.copy(stream = stream),
                    ),
                )
            },
            onSaveConfig = onSaveModelConfig,
            onCharacterImagePromptChange = onSaveCharacterImagePrompt,
            onRefreshModels = onRefreshModels,
        )
    }

    if (state.errorMessage.isNotBlank()) {
        ErrorDialog(
            message = state.errorMessage,
            appearance = state.appearance,
            onDismiss = { onIntent(ChatIntent.DismissError) },
        )
    }

    if (showRequestCaptures) {
        AgentRequestCaptureDialog(
            turns = requestCaptures,
            captureEnabled = requestCaptureEnabled,
            appearance = state.appearance,
            onCaptureEnabledChange = onRequestCaptureEnabledChange,
            onDismiss = onDismissRequestCaptures,
        )
    }

    state.modeConflict?.let { conflict ->
        val sessionMode = CharacterMode.fromStorage(conflict.sessionMode).label
        val currentMode = CharacterMode.fromStorage(conflict.currentMode).label
        ConfirmDialog(
            title = "不能跨模式继续对话",
            message = "这条聊天属于“${sessionMode}模式”，角色当前已经切换为“${currentMode}模式”。为避免聊天历史和工作区串线，不能在这里继续发送。",
            appearance = state.appearance,
            confirmText = "打开${currentMode}对话",
            dismissText = "留在当前对话",
            onDismiss = { onIntent(ChatIntent.DismissModeConflict) },
            onConfirm = { onIntent(ChatIntent.OpenCurrentModeChat) },
        )
    }
}

@Composable
internal fun ChatRoleplayOverlays(
    state: ChatUiState,
    draft: ChatDraft?,
    transcript: RoleplayTranscriptModel?,
    presentedMessages: List<ChatMessage>,
    processMessageId: String?,
    openingJumpOpen: Boolean,
    onDismissProcess: () -> Unit,
    onSelectOpeningOption: (String) -> Unit,
    onDismissOpeningJump: () -> Unit,
) {
    processMessageId?.let { messageId ->
        val message = transcript
            ?.messages
            ?.firstOrNull { it.source.id == messageId }
            ?.source
            ?: presentedMessages.firstOrNull { it.id == messageId }
        if (message == null) {
            LaunchedEffect(messageId) { onDismissProcess() }
        } else {
            ChatAgentProcessSheet(
                message = message,
                appearance = state.appearance.asRoleplayReadingTheme(),
                onDismiss = onDismissProcess,
            )
        }
    }
    if (openingJumpOpen && draft != null) {
        RoleplayOpeningJumpDialog(
            options = draft.openingOptions,
            selectedIndex = draft.openingOptions.indexOfFirst {
                it.id == draft.selectedOpeningOptionId
            },
            appearance = state.appearance.asRoleplayReadingTheme(),
            onSelect = onSelectOpeningOption,
            onDismiss = onDismissOpeningJump,
        )
    }
}
