package com.eleckoi.android.feature.characters.modes.story.presets.data.storage

import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetModelFamily
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetModelTag
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetProfile
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPresetTimelineItem
import com.eleckoi.android.feature.characters.modes.story.presets.model.toTag
import org.json.JSONArray
import org.json.JSONObject

internal object StoryPresetMetadataCodec {
    fun encodeModelTags(tags: List<StoryPresetModelTag>): String = JSONArray().apply {
        tags.forEach { tag ->
            put(
                JSONObject()
                    .put("id", tag.id)
                    .put("label", tag.label)
                    .put("providerId", tag.providerId),
            )
        }
    }.toString()

    fun decodeModelTags(json: String, fallbackFamily: String): List<StoryPresetModelTag> {
        val tags = runCatching { JSONArray(json) }.getOrDefault(JSONArray()).let { array ->
            buildList {
                for (index in 0 until array.length()) {
                    val value = array.optJSONObject(index) ?: continue
                    val id = value.optString("id").trim()
                    val label = value.optString("label").trim()
                    if (id.isNotBlank() && label.isNotBlank()) {
                        add(StoryPresetModelTag(id, label, value.optString("providerId").trim()))
                    }
                }
            }
        }
        return tags.ifEmpty { listOf(StoryPresetModelFamily.fromStorage(fallbackFamily).toTag()) }
    }

    fun encodeStringList(values: List<String>): String = JSONArray(values).toString()

    fun encodeTimeline(items: List<StoryPresetTimelineItem>): String = JSONArray().apply {
        items.forEach { item ->
            put(
                JSONObject()
                    .put("id", item.id)
                    .put("title", item.title)
                    .put("dateLabel", item.dateLabel)
                    .put("note", item.note),
            )
        }
    }.toString()

    fun decodeProfile(
        authorName: String,
        authorAvatarPath: String,
        authorTagsJson: String,
        description: String,
        timelineJson: String,
    ): StoryPresetProfile = StoryPresetProfile(
        authorName = authorName,
        authorAvatarPath = authorAvatarPath,
        tags = decodeStringList(authorTagsJson),
        description = description,
        timeline = decodeTimeline(timelineJson),
    )

    private fun decodeStringList(json: String): List<String> =
        runCatching { JSONArray(json) }.getOrDefault(JSONArray()).let { array ->
            buildList {
                for (index in 0 until array.length()) {
                    array.optString(index).trim().takeIf(String::isNotBlank)?.let(::add)
                }
            }
        }

    private fun decodeTimeline(json: String): List<StoryPresetTimelineItem> =
        runCatching { JSONArray(json) }.getOrDefault(JSONArray()).let { array ->
            buildList {
                for (index in 0 until array.length()) {
                    val value = array.optJSONObject(index) ?: continue
                    val title = value.optString("title").trim()
                    if (title.isNotBlank()) {
                        add(
                            StoryPresetTimelineItem(
                                id = value.optString("id").ifBlank { "timeline-$index" },
                                title = title,
                                dateLabel = value.optString("dateLabel").trim(),
                                note = value.optString("note").trim(),
                            ),
                        )
                    }
                }
            }
        }
}
