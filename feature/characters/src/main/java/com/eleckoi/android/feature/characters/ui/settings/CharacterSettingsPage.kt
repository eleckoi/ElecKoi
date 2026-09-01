package com.eleckoi.android.feature.characters.ui.settings

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.model.AvatarSlot
import com.eleckoi.android.feature.characters.model.CharacterCard
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.feature.characters.model.CharacterMode
import com.eleckoi.android.feature.characters.modes.agent.ui.AgentToolsPanel
import com.eleckoi.android.feature.characters.modes.story.ui.StoryToolsPanel
import com.eleckoi.android.foundation.design.components.ConfirmDialog
import com.eleckoi.android.feature.characters.ui.components.AvatarSlotsPage
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import kotlinx.coroutines.delay
import java.io.File

private class CharacterSettingsEditorState(character: CharacterSlot) {
    var name by mutableStateOf(initialName(character))
    var prompt by mutableStateOf(character.persona.assistantPrompt)
    var opening by mutableStateOf(character.persona.opening)
    var chatMode by mutableStateOf(CharacterMode.fromStorage(character.characterMode))
    var dirty by mutableStateOf(false)
    var confirmDelete by mutableStateOf(false)

    fun syncFrom(character: CharacterSlot) {
        if (dirty) return
        name = initialName(character)
        prompt = character.persona.assistantPrompt
        opening = character.persona.opening
        chatMode = CharacterMode.fromStorage(character.characterMode)
    }

    fun draft(source: CharacterCard): CharacterCard {
        return source.copy(
            assistantName = name,
            assistantPrompt = prompt,
            opening = opening,
            showOpening = opening.isNotBlank(),
        )
    }

    fun updateName(value: String) {
        name = value.take(48)
        dirty = true
    }

    fun updatePrompt(value: String) {
        prompt = value
        dirty = true
    }

    fun updateOpening(value: String) {
        opening = value
        dirty = true
    }

    fun updateChatMode(mode: CharacterMode) {
        chatMode = mode
    }

    fun markSaved() {
        dirty = false
    }

    private fun initialName(character: CharacterSlot): String {
        return character.persona.assistantName.ifBlank {
            character.name.takeUnless { it == "未命名角色" }.orEmpty()
        }
    }
}

@Composable
private fun rememberCharacterSettingsEditorState(character: CharacterSlot): CharacterSettingsEditorState {
    val state = remember(character.id) { CharacterSettingsEditorState(character) }
    LaunchedEffect(character.persona, character.characterMode) {
        state.syncFrom(character)
    }
    return state
}

@Composable
fun CharacterSettingsPage(
    character: CharacterSlot?,
    appearance: AppearanceTheme,
    saving: Boolean,
    onBack: () -> Unit,
    onSavePersona: (CharacterCard) -> Unit,
    onSaveAvatars: (Map<AvatarSlot, File>) -> Unit,
    onClearAvatar: (AvatarSlot) -> Unit,
    onSendMessage: (persona: CharacterCard, characterMode: String) -> Unit,
    onModeChange: (String) -> Unit,
    onOpenAiCreationAssistant: () -> Unit,
    onOpenPresetConfig: () -> Unit,
    onOpenSettingLibrary: () -> Unit,
    onOpenDynamicSettings: () -> Unit,
    onOpenVariableConfig: () -> Unit,
    onOpenRegexRules: () -> Unit,
    onOpenFrontendBeauty: () -> Unit,
    onOpenAgentTools: () -> Unit,
    onExport: () -> Unit,
    onDelete: () -> Unit,
) {
    var avatarPageOpen by remember { mutableStateOf(false) }
    var avatarPageSlot by remember { mutableStateOf<AvatarSlot?>(null) }

    if (character == null) {
        EmptyCharacterSettings(appearance, onBack)
        return
    }

    val editorState = rememberCharacterSettingsEditorState(character)
    var activeSection by remember(character.id) {
        mutableStateOf(
            CharacterSettingsSection.fromCharacterMode(
                CharacterMode.fromStorage(character.characterMode),
            ),
        )
    }
    with(editorState) {
    val avatarPath = character.persona.assistantAvatar.ifBlank { character.avatar }
    val coverPath = character.persona.assistantCover.ifBlank { character.coverImage }
    val fallbackName = character.name.takeUnless { it == "未命名角色" }.orEmpty()

    LaunchedEffect(
        name,
        prompt,
        opening,
        dirty,
    ) {
        if (!dirty) return@LaunchedEffect
        delay(1000)
        onSavePersona(draft(character.persona))
        markSaved()
    }

    if (avatarPageOpen) {
        AvatarSlotsPage(
            avatars = character.persona.assistantAvatars,
            displayName = character.name,
            cachePrefix = "character",
            appearance = appearance,
            initialSlot = avatarPageSlot,
            onBack = {
                avatarPageOpen = false
                avatarPageSlot = null
            },
            onSave = onSaveAvatars,
            onClear = onClearAvatar,
        )
        return
    }

    fun requestBack() {
        if (dirty) onSavePersona(draft(character.persona))
        onBack()
    }

    BackHandler(onBack = ::requestBack)

    PinnedStatusScaffold(
        appearance = appearance,
        modifier = Modifier.characterScrapbookBoard(appearance),
        imeAware = false,
        backgroundColor = Color.Transparent,
    ) {
        CharacterScrapbookFrame(
            name = name,
            fallbackName = fallbackName,
            avatarPath = avatarPath,
            coverPath = coverPath,
            appearance = appearance,
            onBack = ::requestBack,
            onExport = onExport,
            onDelete = { confirmDelete = true },
            onAvatarClick = {
                avatarPageSlot = null
                avatarPageOpen = true
            },
            onCoverClick = {
                avatarPageSlot = AvatarSlot.Portrait
                avatarPageOpen = true
            },
            onNameChange = ::updateName,
        ) { layoutScale ->
            CharacterSectionSwitch(
                activeSection = activeSection,
                appearance = appearance,
                layoutScale = layoutScale,
                onChange = { section ->
                    activeSection = section
                    section.characterMode?.let { mode ->
                        updateChatMode(mode)
                        onModeChange(mode.storageValue)
                    }
                },
            )

            when (activeSection) {
                CharacterSettingsSection.Profile -> {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "开发中",
                            color = appearance.mobileMuted,
                            fontSize = 15.sp,
                        )
                    }
                }
                CharacterSettingsSection.Story -> {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .padding(horizontal = (6f * layoutScale).dp),
                    ) {
                        StoryToolsPanel(
                            appearance = appearance,
                            layoutScale = layoutScale,
                            onOpenAiCreationAssistant = {
                                if (dirty) onSavePersona(draft(character.persona))
                                onOpenAiCreationAssistant()
                            },
                            onOpenPresetConfig = {
                                if (dirty) onSavePersona(draft(character.persona))
                                onOpenPresetConfig()
                            },
                            onOpenSettingLibrary = {
                                if (dirty) onSavePersona(draft(character.persona))
                                onOpenSettingLibrary()
                            },
                            onOpenDynamicSettings = {
                                if (dirty) onSavePersona(draft(character.persona))
                                onOpenDynamicSettings()
                            },
                            onOpenVariableConfig = {
                                if (dirty) onSavePersona(draft(character.persona))
                                onOpenVariableConfig()
                            },
                            onOpenRegexRules = {
                                if (dirty) onSavePersona(draft(character.persona))
                                onOpenRegexRules()
                            },
                            onOpenFrontendBeauty = {
                                if (dirty) onSavePersona(draft(character.persona))
                                onOpenFrontendBeauty()
                            },
                            onOpenAgentTools = {
                                if (dirty) onSavePersona(draft(character.persona))
                                onOpenAgentTools()
                            },
                        )
                    }
                }
                CharacterSettingsSection.Agent -> {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .padding(horizontal = (6f * layoutScale).dp),
                    ) {
                        AgentToolsPanel(
                            appearance = appearance,
                            layoutScale = layoutScale,
                            onOpenAgentTools = {
                                if (dirty) onSavePersona(draft(character.persona))
                                onOpenAgentTools()
                            },
                        )
                    }
                }
            }
            ScrapbookFooter(
                layoutScale = layoutScale,
                enabled = !saving,
                onSend = {
                    onSendMessage(draft(character.persona), chatMode.storageValue)
                },
            )
        }
    }

    if (confirmDelete) {
        ConfirmDialog(
            title = "删除角色？",
            message = "角色资料和该角色聊天记录都会从本地删除。",
            appearance = appearance,
            onDismiss = { confirmDelete = false },
            onConfirm = {
                confirmDelete = false
                onDelete()
            },
        )
    }
    }
}

