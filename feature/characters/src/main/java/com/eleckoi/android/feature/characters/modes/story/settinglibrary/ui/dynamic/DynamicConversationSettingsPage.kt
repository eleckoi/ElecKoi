package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AvatarCircle
import com.eleckoi.android.foundation.design.components.BubbleActionMenu
import com.eleckoi.android.foundation.design.components.MobileHeaderMenuAction
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.SvgCircle
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryConversation
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryTriggerMode
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isFixedEntry
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorHeader
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryHeaderSearchAction
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StorySearchHeader
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.ConfirmDialog
import java.util.UUID
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.*

@Composable
internal fun DynamicConversationSettingsPage(
    conversation: SettingLibraryConversation,
    saving: Boolean,
    deleting: Boolean,
    storedExpandedGroupIds: Set<String>?,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onOpenEntry: (SettingLibraryEntry) -> Unit,
    onSaveAsVersion: () -> Unit,
    onCreateEntry: (groupId: String) -> Unit,
    onReplaceLibrary: (library: SettingLibrary, successMessage: String) -> Unit,
    onDeleteGroup: (groupId: String) -> Unit,
    onDeleteEntry: (entryId: String) -> Unit,
    onExpandedGroupIdsChange: (Set<String>) -> Unit,
    onDeleteConversationSettings: () -> Unit,
) {
    val listState = rememberLazyListState()
    val horizontalScroll = rememberScrollState()
    var search by remember(conversation.sessionId) { mutableStateOf("") }
    var searchOpen by remember(conversation.sessionId) { mutableStateOf(false) }
    BackHandler(enabled = searchOpen) {
        searchOpen = false
        search = ""
    }
    val allGroupIds = remember(conversation.library.groups) {
        conversation.library.groups.mapTo(linkedSetOf()) { it.id }
    }
    // Dynamic settings are scoped to one conversation. They must not inherit the author's
    // library-tree expansion preference; on a fresh visit, begin compact and let this
    // conversation's own transient expansion state take over after the first tap.
    val defaultExpandedGroupIds = emptySet<String>()
    val expandedGroupIds = (storedExpandedGroupIds ?: defaultExpandedGroupIds).intersect(allGroupIds)
    var selectedNodeId by remember(conversation.sessionId) { mutableStateOf(RootNodeId) }
    var pendingDelete by remember(conversation.sessionId) { mutableStateOf<DynamicTreeDeleteTarget?>(null) }
    var treeClipboard by remember(conversation.sessionId) { mutableStateOf<DynamicTreeClipboard?>(null) }
    var createMenuOpen by remember(conversation.sessionId) { mutableStateOf(false) }
    var createGroupDialogOpen by remember(conversation.sessionId) { mutableStateOf(false) }
    var createGroupName by remember(conversation.sessionId) { mutableStateOf("") }
    var renameDialogOpen by remember(conversation.sessionId) { mutableStateOf(false) }
    var renameName by remember(conversation.sessionId) { mutableStateOf("") }
    var menuOpen by remember(conversation.sessionId) { mutableStateOf(false) }
    var confirmDeleteAll by remember(conversation.sessionId) { mutableStateOf(false) }
    val nodes = remember(conversation.library, search, expandedGroupIds) {
        settingTreeNodes(
            groups = conversation.library.groups,
            entries = conversation.library.entries,
            expandedGroupIds = if (search.isBlank()) {
                expandedGroupIds
            } else {
                conversation.library.groups.mapTo(mutableSetOf()) { it.id }
            },
            search = search.trim(),
        )
    }
    val selectedNode = nodes.firstOrNull { it.id == selectedNodeId }
    val canDeleteSelected = when (selectedNode) {
        is SettingTreeNode.Folder -> true
        is SettingTreeNode.File -> !selectedNode.entry.isFixedEntry() &&
            selectedNode.entry.triggerMode == SettingLibraryTriggerMode.AgentTool
        null -> false
    }
    val selectedTargetGroupId = when (selectedNode) {
        is SettingTreeNode.Folder -> selectedNode.group.id
        is SettingTreeNode.File -> selectedNode.entry.groupId
        null -> ""
    }

    LaunchedEffect(nodes.map(SettingTreeNode::id), selectedNodeId) {
        if (selectedNodeId != RootNodeId && nodes.none { it.id == selectedNodeId }) {
            selectedNodeId = RootNodeId
        }
    }

    PinnedStatusScaffold(appearance = appearance, imeAware = false, backgroundColor = appearance.mobileBg) {
        if (searchOpen) {
            StorySearchHeader(
                query = search,
                placeholder = "搜索设定条目",
                appearance = appearance,
                onQueryChange = { search = it },
                onClose = {
                    searchOpen = false
                    search = ""
                },
            )
        } else {
            StoryEditorHeader(
                title = "动态设定",
                appearance = appearance,
                onBack = onBack,
                actionWidth = 96.dp,
                action = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StoryHeaderSearchAction(
                            appearance = appearance,
                            onClick = { searchOpen = true },
                        )
                        Box(contentAlignment = Alignment.Center) {
                            DynamicOverflowMenuButton(
                                enabled = !saving && !deleting,
                                onClick = { menuOpen = true },
                            )
                            BubbleActionMenu(
                                expanded = menuOpen,
                                actions = listOf(
                                    MobileHeaderMenuAction(
                                        label = "保存为设定版本",
                                        icon = AppIconPaths.Copy,
                                        onClick = onSaveAsVersion,
                                    ),
                                    MobileHeaderMenuAction(
                                        label = "删除动态设定",
                                        icon = AppIconPaths.Trash,
                                        tint = ElecKoiDanger,
                                        dividerBefore = true,
                                        onClick = { confirmDeleteAll = true },
                                    ),
                                ),
                                appearance = appearance,
                                onDismiss = { menuOpen = false },
                            )
                        }
                    }
                },
            )
        }

        Box(modifier = Modifier.weight(1f).background(appearance.mobileBg)) {
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize().background(appearance.mobileBg),
                contentPadding = PaddingValues(top = 2.dp, bottom = if (searchOpen) 18.dp else 112.dp),
            ) {
                if (!searchOpen) {
                    item(key = "conversation") {
                        DynamicConversationContextRow(conversation, appearance)
                    }
                }
                if (nodes.isEmpty()) {
                    item(key = "empty") {
                        DynamicConversationListMessage(
                            if (search.isBlank()) "这段对话还没有设定条目" else "没有找到相关设定",
                            appearance,
                        )
                    }
                } else {
                    items(nodes, key = SettingTreeNode::id) { node ->
                        val expanded = node is SettingTreeNode.Folder &&
                            (search.isNotBlank() || node.group.id in expandedGroupIds)
                        SettingTreeNodeRow(
                            node = node,
                            selected = selectedNodeId == node.id,
                            dropTarget = false,
                            dragging = false,
                            expanded = expanded,
                            horizontalScrollState = horizontalScroll,
                            appearance = appearance,
                            readOnly = true,
                            onSelect = {
                                selectedNodeId = if (selectedNodeId == node.id) RootNodeId else node.id
                            },
                            onOpen = {
                                when (node) {
                                    is SettingTreeNode.File -> onOpenEntry(node.entry)
                                    is SettingTreeNode.Folder -> onExpandedGroupIdsChange(
                                        if (node.group.id in expandedGroupIds) {
                                            expandedGroupIds - node.group.id
                                        } else {
                                            expandedGroupIds + node.group.id
                                        },
                                    )
                                }
                            },
                            onFileEnabledChange = { _, _ -> },
                            onToggle = {
                                if (node is SettingTreeNode.Folder) {
                                    onExpandedGroupIdsChange(
                                        if (node.group.id in expandedGroupIds) {
                                            expandedGroupIds - node.group.id
                                        } else {
                                            expandedGroupIds + node.group.id
                                        },
                                    )
                                }
                            },
                        )
                    }
                }
            }
            if (!searchOpen) SettingTreeBottomPanel(
                hasSelection = canDeleteSelected,
                canEdit = selectedNode is SettingTreeNode.File,
                canCopy = canDeleteSelected && !deleting,
                canDelete = canDeleteSelected && !deleting,
                hasClipboard = treeClipboard != null,
                createMenuOpen = createMenuOpen,
                appearance = appearance,
                modifier = Modifier.align(Alignment.BottomCenter),
                onCreate = { createMenuOpen = !createMenuOpen },
                onDismissCreateMenu = { createMenuOpen = false },
                onCreateFolder = {
                    createMenuOpen = false
                    createGroupName = dynamicNextGroupName(conversation.library, selectedTargetGroupId)
                    createGroupDialogOpen = true
                },
                onCreateStatic = {
                    createMenuOpen = false
                    onCreateEntry(selectedTargetGroupId)
                },
                onEdit = {
                    (selectedNode as? SettingTreeNode.File)?.let { onOpenEntry(it.entry) }
                },
                onCopyOrPaste = {
                    val clipboard = treeClipboard
                    if (clipboard == null) {
                        if (canDeleteSelected) {
                            treeClipboard = DynamicTreeClipboard(selectedNodeId, DynamicTreeClipboardMode.Copy)
                        }
                    } else {
                        dynamicPasteTreeNode(
                            library = conversation.library,
                            clipboard = clipboard,
                            targetGroupId = selectedTargetGroupId,
                        )?.let { next -> onReplaceLibrary(next, "已粘贴") }
                        treeClipboard = null
                    }
                },
                onCutOrCancel = {
                    if (treeClipboard != null) {
                        treeClipboard = null
                    } else if (canDeleteSelected) {
                        treeClipboard = DynamicTreeClipboard(selectedNodeId, DynamicTreeClipboardMode.Cut)
                    }
                },
                onRename = {
                    if (canDeleteSelected) {
                        renameName = selectedNode?.title.orEmpty()
                        renameDialogOpen = true
                    }
                },
                onDelete = {
                    when (val node = selectedNode) {
                        is SettingTreeNode.Folder -> pendingDelete = DynamicTreeDeleteTarget(
                            id = node.group.id,
                            title = node.title,
                            folder = true,
                            childCount = node.count,
                        )
                        is SettingTreeNode.File -> pendingDelete = DynamicTreeDeleteTarget(
                            id = node.entry.id,
                            title = node.title,
                            folder = false,
                        )
                        null -> Unit
                    }
                },
            )
        }
    }
    if (createGroupDialogOpen) {
        SettingLibraryGroupNameDialog(
            value = createGroupName,
            groups = conversation.library.groups.filter { it.parentId == selectedTargetGroupId },
            appearance = appearance,
            onValueChange = { createGroupName = it },
            onDismiss = { createGroupDialogOpen = false },
            onConfirm = {
                createGroupDialogOpen = false
                val group = SettingLibraryGroup(
                    id = "session-group-${UUID.randomUUID().toString().replace("-", "").take(12)}",
                    name = createGroupName.trim(),
                    parentId = selectedTargetGroupId,
                    order = conversation.library.groups.size + 1,
                    treeViewOrder = dynamicNextTreeOrder(conversation.library, selectedTargetGroupId),
                )
                onReplaceLibrary(
                    conversation.library.copy(groups = conversation.library.groups + group),
                    "文件夹已创建",
                )
                if (selectedTargetGroupId.isNotBlank()) {
                    onExpandedGroupIdsChange(expandedGroupIds + selectedTargetGroupId)
                }
            },
        )
    }
    if (renameDialogOpen) {
        SettingLibraryRenameNodeDialog(
            value = renameName,
            appearance = appearance,
            onValueChange = { renameName = it },
            onDismiss = { renameDialogOpen = false },
            onConfirm = {
                renameDialogOpen = false
                val normalized = renameName.trim()
                val next = when (val node = selectedNode) {
                    is SettingTreeNode.Folder -> conversation.library.copy(
                        groups = conversation.library.groups.map { group ->
                            if (group.id == node.group.id) group.copy(name = normalized) else group
                        },
                    )
                    is SettingTreeNode.File -> conversation.library.copy(
                        entries = conversation.library.entries.map { entry ->
                            if (entry.id == node.entry.id) entry.copy(title = normalized) else entry
                        },
                    )
                    null -> conversation.library
                }
                onReplaceLibrary(next, "已重命名")
            },
        )
    }
    pendingDelete?.let { target ->
        ConfirmDialog(
            title = if (target.folder) "删除文件夹“${target.title}”？" else "删除设定“${target.title}”？",
            message = if (target.folder) {
                "将从当前对话中移除这个文件夹及其中 ${target.childCount} 条设定，母设定不会被修改。"
            } else {
                "这条设定将从当前对话中移除，母设定不会被删除。"
            },
            confirmText = if (target.folder) "删除文件夹" else "删除设定",
            destructive = true,
            appearance = appearance,
            onDismiss = { pendingDelete = null },
            onConfirm = {
                pendingDelete = null
                selectedNodeId = RootNodeId
                if (target.folder) onDeleteGroup(target.id) else onDeleteEntry(target.id)
            },
        )
    }
    if (confirmDeleteAll) {
        ConfirmDialog(
            title = "删除这段对话的动态设定？",
            message = "将清空这段对话里由 AI 和你产生的全部设定改动，并回归母设定。母设定不会被修改。",
            confirmText = "删除动态设定",
            destructive = true,
            appearance = appearance,
            onDismiss = { confirmDeleteAll = false },
            onConfirm = {
                confirmDeleteAll = false
                onDeleteConversationSettings()
            },
        )
    }
}

@Composable
private fun DynamicConversationContextRow(
    conversation: SettingLibraryConversation,
    appearance: AppearanceTheme,
) {
    Row(
        modifier = Modifier.fillMaxWidth().height(62.dp).padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarCircle(
            name = conversation.characterName.ifBlank { conversation.title },
            size = 38,
            fontSize = 14,
            appearance = appearance,
            avatarPath = conversation.characterAvatar,
        )
        Column(modifier = Modifier.weight(1f).padding(start = 11.dp, end = 10.dp)) {
            Text(
                text = conversation.characterName.ifBlank { conversation.title.ifBlank { "未命名角色" } },
                color = appearance.mobileText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = conversation.summary.trim().ifBlank { "新对话" },
                modifier = Modifier.padding(top = 3.dp),
                color = appearance.mobileMuted,
                fontSize = 11.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = dynamicConversationListTime(conversation.updatedAt),
            color = appearance.mobileMuted,
            fontSize = 11.sp,
        )
    }
}

@Composable
internal fun DynamicOverflowMenuButton(
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .semantics { contentDescription = "更多操作" }
            .noRippleClickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .shadow(4.dp, CircleShape, clip = false)
                .background(Color.White.copy(alpha = if (enabled) 0.96f else 0.68f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            StrokeSvgIcon(
                paths = emptyList(),
                color = Color(0xFF52657A).copy(alpha = if (enabled) 1f else 0.5f),
                iconSize = 17.dp,
                circles = DynamicMoreDotCircles,
            )
        }
    }
}

private val DynamicMoreDotCircles = listOf(
    SvgCircle(12f, 5.4f, 1.75f, fill = true),
    SvgCircle(12f, 12f, 1.75f, fill = true),
    SvgCircle(12f, 18.6f, 1.75f, fill = true),
)
