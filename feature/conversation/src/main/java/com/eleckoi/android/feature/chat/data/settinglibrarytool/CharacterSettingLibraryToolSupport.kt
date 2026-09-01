package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentDynamicToolResult
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryAgentEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.settingLibrarySafePathSegment
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

internal fun availableSettingLibraryEntries(
    entries: List<SettingLibraryAgentEntry>,
): List<SettingLibraryAgentEntry> = entries.asSequence()
    .filter { entry ->
        entry.id.isNotBlank() &&
            entry.path.normalizedSettingPath().isNotBlank() &&
            entry.content.isNotBlank()
    }
    .distinctBy(SettingLibraryAgentEntry::id)
    .toList()

internal fun normalizeSettingLibraryPath(value: String, allowRoot: Boolean): String? {
    val segments = value
        .trim()
        .replace('\\', '/')
        .trim('/')
        .split('/')
        .filter(String::isNotBlank)
        .map(String::trim)
    if (segments.isEmpty()) return if (allowRoot) "" else null
    if (
        segments.any { segment ->
            segment == "." || segment == ".." ||
                settingLibrarySafePathSegment(segment) != segment
        }
    ) {
        return null
    }
    return segments.joinToString("/")
}

internal fun String.normalizedSettingPath(): String =
    normalizeSettingLibraryPath(this, allowRoot = true).orEmpty()

internal fun String.normalizedGroupPath(): String = normalizedSettingPath()

internal fun String.normalizedSelectionHint(): String =
    replace(WhitespacePattern, " ").trim().take(MaxSelectionHintCharacters)

internal fun String.literalOccurrenceCount(needle: String): Int {
    var count = 0
    var startIndex = 0
    while (startIndex <= length - needle.length) {
        val matchIndex = indexOf(needle, startIndex)
        if (matchIndex < 0) break
        count += 1
        startIndex = matchIndex + needle.length
    }
    return count
}

internal fun JsonObject.settingString(name: String): String? =
    (get(name) as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank)

internal fun JsonObject.settingStringAllowBlank(name: String): String? =
    (get(name) as? JsonPrimitive)?.contentOrNull

internal fun JsonObject.settingStringArray(name: String): List<String> =
    (get(name) as? JsonArray)
        .orEmpty()
        .mapNotNull { value -> (value as? JsonPrimitive)?.contentOrNull?.takeIf(String::isNotBlank) }

internal fun JsonObject.settingBoolean(name: String, default: Boolean = false): Boolean =
    (get(name) as? JsonPrimitive)
        ?.contentOrNull
        ?.equals("true", ignoreCase = true)
        ?: default

internal fun invalidArguments(message: String): AgentDynamicToolResult = AgentDynamicToolResult(
    content = buildJsonObject {
        put("status", "invalid_arguments")
        put("message", message)
    }.toString(),
    success = false,
)

internal fun invalidPath(
    message: String = "path 必须是虚拟设定库中真实存在的目录；不要把设定标题或剧情关键词当成目录。",
): AgentDynamicToolResult = AgentDynamicToolResult(
    content = buildJsonObject {
        put("status", "invalid_path")
        put("message", message)
    }.toString(),
    success = false,
)

internal const val SettingLibraryPathsArgument = "paths"

private const val MaxSelectionHintCharacters = 200
private val WhitespacePattern = Regex("\\s+")
