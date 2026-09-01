package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isFixedEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isPinnedEntry

private enum class SettingTreeClipboardMode {
    Copy,
    Cut,
}

private data class SettingTreeClipboard(
    val nodeId: String,
    val mode: SettingTreeClipboardMode,
)

internal class SettingLibraryTreeClipboardController(
    private val state: SettingLibraryEditorState,
) {
    private var clipboard by mutableStateOf<SettingTreeClipboard?>(null)

    fun hasClipboard(): Boolean = clipboard != null

    fun copySelected(): String? {
        if (!state.canUseTreeClipboardSource()) return null
        clipboard = SettingTreeClipboard(state.selectedTreeNodeId, SettingTreeClipboardMode.Copy)
        return "已复制"
    }

    fun cutSelected(): String? {
        if (!state.canDeleteSelected()) return null
        clipboard = SettingTreeClipboard(state.selectedTreeNodeId, SettingTreeClipboardMode.Cut)
        return "已剪切"
    }

    fun cancel(): String? {
        if (clipboard == null) return null
        clipboard = null
        return "已取消"
    }

    fun paste(): String? {
        val current = clipboard ?: return null
        val targetParentId = selectedFolderIdFromNodeId(state.selectedTreeNodeId, state.entries)
        val pastedNodeId = when (current.mode) {
            SettingTreeClipboardMode.Copy -> copyTreeNodeToFolder(current.nodeId, targetParentId)
            SettingTreeClipboardMode.Cut -> cutTreeNodeToFolder(current.nodeId, targetParentId)
        } ?: return null
        clipboard = null
        state.selectedTreeNodeId = pastedNodeId
        if (targetParentId.isNotBlank()) {
            state.expandedGroupIds = state.expandedGroupIds + targetParentId
        }
        return "已粘贴"
    }

    private fun copyTreeNodeToFolder(nodeId: String, targetParentId: String): String? {
        return when {
            nodeId.startsWith("file:") -> copyEntryToFolder(nodeId.removePrefix("file:"), targetParentId)
            nodeId.startsWith("folder:") -> copyGroupToFolder(nodeId.removePrefix("folder:"), targetParentId)
            else -> null
        }
    }

    private fun cutTreeNodeToFolder(nodeId: String, targetParentId: String): String? {
        return when {
            nodeId.startsWith("file:") -> moveEntryNodeToFolder(nodeId.removePrefix("file:"), targetParentId)
            nodeId.startsWith("folder:") -> moveGroupNodeToFolder(nodeId.removePrefix("folder:"), targetParentId)
            else -> null
        }
    }

    private fun copyEntryToFolder(entryId: String, targetGroupId: String): String? {
        val source = state.entries.firstOrNull { it.id == entryId }
            ?.takeUnless { it.isPinnedEntry() }
            ?: return null
        val nextId = uniqueEntryId()
        val copied = source.copy(
            id = nextId,
            title = copiedTitle(source.title.ifBlank { "未命名设定" }),
            groupId = targetGroupId,
            viewOrder = (state.entries.maxOfOrNull { it.viewOrder } ?: 0) + 1,
            groupViewOrder = (state.entries.filter { it.groupId == targetGroupId }
                .maxOfOrNull { it.groupViewOrder } ?: 0) + 1,
            treeViewOrder = state.nextTreeViewOrder(targetGroupId),
            createdAt = "",
            updatedAt = "",
        )
        state.update(state.entries + copied)
        return fileNodeId(nextId)
    }

    private fun copyGroupToFolder(groupId: String, targetParentId: String): String? {
        val source = state.groups.firstOrNull { it.id == groupId } ?: return null
        if (targetParentId == groupId || targetParentId in descendantGroupIds(groupId, state.groups)) return null
        val descendantIds = descendantGroupIds(groupId, state.groups)
        val copyGroupIds = descendantIds + groupId
        val sourceGroups = state.groups.filter { it.id in copyGroupIds }
        val idMap = mutableMapOf<String, String>()
        sourceGroups.forEachIndexed { index, group ->
            idMap[group.id] = uniqueGroupId(index)
        }
        val rootNewId = idMap[groupId] ?: return null
        val copiedGroups = sourceGroups.map { group ->
            val newId = idMap.getValue(group.id)
            val newParentId = if (group.id == groupId) {
                targetParentId
            } else {
                idMap[group.parentId].orEmpty()
            }
            group.copy(
                id = newId,
                name = if (group.id == groupId) copiedTitle(group.name.ifBlank { "未命名文件夹" }) else group.name,
                parentId = newParentId,
                order = state.groups.size + sourceGroups.indexOf(group) + 1,
                treeViewOrder = if (group.id == groupId) {
                    state.nextTreeViewOrder(targetParentId)
                } else {
                    group.treeViewOrder
                },
                createdAt = "",
                updatedAt = "",
            )
        }
        val sourceEntries = state.entries.filter { entry ->
            entry.groupId in copyGroupIds && !entry.isFixedEntry()
        }
        val entryIdMap = sourceEntries.mapIndexed { index, entry ->
            entry.id to uniqueEntryId(index)
        }.toMap()
        val copiedEntries = sourceEntries.mapIndexed { index, entry ->
            entry.copy(
                id = entryIdMap.getValue(entry.id),
                groupId = idMap[entry.groupId].orEmpty(),
                viewOrder = (state.entries.maxOfOrNull { it.viewOrder } ?: 0) + index + 1,
                createdAt = "",
                updatedAt = "",
            )
        }
        state.updateTree(state.entries + copiedEntries, state.groups + copiedGroups)
        if (targetParentId.isNotBlank()) {
            state.expandedGroupIds = state.expandedGroupIds + targetParentId
        }
        return folderNodeId(rootNewId)
    }

    private fun moveEntryNodeToFolder(entryId: String, targetGroupId: String): String? {
        val source = state.entries.firstOrNull { it.id == entryId }
            ?.takeUnless { it.isPinnedEntry() }
            ?: return null
        val nextOrder = state.nextTreeViewOrder(targetGroupId)
        state.update(state.entries.map { entry ->
            if (entry.id == source.id) {
                entry.copy(
                    groupId = targetGroupId,
                    groupViewOrder = (state.entries.filter { it.groupId == targetGroupId }
                        .maxOfOrNull { it.groupViewOrder } ?: 0) + 1,
                    treeViewOrder = nextOrder,
                )
            } else {
                entry
            }
        })
        return fileNodeId(entryId)
    }

    private fun moveGroupNodeToFolder(groupId: String, targetParentId: String): String? {
        val source = state.groups.firstOrNull { it.id == groupId } ?: return null
        if (targetParentId == source.id || targetParentId in descendantGroupIds(source.id, state.groups)) return null
        val nextOrder = state.nextTreeViewOrder(targetParentId)
        state.updateGroups(state.groups.map { group ->
            if (group.id == source.id) {
                group.copy(parentId = targetParentId, treeViewOrder = nextOrder)
            } else {
                group
            }
        })
        return folderNodeId(groupId)
    }

    private fun copiedTitle(title: String): String = "$title 副本".take(60)

    private fun uniqueEntryId(offset: Int = 0): String {
        val existing = state.entries.map { it.id }.toSet()
        var index = offset
        while (true) {
            val id = "draft-${System.currentTimeMillis()}-$index"
            if (id !in existing) return id
            index += 1
        }
    }

    private fun uniqueGroupId(offset: Int = 0): String {
        val existing = state.groups.map { it.id }.toSet()
        var index = offset
        while (true) {
            val id = "group-${System.currentTimeMillis()}-$index"
            if (id !in existing) return id
            index += 1
        }
    }
}
