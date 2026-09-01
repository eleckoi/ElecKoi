package com.eleckoi.android.feature.chat.data

import com.eleckoi.android.engine.agent.api.AgentApplySettingPatchTool
import com.eleckoi.android.engine.agent.api.AgentDeleteSettingDirectoryTool
import com.eleckoi.android.engine.agent.api.AgentDeleteSettingFileTool
import com.eleckoi.android.engine.agent.api.AgentDynamicTool
import com.eleckoi.android.engine.agent.api.AgentDynamicToolResult
import com.eleckoi.android.engine.agent.api.AgentEditSettingFileTool
import com.eleckoi.android.engine.agent.api.AgentMakeSettingDirectoryTool
import com.eleckoi.android.engine.agent.api.AgentMoveSettingDirectoryTool
import com.eleckoi.android.engine.agent.api.AgentMoveSettingFileTool
import com.eleckoi.android.engine.agent.api.AgentToolDefinition
import com.eleckoi.android.engine.agent.api.AgentWriteSettingFileTool
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryAgentEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibraryAgentTurnContext
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibrarySessionMutation
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.data.SettingLibrarySessionMutationResult
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

internal fun characterSettingLibraryMutationTools(
    contextProvider: suspend () -> SettingLibraryAgentTurnContext,
    applyChanges: suspend (List<SettingLibrarySessionMutation>) -> SettingLibrarySessionMutationResult,
): List<AgentDynamicTool> = listOf(
    settingFileMutationTool(
        name = AgentWriteSettingFileTool,
        operation = SettingMutationWriteFileOperation,
        description = "创建或完整覆盖一个当前对话的 UTF-8 虚拟设定文件。父目录不存在时自动创建。" +
            "现有文件会被整篇覆盖，因此应先读取现有文件；局部修改优先使用 edit。" +
            "不需要预先 mkdir。路径使用 / 分隔且不带 .md 后缀。",
        parameters = listOf(
            SettingFileToolParameter(SettingMutationContentArgument, "要写入的完整设定正文。", required = true),
            SettingFileToolParameter(SettingMutationSelectionHintArgument, "可选：供 AI 判断何时读取的简短注释。"),
        ),
        contextProvider = contextProvider,
        applyChanges = applyChanges,
    ),
    settingFileMutationTool(
        name = AgentEditSettingFileTool,
        operation = SettingMutationEditFileOperation,
        description = "通过精确的字面文本替换来局部修改一个现有 UTF-8 虚拟设定文件。" +
            "默认要求 old_string 在正文中只出现一次；出现多次时请提供更具体的文本，或将 replace_all 设为 true。" +
            "修改前应先读取文件。路径使用 / 分隔且不带 .md 后缀。",
        parameters = listOf(
            SettingFileToolParameter(SettingMutationOldStringArgument, "要替换的原文；必须精确匹配且不能为空。", required = true),
            SettingFileToolParameter(SettingMutationNewStringArgument, "替换后的文字；可为空以删除匹配内容。", required = true),
            SettingFileToolParameter(SettingMutationReplaceAllArgument, "是否替换全部匹配；默认 false。", type = "boolean"),
        ),
        contextProvider = contextProvider,
        applyChanges = applyChanges,
    ),
    settingFileMutationTool(
        name = AgentMakeSettingDirectoryTool,
        operation = SettingMutationMakeDirectoryOperation,
        description = "创建当前对话的虚拟设定目录及所有缺失的父目录；目录已存在时直接成功。",
        contextProvider = contextProvider,
        applyChanges = applyChanges,
    ),
    settingFileMutationTool(
        name = AgentMoveSettingFileTool,
        operation = SettingMutationMoveFileOperation,
        description = "移动或重命名一个虚拟设定文件，并自动创建目标父目录。目标文件默认覆盖。",
        parameters = listOf(
            SettingFileToolParameter(SettingMutationDestinationArgument, "目标完整路径。", required = true),
            SettingFileToolParameter(SettingMutationOverwriteArgument, "目标存在时是否覆盖；默认 true。", type = "boolean"),
        ),
        contextProvider = contextProvider,
        applyChanges = applyChanges,
    ),
    settingFileMutationTool(
        name = AgentMoveSettingDirectoryTool,
        operation = SettingMutationMoveDirectoryOperation,
        description = "移动或重命名一个虚拟设定目录，并自动创建目标父目录。",
        parameters = listOf(
            SettingFileToolParameter(SettingMutationDestinationArgument, "目标完整路径。", required = true),
        ),
        contextProvider = contextProvider,
        applyChanges = applyChanges,
    ),
    settingFileMutationTool(
        name = AgentDeleteSettingFileTool,
        operation = SettingMutationDeleteFileOperation,
        description = "删除一个当前对话的虚拟设定文件。",
        contextProvider = contextProvider,
        applyChanges = applyChanges,
    ),
    settingFileMutationTool(
        name = AgentDeleteSettingDirectoryTool,
        operation = SettingMutationDeleteDirectoryOperation,
        description = "递归删除一个当前对话的虚拟设定目录及其全部子目录和文件。",
        contextProvider = contextProvider,
        applyChanges = applyChanges,
    ),
)

/**
 * Single model-facing mutation surface for the setting library.
 *
 * The operation parser and catalog remain shared with the individual mutation implementations;
 * exposing this structured facade keeps the tool catalog small without dropping mkdir/move/delete.
 */
internal fun characterSettingLibraryPatchTool(
    contextProvider: suspend () -> SettingLibraryAgentTurnContext,
    applyChanges: suspend (List<SettingLibrarySessionMutation>) -> SettingLibrarySessionMutationResult,
): AgentDynamicTool = AgentDynamicTool(
    definition = AgentToolDefinition(
        name = AgentApplySettingPatchTool,
        description = "对当前对话的虚拟设定执行一个结构化文件操作。" +
            "支持 write_file、edit_file、make_directory、move_file、move_directory、delete_file、delete_directory；" +
            "路径使用 / 分隔且不带 .md 后缀，修改前应先用 glob/read 获取真实路径。" +
            "一次调用只执行一个操作，失败时不会提交任何变更。",
        parameters = buildJsonObject {
            put("type", "object")
            put("properties", buildJsonObject {
                put(SettingMutationOperationArgument, buildJsonObject {
                    put("type", "string")
                    put("enum", buildJsonArray {
                        SettingMutationOperations.forEach { add(JsonPrimitive(it)) }
                    })
                    put("description", "要执行的结构化文件操作。")
                })
                put(SettingMutationPathArgument, stringSchema("源路径或要操作的完整路径。"))
                put(SettingMutationDestinationArgument, stringSchema("移动操作的目标完整路径。"))
                put(SettingMutationContentArgument, stringSchema("write_file 要写入的完整正文。"))
                put(SettingMutationSelectionHintArgument, stringSchema("write_file 可选的读取提示。"))
                put(SettingMutationOldStringArgument, stringSchema("edit_file 要精确替换的非空原文。"))
                put(SettingMutationNewStringArgument, stringSchema("edit_file 替换后的文本，可为空。"))
                put(SettingMutationReplaceAllArgument, buildJsonObject {
                    put("type", "boolean")
                    put("description", "edit_file 是否替换全部匹配；默认 false。")
                })
                put(SettingMutationOverwriteArgument, buildJsonObject {
                    put("type", "boolean")
                    put("description", "move_file 目标存在时是否覆盖；默认 true。")
                })
            })
            put("required", buildJsonArray {
                add(JsonPrimitive(SettingMutationOperationArgument))
                add(JsonPrimitive(SettingMutationPathArgument))
            })
            put("additionalProperties", false)
        },
    ),
    handler = { arguments ->
        val operation = arguments.settingStringAllowBlank(SettingMutationOperationArgument)
            ?.takeIf(String::isNotBlank)
            ?: return@AgentDynamicTool invalidArguments("operation 必须是受支持的文件操作。")
        if (operation !in SettingMutationOperations) {
            return@AgentDynamicTool invalidArguments("不支持 operation：$operation")
        }
        executeSettingFileMutation(
            operation = operation,
            arguments = arguments,
            contextProvider = contextProvider,
            applyChanges = applyChanges,
        )
    },
)

private data class SettingFileToolParameter(
    val name: String,
    val description: String,
    val type: String = "string",
    val required: Boolean = false,
)

private fun settingFileMutationTool(
    name: String,
    operation: String,
    description: String,
    parameters: List<SettingFileToolParameter> = emptyList(),
    contextProvider: suspend () -> SettingLibraryAgentTurnContext,
    applyChanges: suspend (List<SettingLibrarySessionMutation>) -> SettingLibrarySessionMutationResult,
): AgentDynamicTool = AgentDynamicTool(
    definition = AgentToolDefinition(
        name = name,
        description = description + " 只保存当前对话差异，不修改作者基础设定。",
        parameters = buildJsonObject {
            put("type", "object")
            put("properties", buildJsonObject {
                put(SettingMutationPathArgument, stringSchema("源路径或要操作的完整路径；使用 / 分隔且不带 .md 后缀。"))
                parameters.forEach { parameter ->
                    put(parameter.name, buildJsonObject {
                        put("type", parameter.type)
                        put("description", parameter.description)
                    })
                }
            })
            put("required", buildJsonArray {
                add(JsonPrimitive(SettingMutationPathArgument))
                parameters.filter(SettingFileToolParameter::required).forEach { parameter ->
                    add(JsonPrimitive(parameter.name))
                }
            })
            put("additionalProperties", false)
        },
    ),
    handler = { arguments ->
        executeSettingFileMutation(
            operation = operation,
            arguments = arguments,
            contextProvider = contextProvider,
            applyChanges = applyChanges,
        )
    },
)

private suspend fun executeSettingFileMutation(
    operation: String,
    arguments: JsonObject,
    contextProvider: suspend () -> SettingLibraryAgentTurnContext,
    applyChanges: suspend (List<SettingLibrarySessionMutation>) -> SettingLibrarySessionMutationResult,
): AgentDynamicToolResult {
    val context = contextProvider()
    var catalog = SettingLibraryToolCatalog(
        entries = availableSettingLibraryEntries(context.readableEntries),
        groups = context.groups,
    )
    val payload = buildJsonObject {
        arguments.forEach { (name, value) -> put(name, value) }
        put(SettingMutationOperationArgument, operation)
    }
    val mutations = runCatching {
        payload.toSettingFileMutations(index = 0, catalog = catalog).also { parsed ->
            parsed.forEach { mutation -> catalog = catalog.after(mutation) }
            if (parsed.size > SettingMutationMaxChangesPerCall) {
                throw IllegalArgumentException(
                    "自动创建父目录后超过单次 $SettingMutationMaxChangesPerCall 项内部变更限制，请缩短路径。",
                )
            }
        }
    }.getOrElse { error ->
        return invalidArguments(error.message ?: "文件操作参数不正确。")
    }
    if (mutations.isEmpty()) {
        return AgentDynamicToolResult(
            content = settingFileOperationResult(operation, arguments, changed = false),
        )
    }
    runCatching { applyChanges(mutations) }.getOrElse { error ->
        return AgentDynamicToolResult(
            content = buildJsonObject {
                put("status", "change_rejected")
                put("message", error.message.orEmpty().take(SettingMutationMaxSearchErrorCharacters))
            }.toString(),
            success = false,
        )
    }
    return AgentDynamicToolResult(
        content = when (operation) {
            SettingMutationWriteFileOperation -> settingFileWriteResult(
                path = arguments.settingStringAllowBlank(SettingMutationPathArgument).orEmpty(),
            created = mutations.any { it is SettingLibrarySessionMutation.CreateEntry },
            )
            SettingMutationEditFileOperation -> settingFileEditResult(
                path = arguments.settingStringAllowBlank(SettingMutationPathArgument).orEmpty(),
                replaceAll = arguments.settingBoolean(SettingMutationReplaceAllArgument),
            )
            else -> settingFileOperationResult(operation, arguments, changed = true)
        },
    )
}

private fun settingFileWriteResult(path: String, created: Boolean): String = """
    <path>$path</path>
    <type>file</type>
    <content>
    ${if (created) "Created" else "Updated"} file
    </content>
""".trimIndent()

private fun settingFileEditResult(path: String, replaceAll: Boolean): String = if (replaceAll) {
    "The file $path has been updated. All occurrences were successfully replaced."
} else {
    "The file $path has been updated successfully."
}

private fun settingFileOperationResult(
    operation: String,
    arguments: JsonObject,
    changed: Boolean,
): String = buildJsonObject {
    put("status", "ok")
    put("scope", "current_conversation")
    arguments.settingStringAllowBlank(SettingMutationPathArgument)?.let { put("path", it) }
    if (operation == SettingMutationMoveFileOperation || operation == SettingMutationMoveDirectoryOperation) {
        arguments.settingStringAllowBlank(SettingMutationDestinationArgument)?.let { put("destination", it) }
    }
    put("changed", changed)
}.toString()

private fun stringSchema(description: String): JsonObject = buildJsonObject {
    put("type", "string")
    put("description", description)
}
