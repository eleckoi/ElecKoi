package com.eleckoi.android.engine.agent.deepseek.protocol

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Encodes persisted ElecKoi history into the message shape accepted by the DSH protocol. */
internal object DeepSeekHistoryEncoding {
    fun responseMessage(role: String, text: String): String {
        require(role == "user" || role == "assistant") { "Agent 历史消息角色无效" }
        return buildJsonObject {
            put("type", "message")
            put("role", role)
            put("content", buildJsonArray {
                add(buildJsonObject {
                    put("type", if (role == "assistant") "output_text" else "input_text")
                    put("text", text)
                })
            })
        }.toString()
    }
}
