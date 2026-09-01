package com.eleckoi.android.feature.chat.ui.variables

import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.feature.chat.model.MessageRole
import com.eleckoi.android.feature.chat.model.OpeningMessageId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

internal data class VariableStateDocument(
    val rawJson: String,
    val root: JsonObject?,
    val errorMessage: String = "",
) {
    val topLevelCount: Int
        get() = root?.size ?: 0

    val valueCount: Int
        get() = root?.values?.sumOf { it.variableLeafCount() } ?: 0

    val isEmpty: Boolean
        get() = root?.isEmpty() != false
}

internal data class VariableFloorSnapshot(
    val id: String,
    val label: String,
    val messagePreview: String,
    val createdAt: String,
    val state: VariableStateDocument,
    val changedValueCount: Int,
    val changedPaths: Set<String>,
)

internal data class VariableViewerTimeline(
    val current: VariableStateDocument,
    val floors: List<VariableFloorSnapshot>,
)

/**
 * Builds the author-facing variable history from the durable snapshot on every assistant floor.
 *
 * Old ledgers can contain a floor without a snapshot. Carrying the preceding value forward is the
 * truthful state at that floor and lets the viewer cover the whole conversation instead of silently
 * dropping older messages. User messages are not floors because variable tools commit with the
 * assistant turn that invoked them.
 */
internal fun buildVariableViewerTimeline(
    messages: List<ChatMessage>,
    initialStateJson: String,
    currentStateJson: String,
): VariableViewerTimeline {
    var carriedRaw = initialStateJson.ifBlank { EmptyVariableStateJson }
    var previous = parseVariableStateDocument(carriedRaw)
    var numberedFloor = 0
    val floors = buildList {
        messages.forEach { message ->
            if (message.role != MessageRole.Assistant || message.pending) return@forEach

            val rawAtFloor = message.variableStateJson.ifBlank { carriedRaw }
            val stateAtFloor = parseVariableStateDocument(rawAtFloor)
            val isOpening = message.id == OpeningMessageId
            val previousRoot = previous.root
            val changedPaths = if (isOpening) {
                emptySet()
            } else {
                changedVariablePaths(previousRoot, stateAtFloor.root)
            }
            if (message.variableStateJson.isNotBlank()) carriedRaw = message.variableStateJson
            if (message.id != OpeningMessageId) numberedFloor += 1
            add(
                VariableFloorSnapshot(
                    id = message.id,
                    label = if (message.id == OpeningMessageId) "开场" else "第 ${numberedFloor} 楼",
                    messagePreview = message.content.variableFloorPreview(),
                    createdAt = message.createdAt,
                    state = stateAtFloor,
                    changedValueCount = if (isOpening) {
                        0
                    } else {
                        countVariableChanges(previousRoot, stateAtFloor.root)
                    },
                    changedPaths = changedPaths,
                ),
            )
            previous = stateAtFloor
        }
    }
    val currentRaw = currentStateJson.ifBlank {
        floors.lastOrNull()?.state?.rawJson.orEmpty().ifBlank { carriedRaw }
    }
    return VariableViewerTimeline(
        current = parseVariableStateDocument(currentRaw),
        floors = floors,
    )
}

internal fun parseVariableStateDocument(rawJson: String): VariableStateDocument {
    val normalized = rawJson.ifBlank { EmptyVariableStateJson }
    return runCatching { VariableViewerJson.parseToJsonElement(normalized) }
        .fold(
            onSuccess = { element ->
                val root = element as? JsonObject
                if (root != null) {
                    VariableStateDocument(rawJson = normalized, root = root)
                } else {
                    VariableStateDocument(
                        rawJson = normalized,
                        root = null,
                        errorMessage = "变量快照的根节点不是对象",
                    )
                }
            },
            onFailure = {
                VariableStateDocument(
                    rawJson = normalized,
                    root = null,
                    errorMessage = "变量快照无法解析",
                )
            },
        )
}

internal fun countVariableChanges(previous: JsonElement?, current: JsonElement?): Int {
    if (previous == current) return 0
    if (previous == null) return current.variableLeafCount().coerceAtLeast(1)
    if (current == null) return previous.variableLeafCount().coerceAtLeast(1)
    return when {
        previous is JsonObject && current is JsonObject -> {
            (previous.keys + current.keys).sumOf { key ->
                countVariableChanges(previous[key], current[key])
            }
        }
        previous is JsonArray && current is JsonArray -> 1
        else -> 1
    }
}

/** Paths of variable values that exist in [current] and changed from [previous]. */
internal fun changedVariablePaths(
    previous: JsonElement?,
    current: JsonElement?,
): Set<String> = buildSet {
    collectChangedVariablePaths(
        previous = previous,
        current = current,
        path = "",
        output = this,
    )
}

private fun collectChangedVariablePaths(
    previous: JsonElement?,
    current: JsonElement?,
    path: String,
    output: MutableSet<String>,
) {
    if (previous == current || current == null) return
    when {
        current is JsonArray -> if (path.isNotBlank()) output += path
        previous is JsonObject && current is JsonObject -> {
            current.forEach { (key, value) ->
                collectChangedVariablePaths(
                    previous = previous[key],
                    current = value,
                    path = variablePath(path, key),
                    output = output,
                )
            }
        }
        current is JsonObject -> current.forEach { (key, value) ->
            collectChangedVariablePaths(
                previous = null,
                current = value,
                path = variablePath(path, key),
                output = output,
            )
        }
        path.isNotBlank() -> output += path
    }
}

internal fun variablePath(parent: String, key: String): String =
    "$parent/${key.replace("~", "~0").replace("/", "~1")}"

internal fun JsonElement.isVariableContainer(): Boolean = this is JsonObject

/** Value text shown to authors. Object groups deliberately have no trailing value. */
internal fun JsonElement.variableDisplayValue(): String? = when (this) {
    is JsonObject -> null
    is JsonArray -> joinToString(prefix = "[", postfix = "]", separator = ", ") { it.toString() }
    JsonNull -> "未设置"
    is JsonPrimitive -> if (isString) content.ifBlank { "未设置" } else content
}

private fun JsonElement?.variableLeafCount(): Int = when (this) {
    null -> 0
    is JsonObject -> values.sumOf { it.variableLeafCount() }
    is JsonArray -> 1
    else -> 1
}

private fun String.variableFloorPreview(): String {
    val excerpt = lineSequence()
        .map(String::trim)
        .firstOrNull(String::isNotBlank)
        .orEmpty()
        .replace(Whitespace, " ")
        .take(FloorPreviewLimit)
        .trimEnd('…')
    return if (excerpt.isBlank()) "" else "$excerpt……"
}

private val VariableViewerJson = Json { isLenient = true }
private val Whitespace = Regex("\\s+")
private const val EmptyVariableStateJson = "{}"
private const val FloorPreviewLimit = 42
