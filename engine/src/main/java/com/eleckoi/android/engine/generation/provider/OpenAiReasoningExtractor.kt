package com.eleckoi.android.engine.generation.provider

import org.json.JSONArray
import org.json.JSONObject

/** Normalizes explicit reasoning fields used by OpenAI-compatible chat-completions gateways. */
internal object OpenAiReasoningExtractor {
    fun fromChoiceResponse(value: JSONObject): String {
        val choice = value.optJSONArray("choices")?.optJSONObject(0) ?: return ""
        val payload = choice.optJSONObject("delta") ?: choice.optJSONObject("message") ?: return ""
        return fromPayload(payload)
    }

    fun fromPayload(payload: JSONObject): String {
        val keys = arrayOf(
            "reasoning_content",
            "reasoning",
            "analysis",
            "thinking",
            "reasoning_details",
        )
        for (key in keys) {
            val text = valueText(payload.opt(key))
            if (text.isNotEmpty()) return text
        }
        return ""
    }

    private fun valueText(value: Any?): String = when (value) {
        is String -> value
        is JSONArray -> buildString {
            for (index in 0 until value.length()) append(valueText(value.opt(index)))
        }
        is JSONObject -> {
            val directKeys = arrayOf("text", "content", "summary")
            directKeys.firstNotNullOfOrNull { key ->
                valueText(value.opt(key)).takeIf(String::isNotEmpty)
            }.orEmpty()
        }
        else -> ""
    }
}
