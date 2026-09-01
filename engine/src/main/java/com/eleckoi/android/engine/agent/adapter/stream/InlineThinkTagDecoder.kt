package com.eleckoi.android.engine.agent.adapter

/** Splits a leading MiniMax-style `<think>...</think>` block out of Chat `content`. */
internal class InlineThinkTagDecoder {
    private val pending = StringBuilder()
    private var mode = Mode.Detecting

    fun accept(chunk: String): List<InlineThinkSegment> {
        if (chunk.isEmpty()) return emptyList()
        return when (mode) {
            Mode.Detecting -> detect(chunk)
            Mode.Reasoning -> consumeReasoning(chunk)
            Mode.Text -> listOf(InlineThinkSegment(InlineThinkSegment.Kind.Text, chunk))
        }
    }

    fun finish(): List<InlineThinkSegment> {
        if (pending.isEmpty()) return emptyList()
        val value = pending.toString()
        pending.clear()
        return listOf(
            InlineThinkSegment(
                kind = if (mode == Mode.Reasoning) {
                    InlineThinkSegment.Kind.Reasoning
                } else {
                    InlineThinkSegment.Kind.Text
                },
                value = value,
            ),
        )
    }

    private fun detect(chunk: String): List<InlineThinkSegment> {
        pending.append(chunk)
        val value = pending.toString()
        if (value.length < OpenTag.length && OpenTag.startsWith(value)) return emptyList()
        if (!value.startsWith(OpenTag)) {
            pending.clear()
            mode = Mode.Text
            return listOf(InlineThinkSegment(InlineThinkSegment.Kind.Text, value))
        }
        pending.clear()
        mode = Mode.Reasoning
        return consumeReasoning(value.substring(OpenTag.length))
    }

    private fun consumeReasoning(chunk: String): List<InlineThinkSegment> {
        pending.append(chunk)
        val value = pending.toString()
        val closingIndex = value.indexOf(CloseTag)
        if (closingIndex >= 0) {
            pending.clear()
            mode = Mode.Text
            val reasoning = value.substring(0, closingIndex)
            val text = value.substring(closingIndex + CloseTag.length)
                .removePrefix("\r\n")
                .removePrefix("\r")
                .removePrefix("\n")
            return buildList {
                if (reasoning.isNotEmpty()) {
                    add(InlineThinkSegment(InlineThinkSegment.Kind.Reasoning, reasoning))
                }
                if (text.isNotEmpty()) add(InlineThinkSegment(InlineThinkSegment.Kind.Text, text))
            }
        }

        val held = (1 until CloseTag.length)
            .lastOrNull { length -> value.endsWith(CloseTag.take(length)) }
            ?: 0
        val emitted = value.dropLast(held)
        pending.clear()
        if (held > 0) pending.append(value.takeLast(held))
        return if (emitted.isEmpty()) {
            emptyList()
        } else {
            listOf(InlineThinkSegment(InlineThinkSegment.Kind.Reasoning, emitted))
        }
    }

    private enum class Mode { Detecting, Reasoning, Text }

    private companion object {
        const val OpenTag = "<think>"
        const val CloseTag = "</think>"
    }
}

internal data class InlineThinkSegment(
    val kind: Kind,
    val value: String,
) {
    enum class Kind { Reasoning, Text }
}
