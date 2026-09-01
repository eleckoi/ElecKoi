package com.eleckoi.android.feature.studio.ui.assistant.workspace.drawer

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.workspace.model.CreatorWorkspace
import com.eleckoi.android.foundation.design.AppearanceTheme

/** Stateful entry point for workspace navigation; rendering and modal details live beside it. */
@Composable
internal fun CreationWorkspaceDrawer(
    workspaces: List<CreatorWorkspace>,
    pinnedWorkspaceIds: List<String>,
    workspaceExpansionOverrides: Map<String, Boolean>,
    activeWorkspaceId: String?,
    activeConversationId: String?,
    appearance: AppearanceTheme,
    onOpenConversation: (String, String) -> Unit,
    onCreateWorkspace: (String) -> Unit,
    onCreateConversation: (String) -> Unit,
    onRenameWorkspace: (String, String) -> Unit,
    onRenameConversation: (String, String, String) -> Unit,
    onDeleteWorkspace: (String) -> Unit,
    onDeleteConversation: (String, String) -> Unit,
    onTogglePinnedWorkspace: (String) -> Unit,
    onToggleWorkspaceExpanded: (String) -> Unit,
    onUnavailable: (String) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var showAllProjectIds by rememberSaveable { mutableStateOf(emptyList<String>()) }
    var showCreateMenu by remember { mutableStateOf(false) }
    var projectMenuId by remember { mutableStateOf<String?>(null) }
    var conversationMenuId by remember { mutableStateOf<String?>(null) }
    var createDialogVisible by rememberSaveable { mutableStateOf(false) }
    var renameProjectId by rememberSaveable { mutableStateOf<String?>(null) }
    var renameConversationTarget by rememberSaveable { mutableStateOf<String?>(null) }
    var deleteProjectId by rememberSaveable { mutableStateOf<String?>(null) }
    var deleteConversationTarget by rememberSaveable { mutableStateOf<String?>(null) }

    val normalizedQuery = query.trim()
    val sections = remember(workspaces, pinnedWorkspaceIds, normalizedQuery) {
        creatorWorkspaceDrawerSections(
            workspaces = workspaces,
            pinnedWorkspaceIds = pinnedWorkspaceIds,
            query = normalizedQuery,
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(start = 18.dp, end = 12.dp, top = 18.dp, bottom = 10.dp),
    ) {
        DrawerSearchField(
            query = query,
            appearance = appearance,
            onQueryChange = { query = it },
        )

        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(top = 17.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            if (sections.pinned.isNotEmpty()) {
                item(key = "pinned-title") {
                    DrawerSectionTitle("置顶", appearance, Modifier.padding(top = 18.dp))
                }
                drawerWorkspaceGroups(
                    workspaces = sections.pinned,
                    keyPrefix = "pinned",
                    pinned = true,
                    query = normalizedQuery,
                    showAllProjectIds = showAllProjectIds,
                    workspaceExpansionOverrides = workspaceExpansionOverrides,
                    activeWorkspaceId = activeWorkspaceId,
                    activeConversationId = activeConversationId,
                    projectMenuId = projectMenuId,
                    conversationMenuId = conversationMenuId,
                    appearance = appearance,
                    onToggleShowAll = {
                        showAllProjectIds = showAllProjectIds.toggleDrawerEntry(it)
                    },
                    onProjectMenuChanged = { projectMenuId = it },
                    onConversationMenuChanged = { conversationMenuId = it },
                    onToggleWorkspaceExpanded = onToggleWorkspaceExpanded,
                    onCreateConversation = onCreateConversation,
                    onTogglePinnedWorkspace = onTogglePinnedWorkspace,
                    onRenameProject = { renameProjectId = it },
                    onDeleteProject = { deleteProjectId = it },
                    onOpenConversation = onOpenConversation,
                    onRenameConversation = { workspaceId, conversationId ->
                        renameConversationTarget = "$workspaceId:$conversationId"
                    },
                    onDeleteConversation = { workspaceId, conversationId ->
                        deleteConversationTarget = "$workspaceId:$conversationId"
                    },
                )
            }

            item(key = "projects-title") {
                DrawerProjectsHeader(
                    menuExpanded = showCreateMenu,
                    appearance = appearance,
                    onMenuExpandedChange = { showCreateMenu = it },
                    onCreateWorkspace = { createDialogVisible = true },
                    onUnavailable = onUnavailable,
                )
            }
            if (sections.projects.isEmpty() && sections.pinned.isEmpty()) {
                item(key = "empty-projects") {
                    Text(
                        if (normalizedQuery.isBlank()) "点击 + 新建项目" else "没有匹配结果",
                        modifier = Modifier.padding(horizontal = 11.dp, vertical = 8.dp),
                        color = appearance.mobileMuted,
                        fontSize = 12.sp,
                    )
                }
            }
            drawerWorkspaceGroups(
                workspaces = sections.projects,
                keyPrefix = "project",
                pinned = false,
                query = normalizedQuery,
                showAllProjectIds = showAllProjectIds,
                workspaceExpansionOverrides = workspaceExpansionOverrides,
                activeWorkspaceId = activeWorkspaceId,
                activeConversationId = activeConversationId,
                projectMenuId = projectMenuId,
                conversationMenuId = conversationMenuId,
                appearance = appearance,
                onToggleShowAll = {
                    showAllProjectIds = showAllProjectIds.toggleDrawerEntry(it)
                },
                onProjectMenuChanged = { projectMenuId = it },
                onConversationMenuChanged = { conversationMenuId = it },
                onToggleWorkspaceExpanded = onToggleWorkspaceExpanded,
                onCreateConversation = onCreateConversation,
                onTogglePinnedWorkspace = onTogglePinnedWorkspace,
                onRenameProject = { renameProjectId = it },
                onDeleteProject = { deleteProjectId = it },
                onOpenConversation = onOpenConversation,
                onRenameConversation = { workspaceId, conversationId ->
                    renameConversationTarget = "$workspaceId:$conversationId"
                },
                onDeleteConversation = { workspaceId, conversationId ->
                    deleteConversationTarget = "$workspaceId:$conversationId"
                },
            )
        }
    }

    CreationWorkspaceDrawerDialogs(
        workspaces = workspaces,
        createDialogVisible = createDialogVisible,
        renameProjectId = renameProjectId,
        renameConversationTarget = renameConversationTarget,
        deleteProjectId = deleteProjectId,
        deleteConversationTarget = deleteConversationTarget,
        appearance = appearance,
        onCreateDialogDismissed = { createDialogVisible = false },
        onRenameProjectDismissed = { renameProjectId = null },
        onRenameConversationDismissed = { renameConversationTarget = null },
        onDeleteProjectDismissed = { deleteProjectId = null },
        onDeleteConversationDismissed = { deleteConversationTarget = null },
        onCreateWorkspace = onCreateWorkspace,
        onRenameWorkspace = onRenameWorkspace,
        onRenameConversation = onRenameConversation,
        onDeleteWorkspace = onDeleteWorkspace,
        onDeleteConversation = onDeleteConversation,
    )
}

private fun LazyListScope.drawerWorkspaceGroups(
    workspaces: List<CreatorWorkspace>,
    keyPrefix: String,
    pinned: Boolean,
    query: String,
    showAllProjectIds: List<String>,
    workspaceExpansionOverrides: Map<String, Boolean>,
    activeWorkspaceId: String?,
    activeConversationId: String?,
    projectMenuId: String?,
    conversationMenuId: String?,
    appearance: AppearanceTheme,
    onToggleShowAll: (String) -> Unit,
    onProjectMenuChanged: (String?) -> Unit,
    onConversationMenuChanged: (String?) -> Unit,
    onToggleWorkspaceExpanded: (String) -> Unit,
    onCreateConversation: (String) -> Unit,
    onTogglePinnedWorkspace: (String) -> Unit,
    onRenameProject: (String) -> Unit,
    onDeleteProject: (String) -> Unit,
    onOpenConversation: (String, String) -> Unit,
    onRenameConversation: (String, String) -> Unit,
    onDeleteConversation: (String, String) -> Unit,
) {
    workspaces.forEach { workspace ->
        item(key = "$keyPrefix-${workspace.id}") {
            DrawerProjectGroup(
                workspace = workspace,
                query = query,
                pinned = pinned,
                expanded = query.isNotBlank() || isCreatorWorkspaceExpanded(
                    workspaceId = workspace.id,
                    activeWorkspaceId = activeWorkspaceId,
                    overrides = workspaceExpansionOverrides,
                ),
                showAll = workspace.id in showAllProjectIds,
                activeConversationId = activeConversationId,
                projectMenuExpanded = projectMenuId == workspace.id,
                conversationMenuId = conversationMenuId,
                appearance = appearance,
                onToggleExpanded = { onToggleWorkspaceExpanded(workspace.id) },
                onToggleShowAll = { onToggleShowAll(workspace.id) },
                onCreateConversation = { onCreateConversation(workspace.id) },
                onOpenProjectMenu = { onProjectMenuChanged(workspace.id) },
                onDismissProjectMenu = { onProjectMenuChanged(null) },
                onTogglePin = {
                    onProjectMenuChanged(null)
                    onTogglePinnedWorkspace(workspace.id)
                },
                onRenameProject = {
                    onProjectMenuChanged(null)
                    onRenameProject(workspace.id)
                },
                onDeleteProject = {
                    onProjectMenuChanged(null)
                    onDeleteProject(workspace.id)
                },
                onOpenConversation = { conversation ->
                    onOpenConversation(workspace.id, conversation.id)
                },
                onOpenConversationMenu = onConversationMenuChanged,
                onDismissConversationMenu = { onConversationMenuChanged(null) },
                onRenameConversation = { conversation ->
                    onConversationMenuChanged(null)
                    onRenameConversation(workspace.id, conversation.id)
                },
                onDeleteConversation = { conversation ->
                    onConversationMenuChanged(null)
                    onDeleteConversation(workspace.id, conversation.id)
                },
            )
        }
    }
}

@Composable
private fun DrawerProjectsHeader(
    menuExpanded: Boolean,
    appearance: AppearanceTheme,
    onMenuExpandedChange: (Boolean) -> Unit,
    onCreateWorkspace: () -> Unit,
    onUnavailable: (String) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 22.dp, bottom = 10.dp, start = 10.dp, end = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "项目",
            modifier = Modifier.weight(1f),
            color = appearance.mobileMuted,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )
        Box {
            IconButton(onClick = { onMenuExpandedChange(true) }, modifier = Modifier.size(40.dp)) {
                Icon(
                    Icons.Rounded.Add,
                    contentDescription = "新建或导入项目",
                    modifier = Modifier.size(25.dp),
                    tint = appearance.mobileMuted,
                )
            }
            DropdownMenu(
                expanded = menuExpanded,
                onDismissRequest = { onMenuExpandedChange(false) },
                shape = RoundedCornerShape(14.dp),
                containerColor = appearance.mobileSurface,
                tonalElevation = 0.dp,
                shadowElevation = 8.dp,
                border = BorderStroke(1.dp, appearance.mobileLine),
            ) {
                DropdownMenuItem(
                    text = { Text("新建空白项目") },
                    leadingIcon = { Icon(Icons.Rounded.Add, contentDescription = null) },
                    onClick = {
                        onMenuExpandedChange(false)
                        onCreateWorkspace()
                    },
                )
                DropdownMenuItem(
                    text = { Text("使用现有文件夹") },
                    leadingIcon = { Icon(Icons.Outlined.FolderOpen, contentDescription = null) },
                    onClick = {
                        onMenuExpandedChange(false)
                        onUnavailable("现有文件夹导入将在下一阶段接入")
                    },
                )
            }
        }
    }
}
