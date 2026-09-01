package com.eleckoi.android.engine.agent.adapter

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Converts Responses tool declarations, choices, calls, and failures to Chat equivalents. */
internal object ResponsesChatToolConverter {
    fun convert(elements: JsonArray): ResponsesChatToolConversion {
        val converted = mutableListOf<JsonObject>()
        val byChatName = linkedMapOf<String, ResponsesToolRoute>()
        val byResponseIdentity = linkedMapOf<String, ResponsesToolRoute>()

        fun addFunction(function: JsonElement, namespace: String?) {
            val tool = function as? JsonObject
                ?: throw ResponsesAdapterException("Responses tool 不是对象")
            if (tool.stringOrNull("type") != "function") {
                throw ResponsesAdapterException(
                    "namespace 内只支持 function 工具，收到：${tool.stringOrNull("type")}",
                )
            }
            val responseName = tool.requiredString("name")
            val chatName = if (namespace == null) responseName else namespaceChatName(namespace, responseName)
            if (byChatName.containsKey(chatName)) {
                throw ResponsesAdapterException("工具展开后名称冲突：$chatName")
            }
            val route = ResponsesToolRoute(
                chatName = chatName,
                namespace = namespace,
                responseName = responseName,
                kind = ResponsesToolKind.Function,
            )
            byChatName[chatName] = route
            byResponseIdentity[responseIdentity(namespace, responseName)] = route
            converted += convertFunction(tool, chatName)
        }

        fun addCustom(tool: JsonObject) {
            val responseName = tool.requiredString("name")
            if (!ChatToolName.matches(responseName)) {
                throw ResponsesAdapterException("custom 工具名无法转换为 Chat function：$responseName")
            }
            if (byChatName.containsKey(responseName)) {
                throw ResponsesAdapterException("工具展开后名称冲突：$responseName")
            }
            val route = ResponsesToolRoute(
                chatName = responseName,
                namespace = null,
                responseName = responseName,
                kind = ResponsesToolKind.Custom,
            )
            byChatName[responseName] = route
            byResponseIdentity[responseIdentity(namespace = null, responseName)] = route
            converted += convertCustom(tool, responseName)
        }

        elements.forEach { element ->
            val tool = element as? JsonObject
                ?: throw ResponsesAdapterException("Responses tool 不是对象")
            when (val type = tool.stringOrNull("type")) {
                "function" -> addFunction(tool, namespace = null)
                "custom" -> addCustom(tool)
                "namespace" -> {
                    val namespace = tool.requiredString("name")
                    tool.array("tools").forEach { child -> addFunction(child, namespace) }
                }
                "web_search" -> Unit
                else -> throw ResponsesAdapterException("当前 Chat Completions 上游暂不支持 Responses 工具：$type")
            }
        }
        return ResponsesChatToolConversion(converted, byChatName, byResponseIdentity)
    }

    fun convertChoice(value: JsonElement, tools: ResponsesChatToolConversion): JsonElement? {
        if (value is JsonPrimitive) return value
        val choice = value as? JsonObject ?: return value
        if (choice.stringOrNull("type") == "web_search") return null
        val choiceType = choice.stringOrNull("type")
        if (choiceType != "function" && choiceType != "custom") return value
        val responseName = choice.requiredString("name")
        return buildJsonObject {
            put("type", "function")
            put("function", buildJsonObject {
                put("name", tools.chatName(choice.stringOrNull("namespace"), responseName))
            })
        }
    }

    fun customArguments(input: String): String = buildJsonObject {
        put(CustomToolInputField, input)
    }.toString()

    fun classifyFailure(
        callId: String,
        toolName: String,
        output: String,
    ): ResponsesToolResultFailure? {
        val normalized = output.trim()
        if (normalized.isEmpty()) return null
        val code = when {
            normalized.startsWith("apply_patch verification failed:", ignoreCase = true) ->
                "apply_patch_verification_failed"
            normalized.startsWith("unsupported call:", ignoreCase = true) ->
                "unsupported_tool_call"
            normalized.startsWith("invalid patch", ignoreCase = true) -> "invalid_patch"
            normalized.startsWith("error:", ignoreCase = true) -> "custom_tool_error"
            else -> return null
        }
        return ResponsesToolResultFailure(
            callId = callId,
            toolName = toolName,
            code = code,
            message = normalized.lineSequence().firstOrNull().orEmpty().take(MaxToolFailureMessageChars),
            outputChars = output.length,
        )
    }

    private fun convertFunction(element: JsonObject, chatName: String): JsonObject = buildJsonObject {
        put("type", "function")
        put("function", buildJsonObject {
            put("name", chatName)
            element.stringOrNull("description")?.let { put("description", it) }
            put("parameters", element["parameters"] ?: JsonObject(emptyMap()))
        })
    }

    private fun convertCustom(element: JsonObject, chatName: String): JsonObject = buildJsonObject {
        put("type", "function")
        put("function", buildJsonObject {
            put("name", chatName)
            put(
                "description",
                listOf(
                    element.stringOrNull("description").orEmpty(),
                    customToolBridgeInstructions(chatName),
                ).filter(String::isNotBlank).joinToString("\n"),
            )
            put("parameters", buildJsonObject {
                put("type", "object")
                put("properties", buildJsonObject {
                    put(CustomToolInputField, buildJsonObject {
                        put("type", "string")
                        put("description", customToolInputDescription(chatName))
                        if (chatName == ApplyPatchToolName) put("pattern", "^\\*\\*\\* Begin Patch")
                    })
                })
                put("required", buildJsonArray { add(JsonPrimitive(CustomToolInputField)) })
                put("additionalProperties", false)
            })
        })
    }

    private fun customToolBridgeInstructions(chatName: String): String {
        if (chatName != ApplyPatchToolName) {
            return "这是自由文本工具。调用时把完整原始输入放进 input 字段，不要再包命令名。"
        }
        return """
            这是严格补丁工具，不是自然语言任务入口。input 必须直接放完整补丁文本，不能放“创建文件”之类的说明，也不能再包命令名或 JSON。
            第一行必须是 *** Begin Patch，最后一行必须是 *** End Patch。中间使用 *** Add File:、*** Update File: 或 *** Delete File:；新增内容每行以 + 开头。
            示例：
            *** Begin Patch
            *** Add File: index.html
            +<html></html>
            *** End Patch
            写入或修改工作区文件时优先使用本工具，不要改用 cat、heredoc、echo 或 shell 重定向。
        """.trimIndent()
    }

    private fun customToolInputDescription(chatName: String): String =
        if (chatName == ApplyPatchToolName) {
            "完整原始补丁；必须以 *** Begin Patch 开头、以 *** End Patch 结尾，不能是自然语言说明"
        } else {
            "自由文本工具的完整原始输入"
        }

    private fun namespaceChatName(namespace: String, responseName: String): String {
        val value = "${namespace.trimEnd('_')}__${responseName}"
        if (!ChatToolName.matches(value)) {
            throw ResponsesAdapterException("namespace 工具名无法转换为 Chat function：$namespace.$responseName")
        }
        return value
    }

    private fun responseIdentity(namespace: String?, responseName: String): String =
        "${namespace.orEmpty()}\u0000$responseName"

    private fun JsonObject.requiredString(name: String): String = stringOrNull(name)
        ?.takeIf(String::isNotBlank)
        ?: throw ResponsesAdapterException("Responses 字段 $name 不能为空")

    private fun JsonObject.stringOrNull(name: String): String? =
        (get(name) as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.array(name: String): JsonArray =
        get(name) as? JsonArray ?: JsonArray(emptyList())

    private const val ApplyPatchToolName = "apply_patch"
    private const val CustomToolInputField = "input"
    private const val MaxToolFailureMessageChars = 320
    private val ChatToolName = Regex("^[A-Za-z0-9_-]{1,64}$")
}

internal data class ResponsesChatToolConversion(
    val tools: List<JsonObject>,
    val routesByChatName: Map<String, ResponsesToolRoute>,
    private val routesByResponseIdentity: Map<String, ResponsesToolRoute>,
) {
    fun chatName(namespace: String?, responseName: String): String =
        routesByResponseIdentity[responseIdentity(namespace, responseName)]?.chatName
            ?: if (namespace == null) responseName else fallbackNamespaceChatName(namespace, responseName)

    fun route(namespace: String?, responseName: String): ResponsesToolRoute? =
        routesByResponseIdentity[responseIdentity(namespace, responseName)]

    private fun responseIdentity(namespace: String?, responseName: String): String =
        "${namespace.orEmpty()}\u0000$responseName"

    private fun fallbackNamespaceChatName(namespace: String, responseName: String): String {
        val value = "${namespace.trimEnd('_')}__${responseName}"
        if (!ChatToolName.matches(value)) {
            throw ResponsesAdapterException("namespace 工具名无法转换为 Chat function：$namespace.$responseName")
        }
        return value
    }

    private companion object {
        val ChatToolName = Regex("^[A-Za-z0-9_-]{1,64}$")
    }
}
