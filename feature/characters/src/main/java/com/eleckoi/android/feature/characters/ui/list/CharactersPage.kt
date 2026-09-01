package com.eleckoi.android.feature.characters.ui.list

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.feature.characters.model.CharactersPayload
import com.eleckoi.android.feature.characters.model.UserProfile
import com.eleckoi.android.foundation.design.components.AvatarCircle
import com.eleckoi.android.foundation.design.components.CharacterActionButtons
import com.eleckoi.android.foundation.design.components.CharacterDirectoryBoundary
import com.eleckoi.android.foundation.design.components.MobileHeaderMenuAction
import com.eleckoi.android.foundation.design.components.MobileEmptyState
import com.eleckoi.android.foundation.design.components.MobileProfileHeader
import com.eleckoi.android.foundation.design.components.MobileRootSurface
import com.eleckoi.android.foundation.design.components.mobileRootBackdropSample
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.RootSearchPage
import com.eleckoi.android.foundation.design.components.SegmentTabs

private class CharactersRootEditorState {
    var searchQuery by mutableStateOf("")
    var managerQuery by mutableStateOf("")
    var selectedTab by mutableStateOf("characters")
    var selectedGroup by mutableStateOf(ALL_CHARACTERS)
    var createCharacterGroupPickerOpen by mutableStateOf(false)
    var selectedCreateCharacterGroup by mutableStateOf(DEFAULT_GROUP)
    var createGroupNameDialogOpen by mutableStateOf(false)
    var createGroupName by mutableStateOf("")

    fun syncGroups(groups: List<String>) {
        if (selectedGroup != ALL_CHARACTERS && selectedGroup !in groups) {
            selectedGroup = ALL_CHARACTERS
        }
    }

    fun selectCharactersTab() {
        selectedTab = "characters"
    }

    fun selectGroupsTab() {
        selectedTab = "groups"
    }

    fun prepareCreateCharacter(groups: List<String>): String? {
        return if (groups.isEmpty()) {
            DEFAULT_GROUP
        } else {
            selectedCreateCharacterGroup = groups.firstOrNull().orEmpty()
            createCharacterGroupPickerOpen = true
            null
        }
    }

    fun prepareCreateGroup(groups: List<String>) {
        createGroupName = nextGroupName(groups)
        createGroupNameDialogOpen = true
    }

    fun selectGroupForCreatedCharacter(group: String) {
        managerQuery = ""
        selectCharactersTab()
        selectedGroup = group.ifBlank { ALL_CHARACTERS }
    }

    fun selectCreatedGroup(group: String) {
        selectedGroup = group
        selectCharactersTab()
    }

    private fun nextGroupName(groups: List<String>): String {
        val names = groups.toSet()
        if ("新分组" !in names) return "新分组"
        var index = 2
        while ("新分组$index" in names) index += 1
        return "新分组$index"
    }
}

@Composable
private fun rememberCharactersRootEditorState(): CharactersRootEditorState {
    return remember { CharactersRootEditorState() }
}

@Composable
fun CharactersRootPage(
    user: UserProfile,
    characters: CharactersPayload?,
    appearance: AppearanceTheme,
    searchOpen: Boolean,
    onSearchOpenChange: (Boolean) -> Unit,
    // Hoisted because the manager is a full-screen sheet and this page is only the tab's content
    // area — the tab bar is a sibling above it in the layout, so a sheet rendered from here can
    // never cover it. The owner drops the tab bar while the manager is open.
    managerOpen: Boolean,
    onManagerOpenChange: (Boolean) -> Unit,
    isAssistantRunning: Boolean,
    onOpenAiCreationAssistant: () -> Unit,
    onAdd: (String) -> Unit,
    onCreateGroup: (String) -> Unit,
    onToggleAllCharactersExpanded: () -> Unit,
    onToggleCharacterGroupExpanded: (String) -> Unit,
    onOpenProfile: () -> Unit,
    onOpenCharacter: (String) -> Unit,
    onSaveCharacters: (CharactersPayload) -> Unit,
    onImportCharacterCard: () -> Unit,
    onExportCharacters: (List<String>) -> Unit,
    onDeleteCharacters: (List<String>) -> Unit,
) {
    val items = characters?.items.orEmpty()
    val groups = buildCharacterGroups(characters)
    val editorState = rememberCharactersRootEditorState()

    with(editorState) {
    LaunchedEffect(searchOpen) {
        if (!searchOpen) searchQuery = ""
    }
    LaunchedEffect(groups.joinToString("\u0000")) {
        syncGroups(groups)
    }

    fun createInGroup(group: String) {
        selectGroupForCreatedCharacter(group)
        onAdd(group)
    }

    fun requestCreateCharacter() {
        prepareCreateCharacter(groups)?.let(::createInGroup)
    }

    fun createGroup(name: String) {
        val normalizedName = name.trim().take(40)
        if (normalizedName.isBlank() || normalizedName in groups) return
        onCreateGroup(normalizedName)
    }

    fun requestCreateGroup() {
        prepareCreateGroup(groups)
    }

    if (searchOpen) {
        val query = searchQuery.trim()
        val searchResults = if (query.isBlank()) {
            emptyList()
        } else {
            sortedAllCharacters(filterCharacters(items, query))
        }
        RootSearchPage(
            query = searchQuery,
            placeholder = "搜索角色或分组",
            accentColor = appearance.mobileBlue,
            onQueryChange = { searchQuery = it },
            onBack = {
                searchQuery = ""
                onSearchOpenChange(false)
            },
        ) { searchAppearance ->
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 8.dp),
            ) {
                if (query.isNotBlank() && searchResults.isEmpty()) {
                    item { MobileEmptyState("没有搜索结果", searchAppearance) }
                }
                items(searchResults, key = { "search-${it.id}" }) { character ->
                    CharacterListRow(
                        character = character,
                        appearance = searchAppearance,
                        onClick = {
                            searchQuery = ""
                            onSearchOpenChange(false)
                            onOpenCharacter(character.id)
                        },
                    )
                }
            }
        }
        return@with
    }

    MobileRootSurface(
        appearance = appearance,
        header = {
            MobileProfileHeader(
                userName = user.userName,
                userAvatarPath = user.userAvatar,
                title = "角色",
                subtitle = "${items.size} 个角色 · ${groups.size} 个分组",
                appearance = appearance,
                onSearch = { onSearchOpenChange(true) },
                onAdd = ::requestCreateCharacter,
                onOpenProfile = onOpenProfile,
                addMenuActions = listOf(
                    MobileHeaderMenuAction("新建角色", AppIconPaths.CharacterPlus, onClick = ::requestCreateCharacter),
                    MobileHeaderMenuAction("导入角色卡", AppIconPaths.Import, onClick = onImportCharacterCard),
                    MobileHeaderMenuAction(
                        "新建分组",
                        AppIconPaths.FolderPlus,
                        dividerBefore = true,
                        onClick = ::requestCreateGroup,
                    ),
                ),
            )
        },
    ) {
        CharacterActionButtons(
            appearance = appearance,
            isAssistantRunning = isAssistantRunning,
            onOpenManager = { onManagerOpenChange(true) },
            onOpenAssistant = onOpenAiCreationAssistant,
            modifier = Modifier.padding(top = 0.dp),
        )
        CharacterDirectoryBoundary(appearance)
        SegmentTabs(
            left = "角色",
            right = "群聊",
            activeLeft = selectedTab == "characters",
            appearance = appearance,
            onLeft = ::selectCharactersTab,
            onRight = ::selectGroupsTab,
        )

        if (selectedTab == "groups") {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                item { MobileEmptyState("暂无群聊", appearance) }
            }
        } else {
            CharacterGroupedList(
                characters = items,
                groups = groups,
                payload = characters,
                keyword = "",
                listAllExpanded = characters?.listAllExpanded ?: true,
                expandedGroupNames = characters?.expandedGroupNames?.toSet() ?: groups.toSet(),
                appearance = appearance,
                onToggleGroup = { group, nextExpandedGroupNames ->
                    selectedGroup = group
                    if (group == ALL_CHARACTERS) {
                        onToggleAllCharactersExpanded()
                    } else {
                        onToggleCharacterGroupExpanded(group)
                    }
                },
                onOpenCharacter = onOpenCharacter,
                onSaveCharacters = onSaveCharacters,
            )
        }
    }

    if (managerOpen) {
        CharacterManagerSheet(
            user = user,
            characters = characters ?: CharactersPayload("", groups, emptyList()),
            groups = groups,
            selectedGroup = selectedGroup,
            keyword = managerQuery,
            appearance = appearance,
            onKeywordChange = { managerQuery = it },
            onSelectGroup = { selectedGroup = it },
            onClose = { onManagerOpenChange(false) },
            onOpenCharacter = {
                onManagerOpenChange(false)
                onOpenCharacter(it)
            },
            onSaveCharacters = onSaveCharacters,
            onImportCharacterCard = onImportCharacterCard,
            onExportCharacters = onExportCharacters,
            onDeleteCharacters = onDeleteCharacters,
        )
    }

    if (createCharacterGroupPickerOpen) {
        CharacterGroupPickerDialog(
            groups = groups,
            selectedGroup = selectedCreateCharacterGroup,
            appearance = appearance,
            onSelectGroup = { selectedCreateCharacterGroup = it },
            onDismiss = { createCharacterGroupPickerOpen = false },
            onConfirm = {
                createCharacterGroupPickerOpen = false
                createInGroup(selectedCreateCharacterGroup)
            },
        )
    }

    if (createGroupNameDialogOpen) {
        CharacterGroupNameDialog(
            value = createGroupName,
            existingGroups = groups,
            appearance = appearance,
            onValueChange = { createGroupName = it },
            onDismiss = { createGroupNameDialogOpen = false },
            onConfirm = {
                createGroupNameDialogOpen = false
                createGroup(createGroupName)
            },
        )
    }
    }
}


