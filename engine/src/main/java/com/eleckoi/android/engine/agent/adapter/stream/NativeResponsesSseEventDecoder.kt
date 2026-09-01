package com.eleckoi.android.engine.agent.adapter

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** Decodes a native Responses SSE stream into the same typed events used by ReplayBuffer. */
internal class NativeResponsesSseEventDecoder(
    private val json: Json = Json,
) {
    private var eventType = ""
    private val dataLines = mutableListOf<String>()

    fun acceptLine(line: String): List<ResponsesSseEvent> = when {
        line.isEmpty() -> emitPending().let(::listOfNotNull)
        line.startsWith("event:") -> {
            eventType = line.removePrefix("event:").trim()
            emptyList()
        }
        line.startsWith("data:") -> {
            dataLines += line.removePrefix("data:").trimStart()
            emptyList()
        }
        line.startsWith(":") || line.startsWith("id:") || line.startsWith("retry:") -> emptyList()
        else -> emptyList()
    }

    fun finish(): List<ResponsesSseEvent> = emitPending().let(::listOfNotNull)

    private fun emitPending(): ResponsesSseEvent? {
        if (dataLines.isEmpty()) {
            eventType = ""
            return null
        }
        val payloadText = dataLines.joinToString("\n")
        dataLines.clear()
        // Some compatibility gateways append the Chat Completions terminator to Responses streams.
        // It can also append a non-standard cost ping after response.completed. Neither is a
        // Responses event, so do not forward them to the Harness-native stream parser.
        if (payloadText.trim() == "[DONE]") {
            eventType = ""
            return null
        }
        val payload = json.parseToJsonElement(payloadText) as? JsonObject
            ?: error("Responses SSE data 不是 JSON 对象")
        val payloadType = (payload["type"] as? JsonPrimitive)?.contentOrNull.orEmpty()
        val resolvedType = payloadType.ifBlank { eventType }
        eventType = ""
        require(resolvedType.isNotBlank()) { "Responses SSE 事件缺少 type" }
        if (resolvedType == "ping") return null
        return ResponsesSseEvent(type = resolvedType, payload = payload)
    }
}
