package com.eleckoi.android.app.shell

import com.eleckoi.android.feature.characters.ui.components.AvatarSlotsPage
import com.eleckoi.android.foundation.design.components.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavKey
import com.eleckoi.android.feature.characters.ui.CharactersIntent
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.SettingLibraryIntent
import com.eleckoi.android.feature.characters.modes.story.variables.ui.VariableConfigIntent
import com.eleckoi.android.feature.characters.ui.settings.CharacterSettingsPage
import com.eleckoi.android.feature.chat.ui.screen.ChatScreen
import com.eleckoi.android.app.navigation.MobileRoute

internal fun mobileCoreRouteEntry(
    currentRoute: MobileRoute,
    context: MobileShellRouteContext,
): NavEntry<NavKey>? = with(context) {
    when (currentRoute) {
        MobileRoute.Root -> NavEntry(currentRoute) {
            MobileRootTabs(
                shell = currentShellState.value,
                characters = currentCharactersState.value.characters,
                models = currentModelsState.value.models,
                user = currentProfileState.value.user,
                appearance = currentThemeState.value.appearance,
                isCreatorAssistantRunning = currentAiCreationAssistantState.value.isRunning,
                shellViewModel = shellViewModel,
                charactersViewModel = charactersViewModel,
                modelsViewModel = modelsViewModel,
                chatViewModel = chatViewModel,
                activeCharacter = activeCharacter,
                onImportCharacterCard = onOpenCharacterImportSource,
                onNavigate = navigateTo,
                rootSearchOpen = rootSearchOpen.value,
                onRootSearchOpenChange = onRootSearchOpenChange,
                bottomTabs = BottomTab.visibleTabs(
                    presetsPinned = currentShellState.value.presetPagePinned,
                    pluginsPinned = currentShellState.value.pluginPagePinned,
                    order = currentShellState.value.commonPageOrder,
                ),
                onChangeBottomTab = selectBottomTab,
            )
        }
        MobileRoute.Chat -> NavEntry(currentRoute) {
                ChatScreen(
                    viewModel = chatViewModel,
                    onBack = goBackInsideApp,
                    onOpenPlugins = {
                        val characterId = chatState.draft?.session?.characterId
                            .orEmpty()
                            .ifBlank { chatState.chatCharacterId }
                        if (characterId.isNotBlank()) {
                            navigateTo(MobileRoute.AgentTools(characterId))
                        }
                    },
                    onOpenPresets = {
                        storyPresetViewModel.closeEditor()
                        navigateTo(MobileRoute.StoryPresets())
                    },
                    dynamicSettingsSessionIds = currentSettingLibraryState.value.conversationLibraries
                        .mapTo(mutableSetOf()) { it.sessionId },
                    onOpenDynamicSettings = { characterId, sessionId ->
                        settingLibraryViewModel.onIntent(
                            SettingLibraryIntent.LoadConversationLibraries(characterId),
                        )
                        navigateTo(MobileRoute.DynamicSettings(characterId, sessionId))
                    },
                    onOpenUserAvatars = {
                        navigateTo(MobileRoute.UserAvatars)
                    },
                    onOpenCharacterSettings = { characterId ->
                        navigateTo(MobileRoute.CharacterSettings(characterId))
                    },
                )
        }
        is MobileRoute.CharacterAvatars -> NavEntry(currentRoute) {
                val pageAppearance = currentThemeState.value.appearance
                val character = activeCharacter(currentRoute.characterId)
                if (character == null) {
                    LaunchedEffect(currentRoute.characterId) { goBackInsideApp() }
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(pageAppearance.mobileBg),
                    )
                } else {
                    AvatarSlotsPage(
                        avatars = character.persona.assistantAvatars,
                        displayName = character.name,
                        cachePrefix = "character",
                        appearance = pageAppearance,
                        onBack = goBackInsideApp,
                        onSave = { files ->
                            charactersViewModel.onIntent(
                                CharactersIntent.SaveCharacterAvatars(
                                    currentRoute.characterId,
                                    files,
                                ),
                            )
                        },
                        onClear = { slot ->
                            charactersViewModel.onIntent(
                                CharactersIntent.ClearCharacterAvatarSlot(
                                    currentRoute.characterId,
                                    slot,
                                ),
                            )
                        },
                    )
                }
        }
        is MobileRoute.CharacterSettings -> NavEntry(currentRoute) {
                val pageAppearance = currentThemeState.value.appearance
                val pageCharacterSaving = currentCharactersState.value.saving
                CharacterSettingsPage(
                    character = activeCharacter(currentRoute.characterId),
                    appearance = pageAppearance,
                    saving = pageCharacterSaving,
                    onBack = goBackInsideApp,
                    onSavePersona = { persona ->
                        charactersViewModel.onIntent(CharactersIntent.SaveCharacterPersona(currentRoute.characterId, persona))
                    },
                    onSaveAvatars = { files ->
                        charactersViewModel.onIntent(
                            CharactersIntent.SaveCharacterAvatars(
                                currentRoute.characterId,
                                files,
                            ),
                        )
                    },
                    onClearAvatar = { slot ->
                        charactersViewModel.onIntent(
                            CharactersIntent.ClearCharacterAvatarSlot(
                                currentRoute.characterId,
                                slot,
                            ),
                        )
                    },
                    onSendMessage = { persona, characterMode ->
                        charactersViewModel.saveCharacterMode(
                            characterId = currentRoute.characterId,
                            mode = characterMode,
                            onSaved = {
                                charactersViewModel.saveCharacterPersona(
                                    characterId = currentRoute.characterId,
                                    persona = persona,
                                    onSaved = {
                                        chatViewModel.openCharacterChat(
                                            currentRoute.characterId,
                                            characterMode,
                                        )
                                        navigateTo(MobileRoute.Chat)
                                    },
                                )
                            },
                        )
                    },
                    onModeChange = { mode ->
                        charactersViewModel.onIntent(CharactersIntent.SaveCharacterMode(currentRoute.characterId, mode))
                    },
                    onOpenAiCreationAssistant = {
                        navigateTo(MobileRoute.AiCreationAssistant)
                    },
                    onOpenPresetConfig = {
                        storyPresetViewModel.closeEditor()
                        navigateTo(MobileRoute.StoryPresets())
                    },
                    onOpenSettingLibrary = {
                        settingLibraryViewModel.onIntent(SettingLibraryIntent.Load(currentRoute.characterId))
                        navigateTo(MobileRoute.SettingLibrary(currentRoute.characterId))
                    },
                    onOpenDynamicSettings = {
                        settingLibraryViewModel.onIntent(SettingLibraryIntent.LoadConversationLibraries(currentRoute.characterId))
                        navigateTo(MobileRoute.DynamicSettings(currentRoute.characterId))
                    },
                    onOpenVariableConfig = {
                        variableConfigViewModel.onIntent(VariableConfigIntent.Load(currentRoute.characterId))
                        navigateTo(MobileRoute.VariableConfig(currentRoute.characterId))
                    },
                    onOpenRegexRules = {
                        regexRulesViewModel.load(currentRoute.characterId)
                        navigateTo(MobileRoute.RegexRules(currentRoute.characterId))
                    },
                    onOpenFrontendBeauty = {
                        variableConfigViewModel.onIntent(VariableConfigIntent.Load(currentRoute.characterId))
                        navigateTo(MobileRoute.FrontendBeauty(currentRoute.characterId))
                    },
                    onOpenAgentTools = {
                        navigateTo(MobileRoute.AgentTools(currentRoute.characterId))
                    },
                    onExport = {
                        charactersViewModel.onIntent(
                            CharactersIntent.PrepareCharacterExport(currentRoute.characterId),
                        )
                    },
                    onDelete = {
                        charactersViewModel.onIntent(CharactersIntent.DeleteCharacters(listOf(currentRoute.characterId)))
                    },
                )
        }
        else -> null
    }
}
