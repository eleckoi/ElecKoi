package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isFixedEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.normalizeSettingLibraryFixedEntry

internal data class NormalizedSettingLibraryTree(
    val entries: List<SettingLibraryEntry>,
    val groups: List<SettingLibraryGroup>,
)

/** Restores tree invariants after import, drag/drop, paste, or group deletion. */
internal fun normalizeSettingLibraryTree(
    entries: List<SettingLibraryEntry>,
    groups: List<SettingLibraryGroup>,
): NormalizedSettingLibraryTree {
    val orderedGroups = groups.mapIndexed { index, group -> group.copy(order = index + 1) }
    val groupIds = orderedGroups.mapTo(mutableSetOf()) { it.id }
    val normalizedGroups = orderedGroups.map { group ->
        if (group.parentId.isBlank() || group.parentId in groupIds) {
            group
        } else {
            group.copy(parentId = "")
        }
    }
    val normalizedEntries = entries.map { entry ->
        when {
            entry.isFixedEntry() -> normalizeSettingLibraryFixedEntry(entry)
            entry.groupId.isBlank() || entry.groupId in groupIds -> entry
            else -> entry.copy(groupId = "")
        }
    }
    return NormalizedSettingLibraryTree(
        entries = normalizedEntries,
        groups = normalizedGroups,
    )
}
