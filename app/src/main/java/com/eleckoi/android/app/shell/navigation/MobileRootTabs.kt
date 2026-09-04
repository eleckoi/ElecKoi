package com.eleckoi.android.app.shell

import com.eleckoi.android.foundation.design.components.*
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.unit.dp
import com.eleckoi.android.app.navigation.MobileRoute
import com.eleckoi.android.app.navigation.MobileBackHandler
import com.eleckoi.android.engine.generation.config.ModelConfigCollection
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.feature.characters.model.CharactersPayload
import com.eleckoi.android.feature.characters.model.UserProfile
import com.eleckoi.android.feature.characters.ui.CharactersIntent
import com.eleckoi.android.feature.characters.ui.CharactersViewModel
import com.eleckoi.android.feature.characters.ui.list.CharactersRootPage
import com.eleckoi.android.feature.chat.ui.ChatViewModel
import com.eleckoi.android.feature.modelconfig.ui.ModelTarget
import com.eleckoi.android.feature.modelconfig.ui.ModelProviderPickerSheet
import com.eleckoi.android.feature.modelconfig.ui.ModelsRootPage
import com.eleckoi.android.feature.modelconfig.ui.ModelsViewModel
import com.eleckoi.android.foundation.design.AppearanceTheme

@Composable
internal fun MobileRootTabs(
    shell: ShellUiState,
    characters: CharactersPayload?,
    models: ModelConfigCollection?,
    user: UserProfile,
    appearance: AppearanceTheme,
    isCreatorAssistantRunning: Boolean,
    shellViewModel: ShellViewModel,
    charactersViewModel: CharactersViewModel,
    modelsViewModel: ModelsViewModel,
    chatViewModel: ChatViewModel,
    activeCharacter: (String) -> CharacterSlot?,
    onImportCharacterCard: () -> Unit,
    onNavigate: (MobileRoute) -> Unit,
    rootSearchOpen: Boolean,
    onRootSearchOpenChange: (Boolean) -> Unit,
    bottomTabs: List<BottomTab>,
    onChangeBottomTab: (BottomTab) -> Unit,
) {
    // The character manager is a full-screen sheet living inside the Characters tab's content, so
    // the tab bar has to step out of the layout for it — a sheet cannot paint over its own sibling.
    var charactersManagerOpen by rememberSaveable { mutableStateOf(false) }
    var characterAddMenuOpen by rememberSaveable { mutableStateOf(false) }
    var modelProviderPickerOpen by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(shell.activeTab) {
        onRootSearchOpenChange(false)
        modelProviderPickerOpen = false
        characterAddMenuOpen = false
    }
    MobileBackHandler(
        enabled = rootSearchOpen,
        onBack = { onRootSearchOpenChange(false) },
    )
    MobileBackHandler(
        enabled = characterAddMenuOpen,
        onBack = { characterAddMenuOpen = false },
    )
    MobileBackHandler(
        enabled = modelProviderPickerOpen,
        onBack = { modelProviderPickerOpen = false },
    )
    val modalBackdropBlur by animateDpAsState(
        // The small character "+" menu is a popup, not a modal sheet. Keep its background
        // readable under a dim scrim; blurring the whole tree also blurred and greyed the popup.
        targetValue = if (modelProviderPickerOpen) 12.dp else 0.dp,
        animationSpec = tween(durationMillis = 180),
        label = "modelProviderBackdropBlur",
    )
    MobileRootGlassProvider(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .then(
                    if (modalBackdropBlur > 0.dp) {
                        Modifier.blur(modalBackdropBlur, BlurredEdgeTreatment.Unbounded)
                    } else {
                        Modifier
                    },
                ),
        ) {
            MobileRootBackdrop(appearance = appearance)
            Column(modifier = Modifier.fillMaxSize()) {
                Box(modifier = Modifier.weight(1f)) {
                    when (shell.activeTab) {
                RootTab.Messages -> MessagesRootPage(
                    user = user,
                    chats = shell.chats,
                    pinnedChatIds = shell.pinnedChatIds,
                    hiddenChatIds = shell.hiddenChatIds,
                    activeChatSessionIds = shell.activeChatSessionIds,
                    characterModesById = characters?.items.orEmpty().associate { character ->
                        character.id to character.characterMode
                    },
                    appearance = appearance,
                    onSearch = { onRootSearchOpenChange(true) },
                    onAdd = {
                        chatViewModel.loadInitialDraft()
                        onNavigate(MobileRoute.Chat)
                    },
                    onOpenProfile = {
                        shellViewModel.onIntent(ShellIntent.SetMoreOpen(true))
                    },
                    onOpenChat = { sessionId ->
                        // A chat-list row identifies one exact ledger. Resolving it again through
                        // the character cleared the warm draft and could open another session.
                        chatViewModel.loadDraft(sessionId)
                        onNavigate(MobileRoute.Chat)
                    },
                    onTogglePinnedChat = { sessionId ->
                        shellViewModel.onIntent(ShellIntent.TogglePinnedChat(sessionId))
                    },
                    onHideChat = { sessionId ->
                        shellViewModel.onIntent(ShellIntent.HideChat(sessionId))
                    },
                )

                RootTab.Characters -> CharactersRootPage(
                    user = user,
                    characters = characters,
                    appearance = appearance,
                    onSearch = { onRootSearchOpenChange(true) },
                    managerOpen = charactersManagerOpen,
                    onManagerOpenChange = { charactersManagerOpen = it },
                    isAssistantRunning = isCreatorAssistantRunning,
                    onOpenAiCreationAssistant = {
                        onNavigate(MobileRoute.AiCreationAssistant)
                    },
                    onAdd = { group ->
                        charactersViewModel.onIntent(CharactersIntent.CreateCharacter(group))
                    },
                    onCreateGroup = { name ->
                        charactersViewModel.onIntent(CharactersIntent.CreateCharacterGroup(name))
                    },
                    onToggleAllCharactersExpanded = {
                        charactersViewModel.onIntent(CharactersIntent.ToggleAllCharactersExpanded)
                    },
                    onToggleCharacterGroupExpanded = { group ->
                        charactersViewModel.onIntent(CharactersIntent.ToggleCharacterGroupExpanded(group))
                    },
                    onOpenProfile = {
                        shellViewModel.onIntent(ShellIntent.SetMoreOpen(true))
                    },
                    onOpenCharacter = { characterId ->
                        charactersViewModel.onIntent(CharactersIntent.SelectCharacter(characterId))
                    },
                    onSaveCharacters = { payload ->
                        charactersViewModel.onIntent(
                            CharactersIntent.SaveCharacterCollection(payload),
                        )
                    },
                    onImportCharacterCard = onImportCharacterCard,
                    onExportCharacters = { ids ->
                        charactersViewModel.onIntent(CharactersIntent.ExportCharacterCards(ids))
                    },
                    onDeleteCharacters = { ids ->
                        charactersViewModel.onIntent(CharactersIntent.DeleteCharacters(ids))
                    },
                    addMenuExpanded = characterAddMenuOpen,
                    onAddMenuExpandedChange = { characterAddMenuOpen = it },
                )

                RootTab.Models -> ModelsRootPage(
                    userName = user.userName,
                    userAvatarPath = user.userAvatar,
                    models = models,
                    appearance = appearance,
                    onSearch = { onRootSearchOpenChange(true) },
                    onAdd = { modelProviderPickerOpen = true },
                    onOpenProfile = {
                        shellViewModel.onIntent(ShellIntent.SetMoreOpen(true))
                    },
                    onOpenModel = { providerId, configId ->
                        onNavigate(
                            MobileRoute.ModelSettings(
                                ModelTarget(providerId = providerId, configId = configId),
                            ),
                        )
                    },
                )
                    }
                }
                if (!charactersManagerOpen && !rootSearchOpen && !modelProviderPickerOpen) {
                    MobileTabBar(
                        activeTab = BottomTab.from(shell.activeTab),
                        tabs = bottomTabs,
                        appearance = appearance,
                        onChange = onChangeBottomTab,
                    )
                }
            }
        }
        ModelProviderPickerSheet(
            visible = modelProviderPickerOpen,
            appearance = appearance,
            onDismiss = { modelProviderPickerOpen = false },
            onSelect = { providerId ->
                modelProviderPickerOpen = false
                onNavigate(
                    MobileRoute.ModelSettings(modelsViewModel.createDraftTarget(providerId)),
                )
            },
        )
        HomeSearchOverlay(
            visible = rootSearchOpen,
            chats = shell.chats.filterNot { it.id in shell.hiddenChatIds },
            characters = characters,
            modelConfigs = models?.configs.orEmpty(),
            history = shell.searchHistory,
            appearance = appearance,
            onDismiss = { onRootSearchOpenChange(false) },
            onCommitTerm = { term ->
                shellViewModel.onIntent(ShellIntent.RememberSearch(term))
            },
            onForgetTerm = { term ->
                shellViewModel.onIntent(ShellIntent.ForgetSearch(term))
            },
            onClearHistory = {
                shellViewModel.onIntent(ShellIntent.ClearSearchHistory)
            },
            onOpenChat = { sessionId ->
                onRootSearchOpenChange(false)
                chatViewModel.loadDraft(sessionId)
                onNavigate(MobileRoute.Chat)
            },
            onOpenCharacter = { characterId ->
                onRootSearchOpenChange(false)
                charactersViewModel.onIntent(CharactersIntent.SelectCharacter(characterId))
            },
            onOpenModel = { providerId, configId ->
                onRootSearchOpenChange(false)
                onNavigate(
                    MobileRoute.ModelSettings(
                        ModelTarget(providerId = providerId, configId = configId),
                    ),
                )
            },
        )
    }
}

internal fun elecKoiForwardRoute(): ContentTransform {
    return (
        slideInHorizontally { width -> width } +
            fadeIn(initialAlpha = 0.90f)
        ).togetherWith(
        slideOutHorizontally { width -> -width } +
            fadeOut(targetAlpha = 0f),
    )
}

internal fun elecKoiBackRoute(): ContentTransform {
    return (
        slideInHorizontally { width -> -width } +
            fadeIn(initialAlpha = 0.90f)
        ).togetherWith(
        slideOutHorizontally { width -> width } +
            fadeOut(targetAlpha = 0f),
    )
}
