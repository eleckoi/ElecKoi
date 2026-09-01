package com.eleckoi.android.feature.characters.modes.story.frontendbeauty.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eleckoi.android.foundation.design.AppearanceTheme

private val FrontendImportMimeTypes = arrayOf(
    "text/html",
    "application/zip",
    "application/octet-stream",
)

@Composable
fun FrontendBeautyPage(
    characterId: String,
    characterName: String,
    appearance: AppearanceTheme,
    viewModel: FrontendBeautyViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { viewModel.onIntent(FrontendBeautyIntent.Import(it)) }
    }
    LaunchedEffect(characterId) {
        viewModel.onIntent(FrontendBeautyIntent.Load(characterId))
    }

    FrontendBeautyContent(
        characterName = characterName,
        state = state,
        appearance = appearance,
        onBack = onBack,
        onImport = { importLauncher.launch(FrontendImportMimeTypes) },
        onDelete = { viewModel.onIntent(FrontendBeautyIntent.Delete(it)) },
        onSelect = { viewModel.onIntent(FrontendBeautyIntent.Select(it)) },
        onMessageRendererEnabledChange = {
            viewModel.onIntent(FrontendBeautyIntent.SetMessageRendererEnabled(it))
        },
        onDismissError = { viewModel.onIntent(FrontendBeautyIntent.DismissError) },
    )
}
