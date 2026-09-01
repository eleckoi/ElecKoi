package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.dynamic

import androidx.compose.foundation.layout.size
import androidx.compose.runtime.getValue
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryTriggerMode
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isFixedEntry
import java.util.UUID
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui.*

internal enum class DynamicTreeClipboardMode { Copy, Cut }

internal data class DynamicTreeClipboard(
    val nodeId: String,
    val mode: DynamicTreeClipboardMode,
)

internal data class DynamicTreeDeleteTarget(
    val id: String,
    val title: String,
    val folder: Boolean,
    val childCount: Int = 0,
)

internal fun dynamicNextGroupName(library: SettingLibrary, parentId: String): String {
    val siblings = library.groups.filter { it.parentId == parentId }.map { it.name.trim() }.toSet()
    if ("新文件夹" !in siblings) return "新文件夹"
    var index = 2
    while ("新文件夹$index" in siblings) index += 1
    return "新文件夹$index"
}

internal fun dynamicNextTreeOrder(library: SettingLibrary, parentId: String): Int {
    val groupMax = library.groups.filter { it.parentId == parentId }.maxOfOrNull { it.treeViewOrder } ?: 0
    val entryMax = library.entries.filter { it.groupId == parentId }.maxOfOrNull { it.treeViewOrder } ?: 0
    return maxOf(groupMax, entryMax) + 1
}

internal fun dynamicPasteTreeNode(
    library: SettingLibrary,
    clipboard: DynamicTreeClipboard,
    targetGroupId: String,
): SettingLibrary? {
    return when {
        clipboard.nodeId.startsWith("file:") -> {
            val entryId = clipboard.nodeId.removePrefix("file:")
            val source = library.entries.firstOrNull { it.id == entryId }
                ?.takeIf { !it.isFixedEntry() && it.triggerMode == SettingLibraryTriggerMode.AgentTool }
                ?: return null
            when (clipboard.mode) {
                DynamicTreeClipboardMode.Cut -> {
                    if (source.groupId == targetGroupId) return null
                    library.copy(
                        entries = library.entries.map { entry ->
                            if (entry.id == source.id) entry.copy(groupId = targetGroupId) else entry
                        },
                    )
                }
                DynamicTreeClipboardMode.Copy -> {
                    val title = dynamicCopiedTitle(
                        source.title.ifBlank { "未命名设定" },
                        library.entries.filter { it.groupId == targetGroupId }.map { it.title },
                    )
                    library.copy(
                        entries = library.entries + source.copy(
                            id = "session-setting-${UUID.randomUUID().toString().replace("-", "").take(12)}",
                            title = title,
                            groupId = targetGroupId,
                            treeViewOrder = dynamicNextTreeOrder(library, targetGroupId),
                            createdAt = "",
                            updatedAt = "",
                        ),
                    )
                }
            }
        }
        clipboard.nodeId.startsWith("folder:") -> {
            val groupId = clipboard.nodeId.removePrefix("folder:")
            val source = library.groups.firstOrNull { it.id == groupId } ?: return null
            val descendants = descendantGroupIds(groupId, library.groups)
            if (targetGroupId == groupId || targetGroupId in descendants) return null
            when (clipboard.mode) {
                DynamicTreeClipboardMode.Cut -> {
                    if (source.parentId == targetGroupId) return null
                    library.copy(
                        groups = library.groups.map { group ->
                            if (group.id == source.id) group.copy(parentId = targetGroupId) else group
                        },
                    )
                }
                DynamicTreeClipboardMode.Copy -> dynamicCopyGroup(library, source, descendants, targetGroupId)
            }
        }
        else -> null
    }
}

private fun dynamicCopyGroup(
    library: SettingLibrary,
    source: SettingLibraryGroup,
    descendants: Set<String>,
    targetParentId: String,
): SettingLibrary {
    val copiedIds = descendants + source.id
    val sourceGroups = library.groups
        .filter { it.id in copiedIds }
        .sortedBy { dynamicGroupDepth(it, library.groups) }
    val idMap = sourceGroups.associate { group ->
        group.id to "session-group-${UUID.randomUUID().toString().replace("-", "").take(12)}"
    }
    val rootName = dynamicCopiedTitle(
        source.name.ifBlank { "未命名文件夹" },
        library.groups.filter { it.parentId == targetParentId }.map { it.name },
    )
    val copiedGroups = sourceGroups.map { group ->
        group.copy(
            id = idMap.getValue(group.id),
            name = if (group.id == source.id) rootName else group.name,
            parentId = if (group.id == source.id) targetParentId else idMap[group.parentId].orEmpty(),
            order = library.groups.size + sourceGroups.indexOf(group) + 1,
            treeViewOrder = if (group.id == source.id) {
                dynamicNextTreeOrder(library, targetParentId)
            } else {
                group.treeViewOrder
            },
            createdAt = "",
            updatedAt = "",
        )
    }
    val copiedEntries = library.entries
        .filter { entry ->
            entry.groupId in copiedIds && !entry.isFixedEntry() &&
                entry.triggerMode == SettingLibraryTriggerMode.AgentTool
        }
        .map { entry ->
            entry.copy(
                id = "session-setting-${UUID.randomUUID().toString().replace("-", "").take(12)}",
                groupId = idMap[entry.groupId].orEmpty(),
                createdAt = "",
                updatedAt = "",
            )
        }
    return library.copy(
        groups = library.groups + copiedGroups,
        entries = library.entries + copiedEntries,
    )
}

private fun dynamicGroupDepth(group: SettingLibraryGroup, groups: List<SettingLibraryGroup>): Int {
    val byId = groups.associateBy { it.id }
    var depth = 0
    var parentId = group.parentId
    val visited = mutableSetOf<String>()
    while (parentId.isNotBlank() && visited.add(parentId)) {
        depth += 1
        parentId = byId[parentId]?.parentId.orEmpty()
    }
    return depth
}

private fun dynamicCopiedTitle(source: String, existing: List<String>): String {
    val names = existing.map(String::trim).toSet()
    val base = "$source 副本".take(60)
    if (base !in names) return base
    var index = 2
    while ("$base $index" in names) index += 1
    return "$base $index".take(60)
}
