package com.eleckoi.android.engine.agent.adapter.request

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Isolates DSH's auxiliary compaction request from the interactive Agent request contract. */
internal object ResponsesCompactionRequestProjector {
    /**
     * Pi-AI currently drops DSH's request purpose before HTTP. Keep its stable native directive
     * signature isolated here until every bundled adapter emits the dedicated request header.
     */
    fun isNativeCompactionRequest(request: JsonObject): Boolean {
        val input = request["input"] as? JsonArray ?: return false
        val finalItem = input.lastOrNull() as? JsonObject ?: return false
        if (finalItem.string("role") != "user") return false
        return finalItem.textContent().trimStart().startsWith(NativeCompactionInstructionPrefix)
    }

    fun project(request: JsonObject, instructions: String?): JsonObject {
        val input = request["input"] as? JsonArray ?: return request
        val finalItem = input.lastOrNull() as? JsonObject ?: return request
        if (finalItem.string("role") != "user") return request
        val normalizedInstructions = instructions
            ?.trim()
            ?.takeIf(String::isNotEmpty)
            ?: finalItem.textContent().trim()
        if (normalizedInstructions.isEmpty()) return request

        val replacement = buildJsonObject {
            finalItem.forEach { (key, value) -> put(key, value) }
            put("content", buildJsonArray {
                add(buildJsonObject {
                    put("type", "input_text")
                    put(
                        "text",
                        "$PlainTextDirective\n\n$normalizedInstructions",
                    )
                })
            })
        }
        return buildJsonObject {
            request.forEach { (key, value) ->
                if (key !in InteractiveRequestFields) put(key, value)
            }
            put("instructions", PlainTextDirective)
            put("input", buildJsonArray {
                input.dropLast(1).forEach(::add)
                add(replacement)
            })
        }
    }

    private fun JsonObject.string(name: String): String? =
        (get(name) as? JsonPrimitive)?.contentOrNull

    private fun JsonObject.textContent(): String = when (val content = get("content")) {
        is JsonPrimitive -> content.contentOrNull.orEmpty()
        is JsonArray -> content.mapNotNull { element ->
            (element as? JsonObject)?.string("text")
        }.joinToString("\n")
        else -> ""
    }

    private const val NativeCompactionInstructionPrefix =
        "You are now acting as a compaction engine for this AI coding assistant."

    private const val PlainTextDirective =
        "你当前只执行内部历史压缩。只返回非空的纯文本摘要正文；不要调用工具，不要输出推理过程，也不要使用 <FINAL>、<ACTION_CALL> 等主对话协议标签。"

    private val InteractiveRequestFields = setOf(
        "instructions",
        "tools",
        "tool_choice",
        "parallel_tool_calls",
        "reasoning",
        "text",
    )
}
