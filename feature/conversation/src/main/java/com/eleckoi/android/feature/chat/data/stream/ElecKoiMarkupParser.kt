package com.eleckoi.android.feature.chat.data.stream

import com.eleckoi.android.feature.chat.model.content.ChatContentBlock
import com.eleckoi.android.feature.chat.model.content.ReasoningState
import com.eleckoi.android.feature.chat.model.content.ToolCallState

object ElecKoiMarkupParser {
    private val OpenTagPattern = Regex(
        """<(think|thinking|tool|tool_result)(?:\s+[^>]*)?>""",
        RegexOption.IGNORE_CASE,
    )
    private val AttributePattern = Regex("""([\w-]+)\s*=\s*["']([^"']*)["']""")

    fun parse(raw: String, streaming: Boolean = false): List<ChatContentBlock> {
        if (raw.isEmpty()) return emptyList()
        val blocks = mutableListOf<ChatContentBlock>()
        var cursor = 0
        var ordinal = 0

        while (cursor < raw.length) {
            val open = OpenTagPattern.find(raw, cursor) ?: run {
                addText(blocks, raw.substring(cursor), ordinal)
                break
            }
            if (open.range.first > cursor) {
                addText(blocks, raw.substring(cursor, open.range.first), ordinal++)
            }

            val tag = open.groupValues[1].lowercase()
            val close = findClosingTag(raw, tag, open.range.last + 1)
            val bodyEnd = close?.first ?: raw.length
            val body = raw.substring(open.range.last + 1, bodyEnd).trim()
            val attributes = parseAttributes(open.value)
            val isComplete = close != null
            val id = attributes["id"] ?: "$tag-$ordinal"

            when (tag) {
                "think", "thinking" -> blocks += ChatContentBlock.Reasoning(
                    id = id,
                    content = body,
                    state = if (isComplete || !streaming) ReasoningState.Completed else ReasoningState.Running,
                )

                "tool" -> blocks += ChatContentBlock.ToolCall(
                    id = "tool-$id",
                    callId = id,
                    name = attributes["name"].orEmpty().ifBlank { "工具调用" },
                    arguments = body,
                    state = if (isComplete) ToolCallState.Running else ToolCallState.Pending,
                )

                "tool_result" -> mergeToolResult(
                    blocks = blocks,
                    callId = attributes["call_id"] ?: attributes["id"] ?: id,
                    result = body,
                    succeeded = attributes["status"]?.equals("failed", ignoreCase = true) != true,
                )
            }

            ordinal++
            if (close == null) break
            cursor = close.last + 1
        }
        return blocks
    }

    internal fun hasSupportedOpenTag(raw: String, fromIndex: Int = 0): Boolean =
        OpenTagPattern.find(raw, fromIndex.coerceIn(0, raw.length)) != null

    private fun addText(blocks: MutableList<ChatContentBlock>, value: String, ordinal: Int) {
        if (value.isBlank()) return
        val withoutTagSeparator = value.trimStart('\r', '\n')
        if (withoutTagSeparator.isNotBlank()) {
            blocks += ChatContentBlock.Text(id = "text-$ordinal", markdown = withoutTagSeparator)
        }
    }

    private fun parseAttributes(openTag: String): Map<String, String> {
        return AttributePattern.findAll(openTag).associate { match ->
            match.groupValues[1].lowercase() to match.groupValues[2]
        }
    }

    private fun findClosingTag(raw: String, tag: String, fromIndex: Int): IntRange? {
        val prefix = "</$tag"
        var searchFrom = fromIndex
        while (searchFrom < raw.length) {
            val start = raw.indexOf(prefix, searchFrom, ignoreCase = true)
            if (start < 0) return null
            var cursor = start + prefix.length
            while (cursor < raw.length && raw[cursor].isWhitespace()) cursor += 1
            if (cursor < raw.length && raw[cursor] == '>') return start..cursor
            searchFrom = start + 2
        }
        return null
    }

    private fun mergeToolResult(
        blocks: MutableList<ChatContentBlock>,
        callId: String,
        result: String,
        succeeded: Boolean,
    ) {
        val index = blocks.indexOfLast { it is ChatContentBlock.ToolCall && it.callId == callId }
        if (index >= 0) {
            val call = blocks[index] as ChatContentBlock.ToolCall
            blocks[index] = call.copy(
                result = result,
                state = if (succeeded) ToolCallState.Succeeded else ToolCallState.Failed,
            )
        } else {
            blocks += ChatContentBlock.ToolCall(
                id = "tool-$callId",
                callId = callId,
                name = "工具调用",
                result = result,
                state = if (succeeded) ToolCallState.Succeeded else ToolCallState.Failed,
            )
        }
    }
}
