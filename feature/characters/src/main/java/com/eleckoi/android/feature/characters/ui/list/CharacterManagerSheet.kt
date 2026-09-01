package com.eleckoi.android.feature.characters.ui.list

import androidx.compose.foundation.background
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.model.CharactersPayload
import com.eleckoi.android.feature.characters.model.UserProfile
import com.eleckoi.android.foundation.design.components.ConfirmDialog
import com.eleckoi.android.foundation.design.components.MobileEmptyState
import com.eleckoi.android.foundation.design.components.noRippleClickable
import kotlinx.coroutines.delay
import com.eleckoi.android.feature.characters.ui.list.components.CharacterManagerCard
import com.eleckoi.android.feature.characters.ui.list.components.CharacterManagerGroupChips
import com.eleckoi.android.feature.characters.ui.list.components.CharacterManagerHeader
import com.eleckoi.android.feature.characters.ui.list.components.CharacterManagerSelectionBar
import com.eleckoi.android.feature.characters.ui.list.components.ManagerSearchBar
import com.eleckoi.android.feature.characters.ui.list.group.CharacterGroupManagerPage

internal enum class CharacterBatchAction {
    Export,
    Delete,
}

private class CharacterManagerSheetState {
    var batchAction by mutableStateOf<CharacterBatchAction?>(null)
    val selectedIds = mutableStateListOf<String>()
    var pendingDeleteCharacters by mutableStateOf<List<String>?>(null)
    var groupManagerOpen by mutableStateOf(false)

    fun enterBatchMode(action: CharacterBatchAction) {
        batchAction = action
        selectedIds.clear()
    }

    fun toggleCharacterSelection(characterId: String) {
        if (selectedIds.contains(characterId)) {
            selectedIds.remove(characterId)
        } else {
            selectedIds.add(characterId)
        }
    }

    fun exitBatchMode() {
        batchAction = null
        selectedIds.clear()
    }

    fun clearPendingDelete() {
        pendingDeleteCharacters = null
    }

    fun confirmDeleteHandled() {
        selectedIds.clear()
        batchAction = null
        pendingDeleteCharacters = null
    }
}

@Composable
private fun rememberCharacterManagerSheetState(): CharacterManagerSheetState {
    return remember { CharacterManagerSheetState() }
}

@Composable
internal fun CharacterManagerSheet(
    user: UserProfile,
    characters: CharactersPayload,
    groups: List<String>,
    selectedGroup: String,
    keyword: String,
    appearance: AppearanceTheme,
    onKeywordChange: (String) -> Unit,
    onSelectGroup: (String) -> Unit,
    onClose: () -> Unit,
    onOpenCharacter: (String) -> Unit,
    onSaveCharacters: (CharactersPayload) -> Unit,
    onImportCharacterCard: () -> Unit,
    onExportCharacters: (List<String>) -> Unit,
    onDeleteCharacters: (List<String>) -> Unit,
) {
    val sheetState = rememberCharacterManagerSheetState()
    val visibleSheet = remember { mutableStateOf(false) }
    with(sheetState) {
    val visible = filterCharacters(characters.items, keyword).let { filtered ->
        if (selectedGroup == ALL_CHARACTERS) {
            sortedAllCharacters(filtered)
        } else {
            sortedCharactersForGroup(filtered, selectedGroup)
        }
    }

    fun requestClose() {
        visibleSheet.value = false
    }

    BackHandler(enabled = visibleSheet.value) {
        requestClose()
    }

    LaunchedEffect(Unit) {
        visibleSheet.value = true
    }

    LaunchedEffect(visibleSheet.value) {
        if (!visibleSheet.value) {
            delay(230)
            onClose()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize(),
        contentAlignment = Alignment.BottomCenter,
    ) {
        AnimatedVisibility(
            visible = visibleSheet.value,
            enter = slideInVertically(
                initialOffsetY = { fullHeight -> fullHeight },
                animationSpec = spring(dampingRatio = 0.78f, stiffness = 260f),
            ) + fadeIn(animationSpec = spring(dampingRatio = 0.85f, stiffness = 320f)),
            exit = slideOutVertically(
                targetOffsetY = { fullHeight -> fullHeight },
                animationSpec = spring(dampingRatio = 0.86f, stiffness = 360f),
            ) + fadeOut(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(appearance.mobileBg)
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .imePadding()
                    .noRippleClickable {}
                    .padding(start = 4.dp, top = 2.dp, end = 4.dp, bottom = 0.dp),
            ) {
                if (batchAction != null) {
                    val currentAction = checkNotNull(batchAction)
                    val allVisibleSelected = visible.isNotEmpty() &&
                        visible.all { character -> character.id in selectedIds }
                    CharacterManagerSelectionBar(
                        selectedCount = selectedIds.size,
                        allSelected = allVisibleSelected,
                        action = currentAction,
                        appearance = appearance,
                        onToggleSelectAll = {
                            val visibleIds = visible.map { character -> character.id }.toSet()
                            if (allVisibleSelected) {
                                selectedIds.removeAll(visibleIds)
                            } else {
                                selectedIds.addAll(visibleIds - selectedIds.toSet())
                            }
                        },
                        onConfirm = {
                            val ids = selectedIds.toList()
                            if (ids.isEmpty()) return@CharacterManagerSelectionBar
                            when (currentAction) {
                                CharacterBatchAction.Export -> {
                                    onExportCharacters(ids)
                                    exitBatchMode()
                                }
                                CharacterBatchAction.Delete -> pendingDeleteCharacters = ids
                            }
                        },
                        onCancel = ::exitBatchMode,
                    )
                } else {
                    CharacterManagerHeader(
                        appearance = appearance,
                        onDelete = { enterBatchMode(CharacterBatchAction.Delete) },
                        onOpenGroups = { groupManagerOpen = true },
                        onImport = onImportCharacterCard,
                        onExport = { enterBatchMode(CharacterBatchAction.Export) },
                        onClose = ::requestClose,
                    )
                }

                CharacterManagerGroupChips(
                    groups = groups,
                    characters = characters,
                    selectedGroup = selectedGroup,
                    appearance = appearance,
                    onSelectGroup = onSelectGroup,
                )

                ManagerSearchBar(
                    keyword = keyword,
                    appearance = appearance,
                    onKeywordChange = onKeywordChange,
                )
                if (visible.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                        MobileEmptyState(if (keyword.isBlank()) "这个分组里还没有角色" else "没有匹配的角色", appearance)
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(start = 0.dp, end = 0.dp, bottom = 22.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(visible, key = { it.id }) { character ->
                            CharacterManagerCard(
                                user = user,
                                character = character,
                                selected = selectedIds.contains(character.id),
                                selectable = batchAction != null,
                                appearance = appearance,
                            ) {
                                if (batchAction != null) {
                                    toggleCharacterSelection(character.id)
                                } else {
                                    onOpenCharacter(character.id)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (groupManagerOpen) {
        CharacterGroupManagerPage(
            groups = groups,
            characters = characters,
            appearance = appearance,
            onDismiss = { groupManagerOpen = false },
            onSaveCharacters = {
                onSaveCharacters(it)
                if (selectedGroup != ALL_CHARACTERS && selectedGroup !in buildCharacterGroups(it)) {
                    onSelectGroup(ALL_CHARACTERS)
                }
            },
        )
    }

    pendingDeleteCharacters?.let { ids ->
        ConfirmDialog(
            title = "删除角色？",
            message = "将删除 ${ids.size} 个角色和对应聊天记录。",
            appearance = appearance,
            onDismiss = ::clearPendingDelete,
            onConfirm = {
                onDeleteCharacters(ids)
                confirmDeleteHandled()
            },
        )
    }
    }
}

// The four actions used to be a row of equal-width buttons under the title, which crushed "导入(实验)"
// to "导入(实" and gave "管理分组" the same weight as "删除全部角色". Import, export and group
// management are occasional, so they live behind the overflow; delete is a mode rather than an
// action, so it enters selection and the destructive button only exists once something is selected.
