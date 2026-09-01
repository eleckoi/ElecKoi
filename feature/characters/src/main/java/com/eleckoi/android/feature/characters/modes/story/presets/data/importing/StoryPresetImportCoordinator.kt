package com.eleckoi.android.feature.characters.modes.story.presets.data.importing

import com.eleckoi.android.feature.characters.modes.story.presets.data.media.StoryPresetAuthorAvatarStore
import com.eleckoi.android.feature.characters.modes.story.presets.data.policy.uniqueStoryPresetName
import com.eleckoi.android.feature.characters.modes.story.presets.data.storage.toStorageRecord
import com.eleckoi.android.feature.characters.modes.story.presets.data.storage.toVersionRecord
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPreset
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetModelFamily
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetModelTag
import com.eleckoi.android.feature.characters.modes.story.presets.model.toTag
import com.eleckoi.android.feature.characters.modes.story.presets.model.withRequiredBuiltIns
import com.eleckoi.android.feature.characters.modes.story.regex.data.normalizedRegexRules
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.HiddenToolTimelineEntryId
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isHiddenToolTimelineEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.HistoryCompactionEntryId
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isHistoryCompactionEntry
import com.eleckoi.android.foundation.storage.room.StoryPresetDao
import java.util.UUID

/** Validates, rebases, and persists a foreign preset as a new local identity. */
internal class StoryPresetImportCoordinator(
    private val dao: StoryPresetDao,
    private val authorAvatars: StoryPresetAuthorAvatarStore,
) {
    suspend fun import(source: StoryPreset, authorAvatarPng: ByteArray?): StoryPreset {
        val id = "story-preset-${UUID.randomUUID()}"
        val versionId = "$id:v1"
        val authorAvatarFile = authorAvatars.storeImported(id, authorAvatarPng)
        val normalizedSource = source.withRequiredBuiltIns()
        val sourceGroups = normalizedSource.groups
            .filter { it.id.isNotBlank() }
            .distinctBy { it.id }
        val groupIds = sourceGroups.mapIndexed { index, group ->
            group.id to "$id-group-${index + 1}"
        }.toMap()
        val sourcePositions = normalizedSource.promptPositions
            .filter { it.id.isNotBlank() }
            .distinctBy { it.id }
        val promptPositionIds = sourcePositions.mapIndexed { index, position ->
            position.id to "$id-position-${index + 1}"
        }.toMap()
        val normalizedTags = normalizedSource.modelTags
            .map { it.copy(id = it.id.trim().lowercase(), label = it.label.trim()) }
            .filter { it.id.isNotBlank() && it.label.isNotBlank() }
            .distinctBy(StoryPresetModelTag::id)
            .take(8)
            .ifEmpty { listOf(StoryPresetModelFamily.General.toTag()) }
        val modelFamily = StoryPresetModelFamily.entries
            .firstOrNull { family -> normalizedTags.any { it.id == family.storageValue } }
            ?: normalizedSource.modelFamily
        val imported = normalizedSource.copy(
            id = id,
            name = uniqueStoryPresetName(
                normalizedSource.name.trim().take(60).ifBlank { "导入预设" },
                dao.presetNames(),
            ),
            modelFamily = modelFamily,
            modelTags = normalizedTags,
            libraryGroupId = "",
            activeVersionId = versionId,
            activeVersionNumber = 1,
            profile = normalizedSource.profile.copy(
                authorAvatarPath = authorAvatarFile?.absolutePath.orEmpty(),
            ),
            regexRules = normalizedSource.regexRules.mapIndexed { index, rule ->
                rule.copy(id = "$id-regex-${index + 1}", order = index)
            }.normalizedRegexRules(),
            groups = sourceGroups.mapIndexed { index, group ->
                group.copy(
                    id = groupIds.getValue(group.id),
                    parentId = groupIds[group.parentId].orEmpty(),
                    order = index + 1,
                    createdAt = "",
                    updatedAt = "",
                )
            },
            entries = normalizedSource.entries.mapIndexed { index, entry ->
                entry.copy(
                    id = when {
                        entry.isHistoryCompactionEntry() -> HistoryCompactionEntryId
                        entry.isHiddenToolTimelineEntry() -> HiddenToolTimelineEntryId
                        else -> "$id-entry-${index + 1}"
                    },
                    groupId = groupIds[entry.groupId].orEmpty(),
                    promptPositionId = promptPositionIds[entry.promptPositionId].orEmpty(),
                    createdAt = "",
                    updatedAt = "",
                )
            },
            promptPositions = sourcePositions.mapIndexed { index, position ->
                position.copy(
                    id = promptPositionIds.getValue(position.id),
                    order = index + 1,
                    createdAt = "",
                    updatedAt = "",
                )
            },
            expandedGroupIds = normalizedSource.expandedGroupIds
                .mapNotNull(groupIds::get)
                .distinct(),
        ).withRequiredBuiltIns()
        val record = imported.toStorageRecord(sortIndex = dao.nextSortIndex())
        try {
            dao.replace(record)
            dao.replaceVersion(
                record.toVersionRecord(
                    versionId = versionId,
                    versionNumber = 1,
                    versionName = imported.name,
                    createdAtEpochMs = System.currentTimeMillis(),
                ),
            )
        } catch (error: Throwable) {
            if (!dao.presetExists(id)) authorAvatarFile?.delete()
            throw error
        }
        return imported
    }
}
