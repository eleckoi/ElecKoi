package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isFixedEntry

internal data class SettingTreeMixedMoveResult(
    val entries: List<SettingLibraryEntry>,
    val groups: List<SettingLibraryGroup>,
)

internal enum class SettingTreeDropPlacement {
    Before,
    After,
}

internal fun canMoveSettingNodeInTree(
    entries: List<SettingLibraryEntry>,
    groups: List<SettingLibraryGroup>,
    sourceId: String,
    targetId: String,
    placement: SettingTreeDropPlacement,
): Boolean {
    return settingTreeMovePlan(entries, groups, sourceId, targetId, placement) != null
}

internal fun moveSettingNodeInTree(
    entries: List<SettingLibraryEntry>,
    groups: List<SettingLibraryGroup>,
    sourceId: String,
    targetId: String,
    placement: SettingTreeDropPlacement,
): SettingTreeMixedMoveResult? {
    val plan = settingTreeMovePlan(entries, groups, sourceId, targetId, placement) ?: return null
    val targetSiblings = orderedNodeIdsForParent(
        parentId = plan.parentId,
        entries = entries,
        groups = groups,
    ).filterNot { it == sourceId }
    val insertIndex = when (plan.placement) {
        SettingTreeDropPlacement.Before,
        SettingTreeDropPlacement.After -> {
            val targetIndex = targetSiblings.indexOf(targetId)
            if (targetIndex < 0) return null
            targetIndex + if (plan.placement == SettingTreeDropPlacement.After) 1 else 0
        }
    }.coerceIn(0, targetSiblings.size)
    val targetOrder = targetSiblings.toMutableList().apply {
        add(insertIndex, sourceId)
    }
    return applyTreeOrder(
        entries = entries,
        groups = groups,
        orderedIds = targetOrder,
    )
}

internal fun moveSettingEntryToGroup(
    entries: List<SettingLibraryEntry>,
    groups: List<SettingLibraryGroup>,
    entryId: String,
    targetGroupId: String,
    targetEntryId: String? = null,
    insertAfterTarget: Boolean = false,
): List<SettingLibraryEntry>? {
    if (groups.none { it.id == targetGroupId }) return null
    val movingEntry = entries.firstOrNull { it.id == entryId } ?: return null
    if (movingEntry.isFixedEntry()) return null
    if (targetEntryId == entryId) return null
    val sourceGroupId = movingEntry.groupId
    val targetEntries = groupVisibleEntries(entries, targetGroupId, search = "")
        .filterNot { it.id == entryId }
        .toMutableList()
    val targetIndex = targetEntryId
        ?.let { id -> targetEntries.indexOfFirst { it.id == id } }
        ?.takeIf { it >= 0 }
        ?.let { index -> if (insertAfterTarget) index + 1 else index }
        ?: 0
    targetEntries.add(targetIndex.coerceIn(0, targetEntries.size), movingEntry.copy(groupId = targetGroupId))
    val targetOrders = viewOrderMap(targetEntries)
    val sourceOrders = sourceGroupId
        .takeIf { it.isNotBlank() && it != targetGroupId }
        ?.let { groupId ->
            viewOrderMap(groupVisibleEntries(entries.filterNot { it.id == entryId }, groupId, search = ""))
        }
        .orEmpty()
    return entries.map { entry ->
        when {
            entry.id == entryId -> entry.copy(
                groupId = targetGroupId,
                groupViewOrder = targetOrders[entry.id] ?: 1,
            )
            entry.groupId == targetGroupId -> targetOrders[entry.id]?.let { entry.copy(groupViewOrder = it) } ?: entry
            entry.groupId == sourceGroupId && sourceOrders.containsKey(entry.id) -> entry.copy(groupViewOrder = sourceOrders.getValue(entry.id))
            else -> entry
        }
    }
}

internal fun moveSettingFolderInTree(
    groups: List<SettingLibraryGroup>,
    sourceId: String,
    targetParentId: String,
    targetBeforeGroupId: String? = null,
    insertAfterTarget: Boolean = false,
): List<SettingLibraryGroup>? {
    if (sourceId == targetParentId || targetParentId in descendantGroupIds(sourceId, groups)) return null
    val movedGroups = groups.map { group ->
        if (group.id == sourceId) group.copy(parentId = targetParentId) else group
    }.sortedBy { it.order }.toMutableList()
    val sourceIndex = movedGroups.indexOfFirst { it.id == sourceId }
    if (sourceIndex < 0) return null
    val moved = movedGroups.removeAt(sourceIndex)
    val targetIndex = targetBeforeGroupId
        ?.let { id -> movedGroups.indexOfFirst { it.id == id } }
        ?.takeIf { it >= 0 }
        ?.let { index -> if (insertAfterTarget) index + 1 else index }
        ?: movedGroups.indexOfLast { it.parentId == targetParentId }.let { if (it >= 0) it + 1 else movedGroups.size }
    movedGroups.add(targetIndex.coerceIn(0, movedGroups.size), moved)
    return movedGroups
}

internal fun settingFileInsertAfterLikeCharacterList(
    entries: List<SettingLibraryEntry>,
    source: SettingLibraryEntry,
    target: SettingLibraryEntry,
): Boolean {
    if (source.groupId != target.groupId) return false
    val display = groupVisibleEntries(entries, target.groupId, search = "")
    val sourceIndex = display.indexOfFirst { it.id == source.id }
    val targetIndex = display.indexOfFirst { it.id == target.id }
    return sourceIndex in display.indices && targetIndex in display.indices && sourceIndex < targetIndex
}

internal fun settingFolderInsertAfterLikeCharacterList(
    groups: List<SettingLibraryGroup>,
    source: SettingLibraryGroup,
    target: SettingLibraryGroup,
): Boolean {
    if (source.parentId != target.parentId) return false
    val display = groups.filter { it.parentId == target.parentId }.sortedBy { it.order }
    val sourceIndex = display.indexOfFirst { it.id == source.id }
    val targetIndex = display.indexOfFirst { it.id == target.id }
    return sourceIndex in display.indices && targetIndex in display.indices && sourceIndex < targetIndex
}

private data class SettingTreeMovePlan(
    val parentId: String,
    val placement: SettingTreeDropPlacement,
)

private sealed interface TreeMoveNode {
    val id: String
    val nodeId: String

    data class File(val entry: SettingLibraryEntry) : TreeMoveNode {
        override val id: String = entry.id
        override val nodeId: String = fileNodeId(entry.id)
    }

    data class Folder(val group: SettingLibraryGroup) : TreeMoveNode {
        override val id: String = group.id
        override val nodeId: String = folderNodeId(group.id)
    }
}

private fun settingTreeMovePlan(
    entries: List<SettingLibraryEntry>,
    groups: List<SettingLibraryGroup>,
    sourceId: String,
    targetId: String,
    placement: SettingTreeDropPlacement,
): SettingTreeMovePlan? {
    if (sourceId == targetId) return null
    val source = treeMoveNode(sourceId, entries, groups) ?: return null
    val target = treeMoveNode(targetId, entries, groups) ?: return null
    if (!source.canReorderInternally() || !target.canReorderInternally()) return null
    val sourceParentId = source.parentId
    if (sourceParentId != target.parentId) return null

    return SettingTreeMovePlan(
        parentId = sourceParentId,
        placement = placement,
    )
}

private fun treeMoveNode(
    nodeId: String,
    entries: List<SettingLibraryEntry>,
    groups: List<SettingLibraryGroup>,
): TreeMoveNode? {
    nodeId.removePrefixOrNull("file:")?.let { entryId ->
        return entries.firstOrNull { it.id == entryId }?.let(TreeMoveNode::File)
    }
    nodeId.removePrefixOrNull("folder:")?.let { groupId ->
        return groups.firstOrNull { it.id == groupId }?.let(TreeMoveNode::Folder)
    }
    return null
}

private fun orderedNodeIdsForParent(
    parentId: String,
    entries: List<SettingLibraryEntry>,
    groups: List<SettingLibraryGroup>,
): List<String> {
    val folders = groups
        .filter { group -> group.parentId == parentId }
        .map { group ->
            OrderedTreeNode(
                id = folderNodeId(group.id),
                order = group.treeViewOrder,
                kindOrder = 0,
            )
        }
    val files = entries
        .filter { entry -> entry.groupId == parentId }
        .map { entry ->
            OrderedTreeNode(
                id = fileNodeId(entry.id),
                order = entry.treeViewOrder,
                kindOrder = 1,
            )
        }
    return (folders + files)
        .sortedWith(compareBy<OrderedTreeNode> { it.order }.thenBy { it.kindOrder })
        .map { it.id }
}

private fun applyTreeOrder(
    entries: List<SettingLibraryEntry>,
    groups: List<SettingLibraryGroup>,
    orderedIds: List<String>,
): SettingTreeMixedMoveResult {
    val orderById = orderedIds.mapIndexed { index, nodeId -> nodeId to (index + 1) }.toMap()
    val nextEntries = entries.map { entry ->
        val order = orderById[fileNodeId(entry.id)]
        if (order == null) {
            entry
        } else {
            entry.copy(treeViewOrder = order, groupViewOrder = orderedIds.size - order + 1)
        }
    }
    val nextGroups = groups.map { group ->
        val order = orderById[folderNodeId(group.id)]
        if (order == null) group else group.copy(treeViewOrder = order)
    }
    return SettingTreeMixedMoveResult(entries = nextEntries, groups = nextGroups)
}

private data class OrderedTreeNode(
    val id: String,
    val order: Int,
    val kindOrder: Int,
)

private val TreeMoveNode.parentId: String
    get() = when (this) {
        is TreeMoveNode.File -> entry.groupId
        is TreeMoveNode.Folder -> group.parentId
    }

private fun TreeMoveNode.canReorderInternally(): Boolean {
    return when (this) {
        is TreeMoveNode.File -> !entry.isFixedEntry()
        is TreeMoveNode.Folder -> true
    }
}

private fun String.removePrefixOrNull(prefix: String): String? {
    return if (startsWith(prefix)) removePrefix(prefix) else null
}
