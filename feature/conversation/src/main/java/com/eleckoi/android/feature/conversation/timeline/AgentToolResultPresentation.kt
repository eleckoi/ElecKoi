package com.eleckoi.android.feature.conversation.timeline

import com.eleckoi.android.engine.agent.api.AgentCallCreatorCapabilityTool
import com.eleckoi.android.engine.agent.api.AgentGlobSettingFilesTool
import com.eleckoi.android.engine.agent.api.AgentGlobVariablesTool
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

fun CreationTimelineItem.creatorGeneratedMediaResult(): CreatorGeneratedMediaResult? {
    if (toolName != AgentCallCreatorCapabilityTool || failed || running) return null
    val call = toolArguments.jsonObjectOrNull() ?: return null
    if (call.string("capability_id") != "character_media.generate_asset") return null
    val result = detail.jsonObjectOrNull() ?: return null
    if (result.string("status") != "generated") return null
    val asset = result["asset"] as? JsonObject ?: return null
    val assetId = asset.string("assetId")?.takeIf(String::isNotBlank) ?: return null
    return CreatorGeneratedMediaResult(
        assetId = assetId,
        displayName = asset.string("displayName").orEmpty().ifBlank { "NovelAI 候选图" },
        width = asset.primitive("width")?.contentOrNull?.toIntOrNull()?.coerceAtLeast(1) ?: 1,
        height = asset.primitive("height")?.contentOrNull?.toIntOrNull()?.coerceAtLeast(1) ?: 1,
    )
}

fun activePlanUpdateId(
    items: List<CreationTimelineItem>,
    turnRunning: Boolean,
): String? = if (turnRunning) {
    items.lastOrNull { item -> item.toolName in AgentPlanToolNames }?.id
} else {
    null
}

fun parseSettingEntryToolResult(value: String): List<SettingEntryToolResult> =
    (value.jsonObjectOrNull()?.get("files") as? JsonArray)
        .orEmpty()
        .mapNotNull { element ->
            val entry = element as? JsonObject ?: return@mapNotNull null
            val entryId = entry.string("path")?.takeIf(String::isNotBlank)
                ?: return@mapNotNull null
            SettingEntryToolResult(
                entryId = entryId,
                groupPath = entry.string("group_path").orEmpty(),
                title = entry.string("title").orEmpty().ifBlank { entryId },
                selectionHint = entry.string("selection_hint").orEmpty(),
                readStrategy = entry.string("read_strategy").orEmpty(),
                content = entry.string("content").orEmpty().let { content ->
                    if (entry.primitive("line_numbered")?.contentOrNull == "true") {
                        content.withLineNumbersRemoved()
                    } else {
                        content
                    }
                },
                truncated = entry.primitive("truncated")?.contentOrNull == "true",
                autoIncluded = entry.primitive("auto_included")?.contentOrNull == "true",
                resolvedReferences = (entry["resolved_references"] as? JsonArray)
                    .orEmpty()
                    .mapNotNull { referenceElement ->
                        val reference = referenceElement as? JsonObject ?: return@mapNotNull null
                        val title = reference.string("title").orEmpty()
                        val path = reference.string("path").orEmpty()
                        if (title.isBlank() && path.isBlank()) return@mapNotNull null
                        SettingReferenceToolResult(
                            title = title.ifBlank { settingLibraryResultDisplayName(path) },
                            path = path,
                        )
                    },
            )
        }

fun settingLibraryResultDisplayName(path: String): String =
    path.substringAfterLast('/').ifBlank { path }

fun parseVariableEntryToolResult(value: String): List<VariableEntryToolResult> =
    (value.jsonObjectOrNull()?.get("variables") as? JsonArray)
        .orEmpty()
        .mapNotNull { element ->
            val entry = element as? JsonObject ?: return@mapNotNull null
            val path = entry.string("path")?.takeIf(String::isNotBlank)
                ?: return@mapNotNull null
            VariableEntryToolResult(
                path = path,
                type = entry.string("type").orEmpty(),
                defaultValue = entry.displayValue("default"),
                currentValue = entry.displayValue("current"),
                description = entry.string("description").orEmpty(),
                updateRule = entry.string("update_rule").orEmpty(),
            )
        }

fun parseAgentGlobToolResult(
    toolName: String,
    value: String,
): AgentGlobToolResult? {
    if (toolName !in setOf(
            AgentGlobSettingFilesTool,
            AgentGlobVariablesTool,
        )
    ) return null
    val payload = value.jsonObjectOrNull() ?: return null
    if (payload.string("status") !in setOf("ok", "no_matches")) return null
    val paths = if (toolName != AgentGlobVariablesTool) {
        ((payload["entries"] ?: payload["matches"]) as? JsonArray)
            .orEmpty()
            .mapNotNull { element -> (element as? JsonObject)?.string("path") }
            .filter(String::isNotBlank)
    } else {
        (payload["paths"] as? JsonArray)
            .orEmpty()
            .mapNotNull { element -> (element as? JsonPrimitive)?.contentOrNull }
            .filter(String::isNotBlank)
    }
    val omitted = payload.primitive("omitted")?.contentOrNull?.toIntOrNull() ?: 0
    val requiredEntries = (payload["required_entries"] as? JsonArray).orEmpty()
        .mapNotNull { it as? JsonObject }
    val requiredPaths = requiredEntries
        .mapNotNull { entry -> entry.string("path") }
        .filter(String::isNotBlank)
        .distinct()
    val pathDetails = buildMap {
        ((payload["entries"] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject } + requiredEntries)
            .forEach { entry ->
                val path = entry.string("path")?.takeIf(String::isNotBlank) ?: return@forEach
                put(
                    path,
                    AgentGlobPathDetail(
                        readStrategy = entry.string("read_strategy").orEmpty(),
                        selectionHint = entry.string("selection_hint").orEmpty(),
                    ),
                )
            }
    }
    return AgentGlobToolResult(
        scope = payload.string("path").orEmpty().ifBlank { "全部" },
        pattern = payload.string("pattern").orEmpty(),
        paths = paths,
        requiredPaths = requiredPaths,
        truncated = payload.primitive("truncated")?.contentOrNull == "true" || omitted > 0,
        omitted = omitted,
        pathDetails = pathDetails,
    )
}
