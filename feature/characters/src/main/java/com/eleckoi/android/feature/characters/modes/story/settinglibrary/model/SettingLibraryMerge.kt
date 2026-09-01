package com.eleckoi.android.feature.characters.modes.story.settinglibrary.model

/**
 * Merging picked entries out of one setting library into another.
 *
 * The selection is a set of entry ids; folders are never selected on their own. Whatever folders
 * those entries live in come along with them, because an entry pulled out of its folder has lost
 * half of what it meant — "关系阶段表现" under 人物 and the same file loose at the root are not the
 * same setting. So the ancestor chain of every picked entry is rebuilt on the far side.
 *
 * A folder whose name already exists at the same place in the target is
 * reused rather than duplicated, so importing 世界 twice from two different cards leaves one 世界.
 * Only names collide — ids never travel, since two libraries have no reason to agree on them.
 */
data class SettingLibraryMergePlan(
    val entryCount: Int = 0,
    val mergedFolderCount: Int = 0,
    val newFolderCount: Int = 0,
    val renamedEntryCount: Int = 0,
    val reorderedEntryCount: Int = 0,
) {
    val isEmpty: Boolean get() = entryCount == 0
}

data class SettingLibraryMergeResult(
    val entries: List<SettingLibraryEntry>,
    val groups: List<SettingLibraryGroup>,
    val plan: SettingLibraryMergePlan,
)

/**
 * @param destinationGroupId the target folder the imported tree is planted under; blank means root.
 * @param idSeed injected so tests are deterministic; production passes the clock.
 */
fun mergeSettingLibraryEntries(
    targetEntries: List<SettingLibraryEntry>,
    targetGroups: List<SettingLibraryGroup>,
    sourceEntries: List<SettingLibraryEntry>,
    sourceGroups: List<SettingLibraryGroup>,
    selectedEntryIds: Set<String>,
    destinationGroupId: String = "",
    idSeed: Long = System.currentTimeMillis(),
): SettingLibraryMergeResult {
    // Pinned entries belong to every library and are never merge candidates.
    val picked = sourceEntries.filter { it.id in selectedEntryIds && !it.isFixedEntry() }
    if (picked.isEmpty()) {
        return SettingLibraryMergeResult(targetEntries, targetGroups, SettingLibraryMergePlan())
    }

    val sourceGroupsById = sourceGroups.associateBy { it.id }
    val destination = destinationGroupId.takeIf { id -> targetGroups.any { it.id == id } }.orEmpty()

    // Ancestors first: a child cannot resolve its parent id before the parent has one.
    val requiredGroupIds = LinkedHashSet<String>()
    picked.forEach { entry ->
        val chain = mutableListOf<SettingLibraryGroup>()
        val seen = mutableSetOf<String>()
        var cursor = sourceGroupsById[entry.groupId]
        while (cursor != null && seen.add(cursor.id)) {
            chain += cursor
            cursor = sourceGroupsById[cursor.parentId]
        }
        chain.asReversed().forEach { requiredGroupIds += it.id }
    }

    val nextGroups = targetGroups.toMutableList()
    val nextEntries = targetEntries.toMutableList()
    val resolvedGroupIds = mutableMapOf<String, String>()
    var mergedFolders = 0
    var newFolders = 0
    var groupSequence = 0

    requiredGroupIds.forEach { sourceGroupId ->
        val sourceGroup = sourceGroupsById.getValue(sourceGroupId)
        val parentId = if (sourceGroup.parentId.isBlank()) {
            destination
        } else {
            resolvedGroupIds[sourceGroup.parentId] ?: destination
        }
        val name = sourceGroup.name.trim().ifBlank { "未命名文件夹" }
        val existing = nextGroups.firstOrNull { it.parentId == parentId && it.name.trim() == name }
        if (existing != null) {
            resolvedGroupIds[sourceGroupId] = existing.id
            mergedFolders += 1
        } else {
            val id = "group-$idSeed-${groupSequence++}"
            nextGroups += SettingLibraryGroup(
                id = id,
                name = name,
                parentId = parentId,
                order = nextGroups.size + 1,
                treeViewOrder = nextTreeViewOrder(parentId, nextGroups, nextEntries),
            )
            resolvedGroupIds[sourceGroupId] = id
            newFolders += 1
        }
    }

    var renamedEntries = 0
    var reorderedEntries = 0
    var viewOrder = targetEntries.maxOfOrNull { it.viewOrder } ?: 0
    val copiedEntryIds = picked.mapIndexed { index, entry ->
        entry.id to "draft-$idSeed-$index"
    }.toMap()

    picked.forEach { source ->
        val groupId = if (source.groupId.isBlank()) {
            destination
        } else {
            resolvedGroupIds[source.groupId] ?: destination
        }
        val baseTitle = source.title.trim().ifBlank { "未命名设定" }
        val title = availableTitleIn(groupId, baseTitle, nextEntries)
        if (title != baseTitle) renamedEntries += 1
        val order = availableOrderFor(source, nextEntries)
        if (order != source.order) reorderedEntries += 1
        viewOrder += 1
        nextEntries += source.copy(
            id = copiedEntryIds.getValue(source.id),
            title = title,
            groupId = groupId,
            order = order,
            viewOrder = viewOrder,
            groupViewOrder = (nextEntries.filter { it.groupId == groupId }.maxOfOrNull { it.groupViewOrder } ?: 0) + 1,
            treeViewOrder = nextTreeViewOrder(groupId, nextGroups, nextEntries),
            createdAt = "",
            updatedAt = "",
        )
    }

    return SettingLibraryMergeResult(
        entries = nextEntries,
        groups = nextGroups,
        plan = SettingLibraryMergePlan(
            entryCount = picked.size,
            mergedFolderCount = mergedFolders,
            newFolderCount = newFolders,
            renamedEntryCount = renamedEntries,
            reorderedEntryCount = reorderedEntries,
        ),
    )
}

/**
 * Another character's library, offered as somewhere to import from.
 *
 * Read-only by construction: nothing here can write back to the character it came from.
 */
data class SettingLibrarySource(
    val characterId: String,
    val characterName: String,
    val avatar: String = "",
    val versions: List<SettingLibraryVersion> = emptyList(),
) {
    val entryCount: Int
        get() = versions.sumOf { version -> version.entries.count { !it.isFixedEntry() } }
}

/** The titles already spoken for, for the picker's duplicate marker. */
fun settingLibraryTakenTitles(entries: List<SettingLibraryEntry>): Set<String> {
    return entries.filterNot { it.isFixedEntry() }
        .map { it.title.trim() }
        .filter { it.isNotBlank() }
        .toSet()
}

private fun nextTreeViewOrder(
    parentId: String,
    groups: List<SettingLibraryGroup>,
    entries: List<SettingLibraryEntry>,
): Int {
    val folderMax = groups.filter { it.parentId == parentId }.maxOfOrNull { it.treeViewOrder } ?: 0
    val entryMax = entries.filter { it.groupId == parentId }.maxOfOrNull { it.treeViewOrder } ?: 0
    return maxOf(folderMax, entryMax) + 1
}

private fun availableTitleIn(
    groupId: String,
    base: String,
    entries: List<SettingLibraryEntry>,
): String {
    val taken = entries.filter { it.groupId == groupId }.map { it.title.trim() }.toSet()
    if (base !in taken) return base
    var index = 2
    while ("$base $index" in taken) index += 1
    return "$base $index".take(60)
}

/**
 * Two entries at the same insertion position and order are the conflict the tree already warns about,
 * so an import must not create one. The newcomer slides down to the first free slot instead — it
 * lands after whatever was already there, which is the same thing you would have done by hand.
 */
private fun availableOrderFor(
    entry: SettingLibraryEntry,
    entries: List<SettingLibraryEntry>,
): Int {
    val position = entry.position ?: return entry.order
    val scope = entry.promptPositionId.ifBlank { position.storageValue }
    val taken = entries.filter { other ->
        !other.isFixedEntry() &&
            other.promptPositionId.ifBlank { other.position?.storageValue.orEmpty() } == scope
    }.map { it.order }.toSet()
    var order = entry.order
    while (order in taken) order += 1
    return order
}
