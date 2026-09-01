package com.eleckoi.android.feature.characters.modes.story.presets.model

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryPromptPosition
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isHiddenToolTimelineEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isHistoryCompactionEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.settingLibraryHiddenToolTimelineEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.settingLibraryHistoryCompactionEntry
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRule

enum class StoryPresetModelFamily(
    val storageValue: String,
    val label: String,
) {
    General("general", "通用"),
    Claude("claude", "Claude"),
    OpenAI("openai", "OpenAI"),
    Gemini("gemini", "Gemini"),
    DeepSeek("deepseek", "DeepSeek"),
    Other("other", "其他"),
    ;

    companion object {
        fun fromStorage(value: String): StoryPresetModelFamily = entries
            .firstOrNull { it.storageValue == value.trim().lowercase() }
            ?: General
    }
}

data class StoryPresetModelTag(
    val id: String,
    val label: String,
    val providerId: String = "",
)

fun StoryPresetModelFamily.toTag(): StoryPresetModelTag = StoryPresetModelTag(
    id = storageValue,
    label = label,
    providerId = when (this) {
        StoryPresetModelFamily.General -> ""
        StoryPresetModelFamily.Claude -> "claude"
        StoryPresetModelFamily.OpenAI -> "openai"
        StoryPresetModelFamily.Gemini -> "gemini"
        StoryPresetModelFamily.DeepSeek -> "deepseek"
        StoryPresetModelFamily.Other -> ""
    },
)

data class StoryPresetLibraryGroup(
    val id: String,
    val name: String,
    val sortIndex: Int,
)

/** Author-written metadata shown on the preset overview. This is not an executable preset version. */
data class StoryPresetTimelineItem(
    val id: String,
    val title: String,
    val dateLabel: String = "",
    val note: String = "",
)

data class StoryPresetProfile(
    val authorName: String = "",
    val authorAvatarPath: String = "",
    val tags: List<String> = emptyList(),
    val description: String = "",
    val timeline: List<StoryPresetTimelineItem> = emptyList(),
)

/**
 * One globally selectable preset. Its ordinary prompt entries deliberately reuse the setting
 * library model.
 */
data class StoryPreset(
    val id: String,
    val name: String,
    val modelFamily: StoryPresetModelFamily = StoryPresetModelFamily.General,
    val modelTags: List<StoryPresetModelTag> = listOf(modelFamily.toTag()),
    val libraryGroupId: String = "",
    val activeVersionId: String = "",
    val activeVersionNumber: Int = 1,
    val profile: StoryPresetProfile = StoryPresetProfile(),
    val entries: List<SettingLibraryEntry> = emptyList(),
    val groups: List<SettingLibraryGroup> = emptyList(),
    val promptPositions: List<SettingLibraryPromptPosition> = emptyList(),
    val regexRules: List<RegexRule> = emptyList(),
    val expandedGroupIds: List<String> = emptyList(),
) {
    /**
     * Namespaces the selected preset before it joins a character's effective setting library.
     * Namespaced ids prevent imported ids from colliding with a character card or conversation
     * delta, while blank parent/group ids stay blank so the author's root layout is preserved.
     */
    fun asRuntimeSettingLibrary(): SettingLibrary {
        val namespace = "story-preset:$id:"
        fun groupId(sourceId: String): String = "$namespace${sourceId.ifBlank { "ungrouped" }}"
        fun promptPositionId(sourceId: String): String = "$namespace${sourceId.ifBlank { "position" }}"

        val runtimeGroups = groups.mapIndexed { index, group ->
            group.copy(
                id = groupId(group.id),
                parentId = group.parentId.takeIf(String::isNotBlank)?.let(::groupId).orEmpty(),
                order = index + 1,
            )
        }
        val runtimeEntries = entries.filterNot(SettingLibraryEntry::isHistoryCompactionEntry).mapIndexed { index, entry ->
            entry.copy(
                id = "$namespace${entry.id.ifBlank { "entry-$index" }}",
                groupId = entry.groupId.takeIf(String::isNotBlank)?.let(::groupId).orEmpty(),
                promptPositionId = entry.promptPositionId.takeIf(String::isNotBlank)?.let(::promptPositionId).orEmpty(),
            )
        }
        val runtimePromptPositions = promptPositions.mapIndexed { index, position ->
            position.copy(
                id = promptPositionId(position.id.ifBlank { "position-$index" }),
                order = index + 1,
            )
        }
        return SettingLibrary(
            characterId = namespace,
            name = name,
            entries = runtimeEntries,
            groups = runtimeGroups,
            promptPositions = runtimePromptPositions,
            expandedGroupIds = runtimeGroups.map(SettingLibraryGroup::id),
        )
    }
}

data class StoryPresetSummary(
    val id: String,
    val name: String,
    val modelFamily: StoryPresetModelFamily,
    val modelTags: List<StoryPresetModelTag>,
    val libraryGroupId: String,
    val activeVersionId: String,
    val activeVersionNumber: Int,
    val entryCount: Int,
    val profile: StoryPresetProfile = StoryPresetProfile(),
)

data class StoryPresetCatalog(
    val activePresetId: String,
    val groups: List<StoryPresetLibraryGroup>,
    val presets: List<StoryPresetSummary>,
) {
    val activePreset: StoryPresetSummary?
        get() = presets.firstOrNull { it.id == activePresetId } ?: presets.firstOrNull()
}

const val DefaultStoryPresetId: String = "story-preset-default"
private const val RemovedDshHarnessIdentityEntryId: String = "built-in-dsh-harness-identity"

fun StoryPreset.withRequiredBuiltIns(): StoryPreset {
    val compactionEntry = settingLibraryHistoryCompactionEntry(
        entries.firstOrNull(SettingLibraryEntry::isHistoryCompactionEntry),
    )
    val hiddenTimelineEntry = settingLibraryHiddenToolTimelineEntry(
        entries.firstOrNull(SettingLibraryEntry::isHiddenToolTimelineEntry),
    )
    return copy(
        entries = listOf(compactionEntry, hiddenTimelineEntry) + entries.filterNot { candidate ->
            candidate.id == RemovedDshHarnessIdentityEntryId ||
                candidate.isHistoryCompactionEntry() ||
                candidate.isHiddenToolTimelineEntry()
        },
    )
}

fun StoryPreset.historyCompactionInstructions(): String? = entries
    .firstOrNull(SettingLibraryEntry::isHistoryCompactionEntry)
    ?.takeIf(SettingLibraryEntry::enabled)
    ?.content
    ?.trim()
    ?.takeIf(String::isNotBlank)

fun defaultStoryPreset(): StoryPreset = StoryPreset(
    id = DefaultStoryPresetId,
    name = "默认故事预设",
    modelFamily = StoryPresetModelFamily.General,
).withRequiredBuiltIns()

fun defaultStoryPresetCatalog(): StoryPresetCatalog = StoryPresetCatalog(
    activePresetId = DefaultStoryPresetId,
    groups = emptyList(),
    presets = listOf(
        StoryPresetSummary(
            id = DefaultStoryPresetId,
            name = "默认故事预设",
            modelFamily = StoryPresetModelFamily.General,
            modelTags = listOf(StoryPresetModelFamily.General.toTag()),
            libraryGroupId = "",
            activeVersionId = "$DefaultStoryPresetId:v1",
            activeVersionNumber = 1,
            entryCount = 2,
        ),
    ),
)
