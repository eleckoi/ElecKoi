package com.eleckoi.android.feature.characters.modes.story.presets.data.library

import com.eleckoi.android.feature.characters.modes.story.presets.data.policy.uniqueStoryPresetName
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetLibraryGroup
import com.eleckoi.android.foundation.storage.room.StoryPresetDao
import com.eleckoi.android.foundation.storage.room.StoryPresetLibraryGroupEntity
import java.util.UUID

/** Keeps author-library grouping operations out of the preset content repository. */
internal class StoryPresetLibraryGroupCoordinator(
    private val dao: StoryPresetDao,
) {
    suspend fun create(name: String): StoryPresetLibraryGroup {
        val group = StoryPresetLibraryGroupEntity(
            id = "story-preset-group-${UUID.randomUUID()}",
            name = uniqueStoryPresetName(
                name.trim().ifBlank { "新分组" },
                dao.libraryGroupNames(),
            ),
            sortIndex = dao.nextLibraryGroupSortIndex(),
        )
        dao.upsertLibraryGroup(group)
        return StoryPresetLibraryGroup(group.id, group.name, group.sortIndex)
    }

    suspend fun rename(groupId: String, name: String) {
        if (groupId.isBlank()) return
        val current = dao.libraryGroups().firstOrNull { it.id == groupId } ?: return
        val normalized = uniqueStoryPresetName(
            name.trim().ifBlank { current.name },
            dao.libraryGroups().filterNot { it.id == groupId }.map { it.name },
        )
        dao.renameLibraryGroup(groupId, normalized)
    }

    suspend fun movePreset(presetId: String, groupId: String) {
        dao.movePreset(presetId, groupId)
    }

    suspend fun delete(groupId: String) {
        if (groupId.isBlank()) return
        // "全部预设" is the recovery scope: preserve presets without assigning another author.
        dao.movePresetsFromDeletedGroup(groupId, "")
        dao.deleteLibraryGroup(groupId)
    }
}
