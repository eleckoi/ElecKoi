package com.eleckoi.android.feature.characters.modes.story.settinglibrary.data

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryPromptPosition
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryVersion

/** Preserves timestamps for unchanged rows so the Room write plan can recognize real edits. */
internal fun settleSettingLibraryChangeTimestamps(
    previous: SettingLibrary?,
    normalized: SettingLibrary,
    now: String,
): SettingLibrary {
    if (previous == null) return normalized
    val previousVersions = previous.versions.associateBy(SettingLibraryVersion::id)
    val versions = normalized.versions.map { version ->
        val old = previousVersions[version.id] ?: return@map version
        val entries = settleRows(
            old.entries.associateBy(SettingLibraryEntry::id),
            version.entries,
            now,
            { it.id },
            { it.updatedAt },
            { value, updatedAt -> value.copy(updatedAt = updatedAt) },
        )
        val groups = settleRows(
            old.groups.associateBy(SettingLibraryGroup::id),
            version.groups,
            now,
            { it.id },
            { it.updatedAt },
            { value, updatedAt -> value.copy(updatedAt = updatedAt) },
        )
        val promptPositions = settleRows(
            old.promptPositions.associateBy(SettingLibraryPromptPosition::id),
            version.promptPositions,
            now,
            { it.id },
            { it.updatedAt },
            { value, updatedAt -> value.copy(updatedAt = updatedAt) },
        )
        val candidate = version.copy(
            entries = entries,
            groups = groups,
            promptPositions = promptPositions,
        )
        val withOldTimestamp = candidate.copy(updatedAt = old.updatedAt)
        if (withOldTimestamp == old) withOldTimestamp else candidate.copy(updatedAt = now)
    }
    val active = versions.first { it.id == normalized.activeVersionId }
    return normalized.copy(
        name = active.name,
        entries = active.entries,
        groups = active.groups,
        promptPositions = active.promptPositions,
        versions = versions,
        listAllExpanded = active.listAllExpanded,
        expandedGroupIds = active.expandedGroupIds,
    )
}

private inline fun <T, K> settleRows(
    previous: Map<K, T>,
    incoming: List<T>,
    now: String,
    id: (T) -> K,
    updatedAt: (T) -> String,
    withUpdatedAt: (T, String) -> T,
): List<T> = incoming.map { value ->
    val old = previous[id(value)] ?: return@map value
    val withOldTimestamp = withUpdatedAt(value, updatedAt(old))
    if (withOldTimestamp == old) withOldTimestamp else withUpdatedAt(value, now)
}
