package com.eleckoi.android.feature.characters.modes.story.presets.data

import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPreset
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetImportDocument
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetImportSource
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetModelFamily
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetModelTag
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetProfile
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetTimelineItem
import com.eleckoi.android.feature.characters.modes.story.presets.model.toTag
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryJsonCodec
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryAgentReadStrategy
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryInsertRole
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryTriggerMode
import com.eleckoi.android.feature.characters.modes.story.regex.data.RegexRuleJsonCodec
import org.json.JSONArray
import org.json.JSONObject

internal data class StoryPresetImportConversion(
    val preset: StoryPreset,
    val skippedUnsupportedEntries: Int = 0,
    val authorAvatarPng: ByteArray? = null,
)

/** Converts supported preset files into an unpersisted [StoryPreset]. */
internal object StoryPresetImportCodec {
    private const val ElecKoiFormat = "eleckoi.story-preset"
    private const val ElecKoiFormatVersion = 1
    private const val ElecKoiSettingLibraryFormat = "eleckoi.workspace-setting-library"
    private const val SillyTavernGlobalPromptOrderId = "100001"
    private const val SillyTavernPromptGroupId = "tavern-preset-prompts"

    fun decode(
        document: StoryPresetImportDocument,
        source: StoryPresetImportSource,
    ): StoryPresetImportConversion = when (source) {
        StoryPresetImportSource.ElecKoi -> decodeElecKoi(document)
        StoryPresetImportSource.SillyTavern -> decodeSillyTavern(document)
    }

    fun encodeElecKoi(preset: StoryPreset): String = JSONObject()
        .put("format", ElecKoiFormat)
        .put("version", ElecKoiFormatVersion)
        .put(
            "preset",
            JSONObject()
                .put("name", preset.name)
                .put("model_family", preset.modelFamily.storageValue)
                .put("model_tags", JSONArray(preset.modelTags.map(::modelTagToJson)))
                .put("profile", profileToJson(preset.profile))
                .put("entries", JSONArray(preset.entries.map(SettingLibraryJsonCodec::entryToJson)))
                .put("groups", JSONArray(preset.groups.map(SettingLibraryJsonCodec::groupToJson)))
                .put("regex_rules", JSONArray(preset.regexRules.map(RegexRuleJsonCodec::ruleToJson)))
                .put(
                    "prompt_positions",
                    JSONArray(preset.promptPositions.map(SettingLibraryJsonCodec::promptPositionToJson)),
                )
                .put("expanded_group_ids", JSONArray(preset.expandedGroupIds)),
        )
        .toString(2)

    private fun decodeElecKoi(document: StoryPresetImportDocument): StoryPresetImportConversion {
        val pngPayload = document.bytes
            ?.takeIf(StoryPresetPngFormat::isPng)
            ?.let(StoryPresetPngFormat::decode)
        val json = pngPayload?.json ?: document.json
        val root = parseRoot(json, "ElecKoi 预设")
        if (root.cleanString("format") == ElecKoiSettingLibraryFormat) {
            val version = runCatching {
                SettingLibraryJsonCodec.parseExport(json, "import")
            }.getOrElse { error ->
                throw IllegalArgumentException(error.message ?: "ElecKoi 设定库格式不正确", error)
            }
            return StoryPresetImportConversion(
                StoryPreset(
                    id = "",
                    name = version.name.ifBlank { document.suggestedName() },
                    modelTags = listOf(StoryPresetModelFamily.General.toTag()),
                    entries = version.entries,
                    groups = version.groups,
                    promptPositions = version.promptPositions,
                    expandedGroupIds = version.expandedGroupIds,
                ),
                authorAvatarPng = pngPayload?.authorAvatarPng,
            )
        }
        require(
            root.cleanString("format") == ElecKoiFormat &&
                root.optInt("version", -1) == ElecKoiFormatVersion,
        ) { "这不是当前版本的 ElecKoi 预设文件" }
        val value = root.optJSONObject("preset") ?: error("ElecKoi 预设缺少 preset 数据")
        val family = StoryPresetModelFamily.fromStorage(value.cleanString("model_family"))
        val tags = value.optJSONArray("model_tags")
            ?.objects()
            ?.mapNotNull(::modelTagFromJson)
            .orEmpty()
            .ifEmpty { listOf(family.toTag()) }
        return StoryPresetImportConversion(
            StoryPreset(
                id = "",
                name = value.cleanString("name").ifBlank { document.suggestedName() },
                modelFamily = family,
                modelTags = tags,
                profile = value.optJSONObject("profile")?.let(::profileFromJson) ?: StoryPresetProfile(),
                entries = value.optJSONArray("entries")
                    ?.objects()
                    ?.map(SettingLibraryJsonCodec::entryFromJson)
                    .orEmpty(),
                groups = value.optJSONArray("groups")
                    ?.objects()
                    ?.mapIndexed(SettingLibraryJsonCodec::groupFromJson)
                    .orEmpty(),
                regexRules = RegexRuleJsonCodec.decodeRules(value.optJSONArray("regex_rules")),
                promptPositions = value.optJSONArray("prompt_positions")
                    ?.objects()
                    ?.mapIndexed(SettingLibraryJsonCodec::promptPositionFromJson)
                    .orEmpty(),
                expandedGroupIds = value.optJSONArray("expanded_group_ids")?.strings().orEmpty(),
            ),
            authorAvatarPng = pngPayload?.authorAvatarPng,
        )
    }

    private fun decodeSillyTavern(document: StoryPresetImportDocument): StoryPresetImportConversion {
        val root = document.parseRoot("酒馆预设")
        val definitions = root.optJSONArray("prompts")
            ?.objects()
            ?.mapNotNull { prompt ->
                prompt.cleanString("identifier").takeIf(String::isNotBlank)?.let { it to prompt }
            }
            ?.toMap()
            .orEmpty()
        require(definitions.isNotEmpty()) { "酒馆预设没有 prompts 条目" }

        val promptOrder = root.optJSONArray("prompt_order")
            ?.objects()
            ?.firstOrNull { it.opt("character_id")?.toString() == SillyTavernGlobalPromptOrderId }
            ?.optJSONArray("order")
            ?: error("找不到酒馆预设外层条目顺序（100001）")

        val usedTitles = mutableSetOf<String>()
        var skipped = 0
        val entries = buildList {
            for (orderIndex in 0 until promptOrder.length()) {
                val orderEntry = promptOrder.optJSONObject(orderIndex)
                val identifier = orderEntry?.cleanString("identifier").orEmpty()
                val prompt = definitions[identifier]
                if (prompt == null || prompt.optBoolean("marker", false)) {
                    skipped += 1
                    continue
                }
                val requestedTitle = prompt.cleanString("name")
                    .ifBlank { "提示词 ${orderIndex + 1}" }
                add(
                    SettingLibraryEntry(
                        id = "tavern-preset-entry-${orderIndex + 1}",
                        title = uniqueTitle(requestedTitle, usedTitles),
                        groupId = SillyTavernPromptGroupId,
                        content = prompt.optString("content", ""),
                        agentSelectionHint = "酒馆预设常驻条目，Agent 必读",
                        agentReadStrategy = SettingLibraryAgentReadStrategy.Required,
                        triggerMode = SettingLibraryTriggerMode.AgentTool,
                        enabled = orderEntry?.optBoolean("enabled", true) ?: true,
                        insertRole = prompt.cleanString("role").toInsertRole(),
                        order = orderIndex + 1,
                        viewOrder = orderIndex + 1,
                        groupViewOrder = 1,
                        treeViewOrder = orderIndex + 1,
                    ),
                )
            }
        }
        require(entries.isNotEmpty()) { "酒馆预设外层列表没有可导入的提示词" }
        val group = SettingLibraryGroup(
            id = SillyTavernPromptGroupId,
            name = "酒馆提示词",
            order = 1,
            treeViewOrder = 1,
        )
        val regexRules = RegexRuleJsonCodec.decodeRules(
            root.optJSONObject("extensions")?.optJSONArray("regex_scripts")
                ?: root.optJSONArray("regex_scripts"),
        )
        return StoryPresetImportConversion(
            preset = StoryPreset(
                id = "",
                name = root.cleanString("name").ifBlank { document.suggestedName() },
                modelTags = listOf(StoryPresetModelFamily.General.toTag()),
                entries = entries,
                groups = listOf(group),
                regexRules = regexRules,
                expandedGroupIds = listOf(group.id),
            ),
            skippedUnsupportedEntries = skipped,
        )
    }

    private fun String.toInsertRole(): SettingLibraryInsertRole = when (lowercase()) {
        "user" -> SettingLibraryInsertRole.User
        "assistant" -> SettingLibraryInsertRole.Assistant
        else -> SettingLibraryInsertRole.System
    }

    private fun uniqueTitle(requested: String, used: MutableSet<String>): String {
        val base = requested.trim().take(120).ifBlank { "未命名提示词" }
        if (used.add(base.lowercase())) return base
        return generateSequence(2) { it + 1 }
            .map { suffix -> "$base ($suffix)".take(120) }
            .first { candidate -> used.add(candidate.lowercase()) }
    }

    private fun StoryPresetImportDocument.parseRoot(label: String): JSONObject = parseRoot(json, label)

    private fun parseRoot(json: String, label: String): JSONObject = runCatching {
        JSONObject(json)
    }.getOrElse { error ->
        throw IllegalArgumentException("$label JSON 已损坏", error)
    }

    private fun StoryPresetImportDocument.suggestedName(): String = fileName
        .replace(Regex("(?i)\\.(json|png)$"), "")
        .trim()
        .ifBlank { "导入预设" }

    private fun JSONObject.cleanString(key: String): String = optString(key, "")
        .takeUnless { it == "null" }
        .orEmpty()
        .trim()

    private fun JSONArray.objects(): List<JSONObject> = buildList {
        for (index in 0 until length()) optJSONObject(index)?.let(::add)
    }

    private fun JSONArray.strings(): List<String> = buildList {
        for (index in 0 until length()) optString(index).takeIf(String::isNotBlank)?.let(::add)
    }

    private fun modelTagToJson(tag: StoryPresetModelTag): JSONObject = JSONObject()
        .put("id", tag.id)
        .put("label", tag.label)
        .put("provider_id", tag.providerId)

    private fun modelTagFromJson(value: JSONObject): StoryPresetModelTag? {
        val id = value.cleanString("id")
        val label = value.cleanString("label")
        if (id.isBlank() || label.isBlank()) return null
        return StoryPresetModelTag(id, label, value.cleanString("provider_id"))
    }

    private fun profileToJson(profile: StoryPresetProfile): JSONObject = JSONObject()
        .put("author_name", profile.authorName)
        .put("tags", JSONArray(profile.tags))
        .put("description", profile.description)
        .put(
            "timeline",
            JSONArray(
                profile.timeline.map { item ->
                    JSONObject()
                        .put("id", item.id)
                        .put("title", item.title)
                        .put("date_label", item.dateLabel)
                        .put("note", item.note)
                },
            ),
        )

    private fun profileFromJson(value: JSONObject): StoryPresetProfile = StoryPresetProfile(
        authorName = value.cleanString("author_name"),
        tags = value.optJSONArray("tags")?.strings().orEmpty(),
        description = value.cleanString("description"),
        timeline = value.optJSONArray("timeline")
            ?.objects()
            ?.mapIndexedNotNull { index, item ->
                item.cleanString("title").takeIf(String::isNotBlank)?.let { title ->
                    StoryPresetTimelineItem(
                        id = item.cleanString("id").ifBlank { "timeline-${index + 1}" },
                        title = title,
                        dateLabel = item.cleanString("date_label"),
                        note = item.cleanString("note"),
                    )
                }
            }
            .orEmpty(),
    )
}
