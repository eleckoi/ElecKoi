package com.eleckoi.android.engine.agent.adapter.request

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Keeps DSH's auxiliary history-summary call separate from interactive tools and protocols. */
internal object DshCompactionRequestProjector {
    fun project(request: JsonObject, instructions: String?): JsonObject {
        val messages = request["messages"] as? JsonArray ?: return request
        val finalMessage = messages.lastOrNull() as? JsonObject ?: return request
        if (finalMessage.string("role") != "user") return request
        val normalized = instructions?.trim()?.takeIf(String::isNotEmpty)
            ?: finalMessage.textContent().trim()
        if (normalized.isEmpty()) return request
        val replacement = buildJsonObject {
            finalMessage.forEach { (key, value) -> put(key, value) }
            put("content", buildJsonArray {
                add(buildJsonObject {
                    put("type", "text")
                    put("text", "$PlainTextDirective\n\n$normalized")
                })
            })
        }
        return buildJsonObject {
            request.forEach { (key, value) -> if (key !in InteractiveFields) put(key, value) }
            put("system", PlainTextDirective)
            put("messages", buildJsonArray {
                messages.dropLast(1).forEach(::add)
                add(replacement)
            })
        }
    }

    private fun JsonObject.textContent(): String =
        (get("content") as? JsonArray)
            ?.mapNotNull { part -> (part as? JsonObject)?.string("text") }
            ?.joinToString("\n")
            .orEmpty()

    private fun JsonObject.string(name: String): String? =
        (get(name) as? JsonPrimitive)?.contentOrNull

    private const val PlainTextDirective =
        "你当前只执行内部历史压缩。只返回非空的纯文本摘要正文；不要调用工具，不要输出推理过程，也不要使用 <FINAL>、<ACTION_CALL> 等主对话协议标签。"

    private val InteractiveFields = setOf("tools", "toolChoice", "stop")
}
