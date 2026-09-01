package com.eleckoi.android.engine.agent.adapter

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull

internal data class ToolAccumulator(
    var id: String = "",
    val name: StringBuilder = StringBuilder(),
    val arguments: StringBuilder = StringBuilder(),
    var streamState: ToolStreamState? = null,
) {
    fun acceptId(value: String) {
        id = when {
            id.isBlank() -> value
            value == id -> id
            else -> id + value
        }
    }
}

internal data class ToolStreamState(
    val route: ResponsesToolRoute,
    val itemId: String,
    val callId: String,
    val outputIndex: Int,
    val customInputDecoder: StreamingCustomToolInputDecoder?,
    val streamedCustomInput: StringBuilder = StringBuilder(),
    var processedArgumentChars: Int = 0,
)

/** Decodes the `input` JSON string while Chat Completions arguments are still arriving. */
internal class StreamingCustomToolInputDecoder {
    private val header = StringBuilder()
    private var mode = Mode.Searching
    private var escaping = false
    private var unicodeDigitsRemaining = 0
    private var unicodeValue = 0

    fun accept(chunk: String): String {
        if (chunk.isEmpty() || mode == Mode.Done) return ""
        var value = chunk
        if (mode == Mode.Searching) {
            header.append(chunk)
            val match = CustomToolInputStart.find(header)
            if (match != null) {
                mode = Mode.JsonString
                value = header.substring(match.range.last + 1)
                header.clear()
            } else {
                val rawStart = header.indexOf("*** Begin Patch")
                if (rawStart >= 0 && header.substring(0, rawStart).isBlank()) {
                    mode = Mode.Raw
                    value = header.substring(rawStart)
                    header.clear()
                } else {
                    if (header.length > MaxCustomToolHeaderChars) {
                        header.delete(0, header.length - MaxCustomToolHeaderChars)
                    }
                    return ""
                }
            }
        }
        if (mode == Mode.Raw) return value

        val decoded = StringBuilder()
        for (character in value) {
            if (mode == Mode.Done) break
            if (unicodeDigitsRemaining > 0) {
                val digit = character.digitToIntOrNull(16)
                if (digit == null) {
                    mode = Mode.Done
                    break
                }
                unicodeValue = (unicodeValue shl 4) or digit
                unicodeDigitsRemaining -= 1
                if (unicodeDigitsRemaining == 0) {
                    decoded.append(unicodeValue.toChar())
                    unicodeValue = 0
                    escaping = false
                }
                continue
            }
            if (escaping) {
                when (character) {
                    '"', '\\', '/' -> decoded.append(character)
                    'b' -> decoded.append('\b')
                    'f' -> decoded.append('\u000C')
                    'n' -> decoded.append('\n')
                    'r' -> decoded.append('\r')
                    't' -> decoded.append('\t')
                    'u' -> {
                        unicodeDigitsRemaining = 4
                        unicodeValue = 0
                        continue
                    }
                    else -> {
                        mode = Mode.Done
                        break
                    }
                }
                escaping = false
                continue
            }
            when (character) {
                '\\' -> escaping = true
                '"' -> mode = Mode.Done
                else -> decoded.append(character)
            }
        }
        return decoded.toString()
    }

    private enum class Mode {
        Searching,
        JsonString,
        Raw,
        Done,
    }

    private companion object {
        const val MaxCustomToolHeaderChars = 512
        val CustomToolInputStart = Regex("\"input\"\\s*:\\s*\"")
    }
}

internal data class RoutedToolCall(
    val call: ToolAccumulator,
    val route: ResponsesToolRoute,
    val customInput: String?,
)

internal sealed class ActiveOutputItem(
    open val id: String,
    open val outputIndex: Int,
    open val content: StringBuilder,
) {
    data class Reasoning(
        override val id: String,
        override val outputIndex: Int,
        override val content: StringBuilder = StringBuilder(),
    ) : ActiveOutputItem(id, outputIndex, content)

    data class Message(
        override val id: String,
        override val outputIndex: Int,
        val declaredPhase: String?,
        override val content: StringBuilder = StringBuilder(),
    ) : ActiveOutputItem(id, outputIndex, content)
}

internal data class ChatCompletionUsage(
    val promptTokens: Int,
    val completionTokens: Int,
    val totalTokens: Int,
    val cacheReadTokens: Int?,
) {
    companion object {
        fun from(value: JsonObject): ChatCompletionUsage? {
            val prompt = (value["prompt_tokens"] as? JsonPrimitive)?.intOrNull ?: return null
            val completion = (value["completion_tokens"] as? JsonPrimitive)?.intOrNull ?: return null
            val total = (value["total_tokens"] as? JsonPrimitive)?.intOrNull
                ?: prompt.saturatingAdd(completion)
            val cacheRead = ((value["prompt_tokens_details"] as? JsonObject)
                ?.get("cached_tokens") as? JsonPrimitive)
                ?.intOrNull
                ?: (value["prompt_cache_hit_tokens"] as? JsonPrimitive)?.intOrNull
            return ChatCompletionUsage(
                promptTokens = prompt,
                completionTokens = completion,
                totalTokens = total,
                cacheReadTokens = cacheRead,
            )
        }
    }
}
