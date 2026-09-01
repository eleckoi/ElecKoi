package com.eleckoi.android.app.shell

import com.eleckoi.android.foundation.design.components.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.eleckoi.android.feature.characters.model.CharacterSlot
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.eleckoi.android.feature.characters.ui.CharactersIntent
import com.eleckoi.android.feature.characters.ui.CharactersViewModel
import com.eleckoi.android.feature.characters.modes.story.frontendbeauty.ui.FrontendBeautyViewModel
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantViewModel
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.SettingLibraryIntent
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.SettingLibraryViewModel
import com.eleckoi.android.feature.characters.modes.story.presets.ui.StoryPresetViewModel
import com.eleckoi.android.feature.characters.modes.story.variables.ui.VariableConfigIntent
import com.eleckoi.android.feature.characters.modes.story.variables.ui.VariableConfigViewModel
import com.eleckoi.android.feature.characters.modes.story.regex.ui.RegexRulesViewModel
import com.eleckoi.android.feature.chat.ui.ChatViewModel
import com.eleckoi.android.feature.chat.ui.layout.asRoleplayReadingTheme
import com.eleckoi.android.feature.preferences.ChatLayoutMode
import com.eleckoi.android.feature.settings.ui.personalization.chat.ChatDisplaySettingsViewModel
import com.eleckoi.android.feature.settings.ui.personalization.profile.ProfileViewModel
import com.eleckoi.android.feature.settings.ui.personalization.theme.ThemeViewModel
import com.eleckoi.android.feature.modelconfig.ui.ModelsViewModel
import com.eleckoi.android.app.navigation.MobileBackHandler
import com.eleckoi.android.app.navigation.MobileRoute
import com.eleckoi.android.feature.settings.ui.runtime.LocalRuntimeSettingsViewModel
import com.eleckoi.android.feature.settings.ui.websearch.WebSearchSettingsViewModel
import com.eleckoi.android.feature.settings.ui.remotedsh.RemoteDshSettingsViewModel
import com.eleckoi.android.engine.agent.remotedsh.RemoteDshPlugin
import com.eleckoi.android.feature.agenttools.AgentToolsViewModel
import com.eleckoi.android.engine.agent.tools.AgentToolContextSnapshot
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eleckoi.android.app.service.backup.DataBackupService
import com.eleckoi.android.app.update.AppUpdateViewModel

@Composable
internal fun MobileShell(
    shellViewModel: ShellViewModel,
    charactersViewModel: CharactersViewModel,
    settingLibraryViewModel: SettingLibraryViewModel,
    storyPresetViewModel: StoryPresetViewModel,
    variableConfigViewModel: VariableConfigViewModel,
    regexRulesViewModel: RegexRulesViewModel,
    frontendBeautyViewModel: FrontendBeautyViewModel,
    aiCreationAssistantViewModel: AiCreationAssistantViewModel,
    localRuntimeSettingsViewModel: LocalRuntimeSettingsViewModel,
    appUpdateViewModel: AppUpdateViewModel,
    webSearchSettingsViewModel: WebSearchSettingsViewModel,
    remoteDshSettingsViewModel: RemoteDshSettingsViewModel,
    remoteDshPlugin: RemoteDshPlugin,
    modelsViewModel: ModelsViewModel,
    profileViewModel: ProfileViewModel,
    themeViewModel: ThemeViewModel,
    chatDisplaySettingsViewModel: ChatDisplaySettingsViewModel,
    agentToolsViewModel: AgentToolsViewModel,
    chatViewModel: ChatViewModel,
    dataBackupService: DataBackupService,
    toolContextSnapshotProvider: (String) -> AgentToolContextSnapshot,
    agentBackgroundProtectionEnabled: Boolean,
    onAgentBackgroundProtectionEnabledChange: (Boolean) -> Unit,
    onAgentBackgroundProtectionPermissionChanged: () -> Unit,
) {
    val shellState by shellViewModel.uiState.collectAsStateWithLifecycle()
    val charactersState by charactersViewModel.uiState.collectAsStateWithLifecycle()
    val settingLibraryState by settingLibraryViewModel.uiState.collectAsStateWithLifecycle()
    val storyPresetState by storyPresetViewModel.uiState.collectAsStateWithLifecycle()
    val variableConfigState by variableConfigViewModel.uiState.collectAsStateWithLifecycle()
    val regexRulesState by regexRulesViewModel.uiState.collectAsStateWithLifecycle()
    val aiCreationAssistantState by aiCreationAssistantViewModel.uiState.collectAsStateWithLifecycle()
    val modelsState by modelsViewModel.uiState.collectAsStateWithLifecycle()
    val profileState by profileViewModel.uiState.collectAsStateWithLifecycle()
    val themeState by themeViewModel.uiState.collectAsStateWithLifecycle()
    val chatState by chatViewModel.uiState.collectAsStateWithLifecycle()
    val appUpdateState by appUpdateViewModel.uiState.collectAsStateWithLifecycle()
    val appearance = themeState.appearance
    val user = profileState.user
    val moreOpen = shellState.moreOpen
    val backStack = rememberNavBackStack(MobileRoute.Root)
    val route = backStack.lastOrNull() as? MobileRoute ?: MobileRoute.Root
    val currentShellState = rememberUpdatedState(shellState)
    val currentCharactersState = rememberUpdatedState(charactersState)
    val currentSettingLibraryState = rememberUpdatedState(settingLibraryState)
    val currentStoryPresetState = rememberUpdatedState(storyPresetState)
    val currentVariableConfigState = rememberUpdatedState(variableConfigState)
    val currentRegexRulesState = rememberUpdatedState(regexRulesState)
    val currentAiCreationAssistantState = rememberUpdatedState(aiCreationAssistantState)
    val currentModelsState = rememberUpdatedState(modelsState)
    val currentProfileState = rememberUpdatedState(profileState)
    val currentThemeState = rememberUpdatedState(themeState)
    val currentAppUpdateState = rememberUpdatedState(appUpdateState)
    val currentAgentBackgroundProtectionEnabled =
        rememberUpdatedState(agentBackgroundProtectionEnabled)
    val currentOnAgentBackgroundProtectionEnabledChange =
        rememberUpdatedState(onAgentBackgroundProtectionEnabledChange)
    val currentOnAgentBackgroundProtectionPermissionChanged =
        rememberUpdatedState(onAgentBackgroundProtectionPermissionChanged)
    val context = LocalContext.current
    var characterImportSourceOpen by rememberSaveable { mutableStateOf(false) }
    var storyPresetImportSourceOpen by rememberSaveable { mutableStateOf(false) }
    var rootSearchOpen by rememberSaveable { mutableStateOf(false) }
    val currentRootSearchOpen = rememberUpdatedState(rootSearchOpen)
    fun setRootSearchOpen(open: Boolean) {
        rootSearchOpen = open
    }
    val documentActions = rememberShellDocumentActions(
        onCharactersImported = { json ->
            charactersViewModel.onIntent(CharactersIntent.ImportCharacters(json))
        },
        onSettingLibraryImported = { characterId, json ->
            settingLibraryViewModel.onIntent(SettingLibraryIntent.Import(characterId, json))
        },
        onVariableConfigImported = { characterId, json ->
            variableConfigViewModel.onIntent(VariableConfigIntent.Import(characterId, json))
        },
        onRegexRulesImported = { characterId, scope, documents ->
            regexRulesViewModel.importRules(characterId, scope, documents)
        },
    )
    val characterCardActions = rememberCharacterCardDocumentActions(
        onCardsSelected = { files, source ->
            charactersViewModel.onIntent(CharactersIntent.PrepareCharacterImport(files, source))
        },
    )
    val storyPresetDocumentActions = rememberStoryPresetDocumentActions(
        onDocumentsSelected = storyPresetViewModel::importPresets,
    )
    val dataBackupActions = rememberDataBackupActions(dataBackupService)

    fun activeCharacter(characterId: String): CharacterSlot? {
        return currentCharactersState.value.characters?.items?.firstOrNull { it.id == characterId }
    }

    fun navigateTo(nextRoute: MobileRoute) {
        if (nextRoute == MobileRoute.Root) {
            backStack.clear()
            backStack.add(MobileRoute.Root)
            return
        }
        if (backStack.lastOrNull() != nextRoute) {
            backStack.add(nextRoute)
        }
    }

    fun selectBottomTab(tab: BottomTab) {
        tab.rootTabOrNull()?.let { rootTab ->
            shellViewModel.onIntent(ShellIntent.ChangeTab(rootTab))
            navigateTo(MobileRoute.Root)
            return
        }
        val nextRoute = when (tab) {
            BottomTab.Presets -> {
                storyPresetViewModel.closeEditor()
                MobileRoute.StoryPresets(rootTab = true)
            }
            BottomTab.Plugins -> MobileRoute.AgentTools(rootTab = true)
            else -> return
        }
        if (route != nextRoute) {
            backStack.clear()
            backStack.add(MobileRoute.Root)
            backStack.add(nextRoute)
        }
    }

    fun replaceTop(nextRoute: MobileRoute) {
        if (backStack.isEmpty()) {
            backStack.add(nextRoute)
        } else if (backStack.size >= 2 && backStack[backStack.lastIndex - 1] == nextRoute) {
            backStack.removeLastOrNull()
        } else {
            backStack[backStack.lastIndex] = nextRoute
        }
    }

    fun closeRoute() {
        navigateTo(MobileRoute.Root)
        settingLibraryViewModel.onIntent(SettingLibraryIntent.Clear)
        variableConfigViewModel.onIntent(VariableConfigIntent.Clear)
    }

    fun goBackInsideApp() {
        val previousRoute = route
        if (backStack.size > 1) {
            backStack.removeLastOrNull()
        }
        if (previousRoute != MobileRoute.Root && previousRoute !is MobileRoute.SettingLibrary && previousRoute !is MobileRoute.DynamicSettings) {
            settingLibraryViewModel.onIntent(SettingLibraryIntent.Clear)
        }
        if (previousRoute != MobileRoute.Root && previousRoute !is MobileRoute.VariableConfig) {
            variableConfigViewModel.onIntent(VariableConfigIntent.Clear)
        }
    }

    MobileShellEffects(
        route = route,
        chatState = chatState,
        appearance = appearance,
        charactersState = charactersState,
        profileState = profileState,
        settingLibraryState = settingLibraryState,
        storyPresetState = storyPresetState,
        shellViewModel = shellViewModel,
        charactersViewModel = charactersViewModel,
        settingLibraryViewModel = settingLibraryViewModel,
        variableConfigViewModel = variableConfigViewModel,
        storyPresetViewModel = storyPresetViewModel,
        regexRulesViewModel = regexRulesViewModel,
        profileViewModel = profileViewModel,
        chatViewModel = chatViewModel,
        documentActions = documentActions,
        latestRoute = rememberUpdatedState(route),
        navigateTo = ::navigateTo,
    )

    val roleplayChatOpen = route == MobileRoute.Chat &&
        chatState.chatLayoutMode == ChatLayoutMode.Roleplay
    val storyPresetRootOpen = route is MobileRoute.StoryPresets &&
        route.rootTab &&
        storyPresetState.editorPreset == null
    val pluginRootOpen = route is MobileRoute.AgentTools && route.rootTab
    val bottomChromeOpen = route == MobileRoute.Root || storyPresetRootOpen || pluginRootOpen
    val navigationBarColor = when {
        roleplayChatOpen -> appearance.asRoleplayReadingTheme().mobileSurface
        route == MobileRoute.Chat -> appearance.mobileChatBg
        route == MobileRoute.Root && rootSearchOpen -> Color.White
        bottomChromeOpen -> appearance.mobileTabbarBg
        else -> appearance.mobileBg
    }
    val routeContext = MobileShellRouteContext(
        currentShellState = currentShellState,
        currentCharactersState = currentCharactersState,
        currentSettingLibraryState = currentSettingLibraryState,
        currentVariableConfigState = currentVariableConfigState,
        currentRegexRulesState = currentRegexRulesState,
        currentAiCreationAssistantState = currentAiCreationAssistantState,
        currentModelsState = currentModelsState,
        currentProfileState = currentProfileState,
        currentThemeState = currentThemeState,
        currentAppUpdateState = currentAppUpdateState,
        currentAgentBackgroundProtectionEnabled = currentAgentBackgroundProtectionEnabled,
        currentOnAgentBackgroundProtectionEnabledChange =
            currentOnAgentBackgroundProtectionEnabledChange,
        currentOnAgentBackgroundProtectionPermissionChanged =
            currentOnAgentBackgroundProtectionPermissionChanged,
        currentStoryPresetState = currentStoryPresetState,
        chatState = chatState,
        appearance = appearance,
        user = user,
        shellViewModel = shellViewModel,
        charactersViewModel = charactersViewModel,
        settingLibraryViewModel = settingLibraryViewModel,
        storyPresetViewModel = storyPresetViewModel,
        variableConfigViewModel = variableConfigViewModel,
        regexRulesViewModel = regexRulesViewModel,
        frontendBeautyViewModel = frontendBeautyViewModel,
        aiCreationAssistantViewModel = aiCreationAssistantViewModel,
        localRuntimeSettingsViewModel = localRuntimeSettingsViewModel,
        appUpdateViewModel = appUpdateViewModel,
        webSearchSettingsViewModel = webSearchSettingsViewModel,
        remoteDshSettingsViewModel = remoteDshSettingsViewModel,
        remoteDshPlugin = remoteDshPlugin,
        modelsViewModel = modelsViewModel,
        profileViewModel = profileViewModel,
        themeViewModel = themeViewModel,
        chatDisplaySettingsViewModel = chatDisplaySettingsViewModel,
        agentToolsViewModel = agentToolsViewModel,
        chatViewModel = chatViewModel,
        toolContextSnapshotProvider = toolContextSnapshotProvider,
        documentActions = documentActions,
        dataBackupActions = dataBackupActions,
        activeCharacter = ::activeCharacter,
        navigateTo = ::navigateTo,
        replaceTop = ::replaceTop,
        selectBottomTab = ::selectBottomTab,
        goBackInsideApp = ::goBackInsideApp,
        closeRoute = ::closeRoute,
        rootSearchOpen = currentRootSearchOpen,
        onRootSearchOpenChange = ::setRootSearchOpen,
        onOpenCharacterImportSource = { characterImportSourceOpen = true },
        onOpenStoryPresetImportSource = { storyPresetImportSourceOpen = true },
    )
    SyncSystemBars(
        navigationBarColor = navigationBarColor,
        darkStatusBarIcons =
            !moreOpen &&
                !roleplayChatOpen,
    )

    MobileBackHandler(
        enabled = moreOpen,
        onBack = { shellViewModel.onIntent(ShellIntent.SetMoreOpen(false)) },
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(appearance.mobileBg)
    ) {
        NavDisplay(
            modifier = Modifier.then(
                if (bottomChromeOpen || route == MobileRoute.Chat) {
                    Modifier
                } else {
                    Modifier.navigationBarsPadding()
                },
            ),
            backStack = backStack,
            onBack = ::goBackInsideApp,
            transitionSpec = { elecKoiForwardRoute() },
            popTransitionSpec = { elecKoiBackRoute() },
            predictivePopTransitionSpec = { elecKoiBackRoute() },
            entryProvider = { key ->
                mobileShellRouteEntry(key as? MobileRoute, routeContext)
            },
        )

        MobileShellOverlays(
            characterImportSourceOpen = characterImportSourceOpen,
            onCloseCharacterImportSource = { characterImportSourceOpen = false },
            storyPresetImportSourceOpen = storyPresetImportSourceOpen,
            onCloseStoryPresetImportSource = { storyPresetImportSourceOpen = false },
            charactersState = charactersState,
            storyPresetState = storyPresetState,
            appearance = appearance,
            moreOpen = moreOpen,
            user = user,
            appUpdateAvailable = appUpdateState.updateAvailable,
            navigationBarColor = navigationBarColor,
            shellViewModel = shellViewModel,
            charactersViewModel = charactersViewModel,
            storyPresetViewModel = storyPresetViewModel,
            characterCardActions = characterCardActions,
            storyPresetDocumentActions = storyPresetDocumentActions,
            navigateTo = ::navigateTo,
        )
    }
}
