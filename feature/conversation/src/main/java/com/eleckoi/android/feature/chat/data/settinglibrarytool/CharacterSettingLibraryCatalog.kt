package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryAgentEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryAgentGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibrarySessionMutation
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.settingLibrarySafePathSegment

internal data class SettingLibraryToolCatalog(
    val entries: List<SettingLibraryAgentEntry>,
    val groups: List<SettingLibraryAgentGroup>,
)

internal fun SettingLibraryToolCatalog.after(
    mutation: SettingLibrarySessionMutation,
): SettingLibraryToolCatalog = when (mutation) {
    is SettingLibrarySessionMutation.CreateEntry -> {
        val groupPath = groups.firstOrNull { it.id == mutation.groupId }?.path.orEmpty()
        val entry = SettingLibraryAgentEntry(
            id = mutation.entryId,
            title = mutation.title,
            groupId = mutation.groupId,
            groupPath = groupPath,
            path = listOf(groupPath, settingLibrarySafePathSegment(mutation.title))
                .filter(String::isNotBlank)
                .joinToString("/"),
            content = mutation.content,
            selectionHint = mutation.selectionHint,
        )
        copy(entries = entries + entry)
    }
    is SettingLibrarySessionMutation.UpdateEntry -> copy(
        entries = entries.map { entry ->
            if (entry.id != mutation.entryId) return@map entry
            val groupId = mutation.groupId ?: entry.groupId
            val groupPath = groups.firstOrNull { it.id == groupId }?.path.orEmpty()
            val title = mutation.title ?: entry.title
            entry.copy(
                title = title,
                groupId = groupId,
                groupPath = groupPath,
                path = listOf(groupPath, settingLibrarySafePathSegment(title))
                    .filter(String::isNotBlank)
                    .joinToString("/"),
                content = mutation.content ?: entry.content,
                selectionHint = mutation.selectionHint ?: entry.selectionHint,
            )
        },
    )
    is SettingLibrarySessionMutation.DeleteEntry -> copy(
        entries = entries.filterNot { it.id == mutation.entryId },
    )
    is SettingLibrarySessionMutation.CreateGroup -> rebuildPaths(
        groups + SettingLibraryAgentGroup(
            id = mutation.groupId,
            name = mutation.name,
            parentId = mutation.parentId,
            path = "",
        ),
    )
    is SettingLibrarySessionMutation.UpdateGroup -> rebuildPaths(
        groups.map { group ->
            if (group.id != mutation.groupId) return@map group
            group.copy(
                name = mutation.name ?: group.name,
                parentId = mutation.parentId ?: group.parentId,
            )
        },
    )
    is SettingLibrarySessionMutation.DeleteGroup -> {
        val removedIds = buildSet {
            add(mutation.groupId)
            var changed: Boolean
            do {
                changed = false
                groups.forEach { group ->
                    if (group.parentId in this && add(group.id)) changed = true
                }
            } while (changed)
        }
        rebuildPaths(
            nextGroups = groups.filterNot { it.id in removedIds },
            nextEntries = entries.filterNot { it.groupId in removedIds },
        )
    }
}

internal fun SettingLibraryToolCatalog.rebuildPaths(
    nextGroups: List<SettingLibraryAgentGroup>,
    nextEntries: List<SettingLibraryAgentEntry> = entries,
): SettingLibraryToolCatalog {
    val byId = nextGroups.associateBy(SettingLibraryAgentGroup::id)
    val paths = mutableMapOf<String, String>()

    fun pathOf(group: SettingLibraryAgentGroup, visiting: Set<String> = emptySet()): String {
        paths[group.id]?.let { return it }
        if (group.id in visiting) return settingLibrarySafePathSegment(group.name)
        val parentPath = byId[group.parentId]
            ?.let { parent -> pathOf(parent, visiting + group.id) }
            .orEmpty()
        return listOf(parentPath, settingLibrarySafePathSegment(group.name))
            .filter(String::isNotBlank)
            .joinToString("/")
            .also { paths[group.id] = it }
    }

    val rebuiltGroups = nextGroups.map { group -> group.copy(path = pathOf(group)) }
    val pathById = rebuiltGroups.associate { it.id to it.path }
    val rebuiltEntries = nextEntries.map { entry ->
        val groupPath = pathById[entry.groupId].orEmpty()
        entry.copy(
            groupPath = groupPath,
            path = listOf(groupPath, settingLibrarySafePathSegment(entry.title))
                .filter(String::isNotBlank)
                .joinToString("/"),
        )
    }
    return SettingLibraryToolCatalog(entries = rebuiltEntries, groups = rebuiltGroups)
}
