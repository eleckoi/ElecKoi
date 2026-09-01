package com.eleckoi.android.feature.characters.modes.story.presets.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPreset
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetCatalog
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetModelTag
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetProfile
import com.eleckoi.android.feature.characters.model.AvatarSlot
import com.eleckoi.android.foundation.design.AppearanceTheme
import java.io.File
import com.eleckoi.android.feature.characters.modes.story.presets.ui.editor.StoryPresetEditor
import com.eleckoi.android.feature.characters.modes.story.presets.ui.library.StoryPresetLibrary

@Composable
fun StoryPresetPage(
    catalog: StoryPresetCatalog,
    editorPreset: StoryPreset?,
    editorEntryId: String? = null,
    returnToCallerAfterEntry: Boolean = false,
    loadingEditor: Boolean = false,
    exporting: Boolean = false,
    appearance: AppearanceTheme,
    toolContextNames: List<String> = emptyList(),
    showRootBackButton: Boolean = true,
    onBack: () -> Unit,
    onOpenPreset: (String) -> Unit,
    onEditorEntryOpened: () -> Unit = {},
    onCloseEditor: () -> Unit,
    onReturnFromExternalEntry: () -> Unit = onCloseEditor,
    onSetActive: (String) -> Unit,
    onCreate: (String, List<StoryPresetModelTag>, String) -> Unit,
    onImport: () -> Unit,
    onExport: (Set<String>) -> Unit,
    onUpdate: (StoryPreset) -> Unit,
    onRename: (String, String) -> Unit,
    onDuplicate: (String) -> Unit,
    onDelete: (String) -> Unit,
    onCreateGroup: (String) -> Unit,
    onRenameGroup: (String, String) -> Unit,
    onDeleteGroup: (String) -> Unit,
    onMoveToGroup: (String, String) -> Unit,
    onUpdateProfile: (String, StoryPresetProfile) -> Unit,
    onUpdateModelTags: (String, List<StoryPresetModelTag>) -> Unit,
    onUpdateAuthorAvatar: (String, Map<AvatarSlot, File>) -> Unit,
) {
    var overviewPresetId by rememberSaveable { mutableStateOf<String?>(null) }
    val overviewPreset = catalog.presets.firstOrNull { it.id == overviewPresetId }
    DisposableEffect(returnToCallerAfterEntry) {
        onDispose {
            if (returnToCallerAfterEntry) onCloseEditor()
        }
    }
    BackHandler(enabled = overviewPreset != null) { overviewPresetId = null }
    BackHandler(enabled = overviewPreset == null && editorPreset != null) {
        if (returnToCallerAfterEntry) onReturnFromExternalEntry() else onCloseEditor()
    }

    if (overviewPreset != null) {
        StoryPresetOverviewPage(
            preset = overviewPreset,
            active = overviewPreset.id == catalog.activePresetId,
            appearance = appearance,
            onBack = { overviewPresetId = null },
            onSetActive = { onSetActive(overviewPreset.id) },
            onRename = { name -> onRename(overviewPreset.id, name) },
            onUpdateProfile = { profile -> onUpdateProfile(overviewPreset.id, profile) },
            onUpdateModelTags = { tags -> onUpdateModelTags(overviewPreset.id, tags) },
            onUpdateAuthorAvatar = { files -> onUpdateAuthorAvatar(overviewPreset.id, files) },
        )
        return
    }

    if (editorPreset != null) {
        StoryPresetEditor(
            preset = editorPreset,
            initialEntryId = editorEntryId,
            appearance = appearance,
            toolContextNames = toolContextNames,
            onBack = onCloseEditor,
            returnToCallerAfterEntry = returnToCallerAfterEntry,
            onReturnFromExternalEntry = onReturnFromExternalEntry,
            onOpenOverview = { overviewPresetId = editorPreset.id },
            onInitialEntryHandled = onEditorEntryOpened,
            onUpdate = onUpdate,
        )
        return
    }

    if (loadingEditor) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(appearance.mobileBg),
        )
        return
    }

    StoryPresetLibrary(
        catalog = catalog,
        appearance = appearance,
        onBack = onBack.takeIf { showRootBackButton },
        onOpenPreset = onOpenPreset,
        onOpenOverview = { presetId -> overviewPresetId = presetId },
        onSetActive = onSetActive,
        onCreate = onCreate,
        onImport = onImport,
        exporting = exporting,
        onExport = onExport,
        onCreateGroup = onCreateGroup,
        onRenameGroup = onRenameGroup,
        onDeleteGroup = onDeleteGroup,
        onMoveToGroup = onMoveToGroup,
        onRename = onRename,
        onDuplicate = onDuplicate,
        onDelete = onDelete,
    )
}
