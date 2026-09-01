package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryMergeResult
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrarySource
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryVersion
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.mergeSettingLibraryEntries
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.settingLibraryTakenTitles
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Picking entries out of some other setting library and folding them into this one.
 *
 * Two places entries can come from, and only two: a character, or a file. "Another character" and
 * "another version of this character" looked like two answers but they are the same one — a card
 * with versions on it — so this character is simply first in the list, minus the version you are
 * already editing. Splitting them would have made the user classify their own intent before
 * choosing.
 *
 * Folders are not selectable rows in their own right — ticking one ticks everything beneath it.
 * What travels is entries; the folders come along because [mergeSettingLibraryEntries] rebuilds the
 * chain around whatever was picked.
 */
@Composable
internal fun SettingLibraryImportPage(
    sources: List<SettingLibrarySource>,
    loading: Boolean,
    currentCharacterName: String,
    currentCharacterAvatar: String,
    currentVersions: List<SettingLibraryVersion>,
    activeVersionId: String,
    targetEntries: List<SettingLibraryEntry>,
    targetGroups: List<SettingLibraryGroup>,
    appearance: AppearanceTheme,
    onParseFile: (String) -> SettingLibraryVersion?,
    onDismiss: () -> Unit,
    onApply: (SettingLibraryMergeResult) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var visible by remember { mutableStateOf(false) }
    var source by remember { mutableStateOf<SettingLibrarySource?>(null) }
    var versionId by remember { mutableStateOf("") }
    var checkedEntryIds by remember { mutableStateOf(emptySet<String>()) }
    var destinationGroupId by remember { mutableStateOf("") }
    var destinationPickerOpen by remember { mutableStateOf(false) }
    var confirmOpen by remember { mutableStateOf(false) }

    fun leaveSource() {
        source = null
        versionId = ""
        checkedEntryIds = emptySet()
        destinationGroupId = ""
    }

    // The file lands here rather than going through the shell's document plumbing, because nothing
    // is being written — the JSON is parsed into memory, picked over, and thrown away if cancelled.
    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val text = runCatching {
                withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(uri)
                        ?.bufferedReader()
                        ?.use { it.readText() }
                        .orEmpty()
                }
            }.getOrDefault("")
            val parsed = text.takeIf { it.isNotBlank() }?.let(onParseFile)
            if (parsed == null) {
                Toast.makeText(context, "这个文件读不出设定库", Toast.LENGTH_SHORT).show()
                return@launch
            }
            source = SettingLibrarySource(
                characterId = FileSourceId,
                characterName = parsed.name.trim().ifBlank { "设定库文件" },
                versions = listOf(parsed),
            )
            versionId = parsed.id
            checkedEntryIds = emptySet()
            destinationGroupId = ""
        }
    }

    BackHandler(enabled = visible) {
        when {
            confirmOpen -> confirmOpen = false
            source != null -> leaveSource()
            else -> visible = false
        }
    }
    LaunchedEffect(Unit) { visible = true }
    LaunchedEffect(visible) {
        if (!visible) {
            kotlinx.coroutines.delay(230)
            onDismiss()
        }
    }

    val activeSource = source
    val version = activeSource?.versions?.firstOrNull { it.id == versionId }
        ?: activeSource?.versions?.firstOrNull()

    val merge = remember(version, checkedEntryIds, destinationGroupId, targetEntries, targetGroups) {
        if (version == null || checkedEntryIds.isEmpty()) {
            null
        } else {
            mergeSettingLibraryEntries(
                targetEntries = targetEntries,
                targetGroups = targetGroups,
                sourceEntries = version.entries,
                sourceGroups = version.groups,
                selectedEntryIds = checkedEntryIds,
                destinationGroupId = destinationGroupId,
            )
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(
            visible = visible,
            enter = slideInVertically(
                initialOffsetY = { it },
                animationSpec = spring(dampingRatio = 0.78f, stiffness = 260f),
            ) + fadeIn(animationSpec = spring(dampingRatio = 0.85f, stiffness = 320f)),
            exit = slideOutVertically(
                targetOffsetY = { it },
                animationSpec = spring(dampingRatio = 0.86f, stiffness = 360f),
            ) + fadeOut(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(appearance.mobileBg)
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .noRippleClickable {},
            ) {
                ManagerTopBar(
                    title = activeSource?.characterName?.trim()?.ifBlank { "未命名角色" } ?: "并入设定库",
                    appearance = appearance,
                ) {
                    if (activeSource != null) leaveSource() else visible = false
                }

                if (activeSource == null) {
                    // This character first, without the version already open — you cannot merge a
                    // library into itself, and a row that does nothing is worse than no row.
                    val selfSource = SettingLibrarySource(
                        characterId = SelfSourceId,
                        characterName = currentCharacterName.trim().ifBlank { "当前角色" },
                        avatar = currentCharacterAvatar,
                        versions = currentVersions.filterNot { it.id == activeVersionId },
                    )
                    SourceList(
                        selfSource = selfSource,
                        sources = sources,
                        loading = loading,
                        appearance = appearance,
                        onPickFile = { filePicker.launch("application/json") },
                    ) { picked ->
                        source = picked
                        versionId = picked.versions.firstOrNull()?.id.orEmpty()
                        checkedEntryIds = emptySet()
                        destinationGroupId = ""
                    }
                } else {
                    EntryPicker(
                        source = activeSource,
                        version = version,
                        checkedEntryIds = checkedEntryIds,
                        takenTitles = remember(targetEntries) { settingLibraryTakenTitles(targetEntries) },
                        targetGroups = targetGroups,
                        destinationGroupId = destinationGroupId,
                        appearance = appearance,
                        onSelectVersion = {
                            versionId = it.id
                            checkedEntryIds = emptySet()
                        },
                        onToggleEntries = { ids, checked ->
                            checkedEntryIds = if (checked) checkedEntryIds + ids else checkedEntryIds - ids
                        },
                        onOpenDestinationPicker = { destinationPickerOpen = true },
                        onConfirm = { confirmOpen = true },
                    )
                }
            }
        }
    }

    if (destinationPickerOpen) {
        SettingLibraryEntryGroupPickerDialog(
            groups = targetGroups.sortedBy { it.order },
            selectedGroupId = destinationGroupId,
            appearance = appearance,
            onSelectGroup = { destinationGroupId = it },
            onDismiss = { destinationPickerOpen = false },
            onConfirm = { destinationPickerOpen = false },
        )
    }

    if (confirmOpen && merge != null) {
        SettingLibraryMergeConfirmSheet(
            sourceName = activeSource?.characterName.orEmpty(),
            versionName = version?.name.orEmpty(),
            plan = merge.plan,
            appearance = appearance,
            onDismiss = { confirmOpen = false },
            onConfirm = {
                confirmOpen = false
                onApply(merge)
                visible = false
            },
        )
    }
}

internal const val SelfSourceId = "__self__"
internal const val FileSourceId = "__file__"
