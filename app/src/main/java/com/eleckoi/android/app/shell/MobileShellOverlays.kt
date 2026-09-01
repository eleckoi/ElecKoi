package com.eleckoi.android.app.shell

import com.eleckoi.android.foundation.design.components.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import com.eleckoi.android.feature.characters.ui.CharactersIntent
import com.eleckoi.android.feature.characters.ui.CharactersViewModel
import com.eleckoi.android.feature.characters.modes.story.presets.ui.StoryPresetImportSourceDialog
import com.eleckoi.android.feature.characters.modes.story.presets.ui.StoryPresetExportDialog
import com.eleckoi.android.feature.characters.modes.story.presets.ui.StoryPresetBatchExportDialog
import com.eleckoi.android.feature.characters.modes.story.presets.ui.StoryPresetViewModel
import com.eleckoi.android.feature.characters.transfer.ui.CharacterExportDialog
import com.eleckoi.android.feature.characters.transfer.ui.CharacterBatchExportDialog
import com.eleckoi.android.feature.characters.transfer.ui.CharacterImportDialog
import com.eleckoi.android.feature.characters.transfer.ui.CharacterImportSourceDialog
import com.eleckoi.android.app.navigation.MobileRoute

@Composable
internal fun androidx.compose.foundation.layout.BoxScope.MobileShellOverlays(
    characterImportSourceOpen: Boolean,
    onCloseCharacterImportSource: () -> Unit,
    storyPresetImportSourceOpen: Boolean,
    onCloseStoryPresetImportSource: () -> Unit,
    charactersState: com.eleckoi.android.feature.characters.ui.CharactersUiState,
    storyPresetState: com.eleckoi.android.feature.characters.modes.story.presets.ui.StoryPresetUiState,
    appearance: com.eleckoi.android.foundation.design.AppearanceTheme,
    moreOpen: Boolean,
    user: com.eleckoi.android.feature.characters.model.UserProfile,
    appUpdateAvailable: Boolean,
    navigationBarColor: Color,
    shellViewModel: ShellViewModel,
    charactersViewModel: CharactersViewModel,
    storyPresetViewModel: StoryPresetViewModel,
    characterCardActions: CharacterCardDocumentActions,
    storyPresetDocumentActions: StoryPresetDocumentActions,
    navigateTo: (MobileRoute) -> Unit,
) {
    if (characterImportSourceOpen) {
        CharacterImportSourceDialog(
            appearance = appearance,
            onDismiss = { onCloseCharacterImportSource() },
            onImportElecKoi = {
                onCloseCharacterImportSource()
                characterCardActions.importCard()
            },
            onImportSillyTavern = {
                onCloseCharacterImportSource()
                characterCardActions.importSillyTavernCard()
            },
        )
    }
    if (storyPresetImportSourceOpen) {
        StoryPresetImportSourceDialog(
            appearance = appearance,
            onDismiss = { onCloseStoryPresetImportSource() },
            onImportElecKoi = {
                onCloseStoryPresetImportSource()
                storyPresetDocumentActions.importElecKoiPresets()
            },
            onImportSillyTavern = {
                onCloseStoryPresetImportSource()
                storyPresetDocumentActions.importSillyTavernPresets()
            },
        )
    }
    charactersState.importPreview?.let { preview ->
        CharacterImportDialog(
            preview = preview,
            busy = charactersState.transferBusy,
            appearance = appearance,
            onDismiss = {
                charactersViewModel.onIntent(CharactersIntent.DismissCharacterImport)
            },
            onConfirm = {
                charactersViewModel.onIntent(CharactersIntent.ConfirmCharacterImport)
            },
        )
    }
    charactersState.exportedCard?.let { card ->
        CharacterExportDialog(
            card = card,
            appearance = appearance,
            onDismiss = {
                charactersViewModel.onIntent(CharactersIntent.DismissCharacterExport)
            },
            onShareOriginal = {
                characterCardActions.shareOriginal(card)
                charactersViewModel.onIntent(CharactersIntent.DismissCharacterExport)
            },
            onSave = {
                characterCardActions.saveCard(card)
                charactersViewModel.onIntent(CharactersIntent.DismissCharacterExport)
            },
        )
    }
    if (charactersState.exportedCards.isNotEmpty()) {
        CharacterBatchExportDialog(
            cards = charactersState.exportedCards,
            appearance = appearance,
            onDismiss = {
                charactersViewModel.onIntent(CharactersIntent.DismissCharacterCardsExport)
            },
            onShareOriginal = {
                characterCardActions.shareOriginals(charactersState.exportedCards)
                charactersViewModel.onIntent(CharactersIntent.DismissCharacterCardsExport)
            },
            onSave = {
                characterCardActions.saveCards(charactersState.exportedCards)
                charactersViewModel.onIntent(CharactersIntent.DismissCharacterCardsExport)
            },
        )
    }
    storyPresetState.exportedCards.singleOrNull()?.let { card ->
        StoryPresetExportDialog(
            card = card,
            appearance = appearance,
            onDismiss = storyPresetViewModel::dismissPresetExport,
            onShareOriginal = {
                storyPresetDocumentActions.shareOriginal(card)
                storyPresetViewModel.dismissPresetExport()
            },
            onSave = {
                storyPresetDocumentActions.saveCard(card)
                storyPresetViewModel.dismissPresetExport()
            },
        )
    }
    if (storyPresetState.exportedCards.size > 1) {
        StoryPresetBatchExportDialog(
            cards = storyPresetState.exportedCards,
            appearance = appearance,
            onDismiss = storyPresetViewModel::dismissPresetExport,
            onShareOriginal = {
                storyPresetDocumentActions.shareOriginals(storyPresetState.exportedCards)
                storyPresetViewModel.dismissPresetExport()
            },
            onSave = {
                storyPresetDocumentActions.saveCards(storyPresetState.exportedCards)
                storyPresetViewModel.dismissPresetExport()
            },
        )
    }

    MobileMorePanel(
        visible = moreOpen,
        user = user,
        appearance = appearance,
        appUpdateAvailable = appUpdateAvailable,
        onClose = { shellViewModel.onIntent(ShellIntent.SetMoreOpen(false)) },
        onOpenProfile = {
            shellViewModel.onIntent(ShellIntent.SetMoreOpen(false))
            navigateTo(MobileRoute.Profile)
        },
        onOpenSettings = {
            shellViewModel.onIntent(ShellIntent.SetMoreOpen(false))
            navigateTo(MobileRoute.Settings)
        },
        onOpenUpdate = {
            shellViewModel.onIntent(ShellIntent.SetMoreOpen(false))
            navigateTo(MobileRoute.AppUpdate)
        },
    )
    ThreeButtonNavigationBarProtection(
        color = navigationBarColor,
        modifier = Modifier.align(Alignment.BottomCenter),
    )
}
