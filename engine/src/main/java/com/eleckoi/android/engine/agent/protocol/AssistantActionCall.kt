package com.eleckoi.android.engine.agent.protocol

internal const val AssistantActionCallOpenPrefix: String = "<ACTION_CALL"
const val AssistantActionCallCloseTag: String = "</ACTION_CALL>"

fun assistantActionCallOpenTag(name: String): String =
    "<ACTION_CALL name=\"$name\">"

internal data class AssistantActionCall(
    val name: String,
    val argumentsJson: String,
)

internal data class AssistantActionCallChunk(
    val visibleText: String,
    val calls: List<AssistantActionCall> = emptyList(),
)

internal data class AssistantActionCallDecoderSnapshot(
    val state: String,
    val pendingChars: Int,
    val pendingStartsWithMarker: Boolean,
    val decodedCalls: Int,
    val recoveredUnclosedCalls: Int,
)

/**
 * Extracts ElecKoi one-way actions from anywhere in ordinary assistant text.
 *
 * The XML-style tags are only streaming boundaries. The payload stays JSON so it follows the
 * argument format models already use for native tools. These calls deliberately remain outside
 * the provider's native `tool_calls` field: the host can start a fire-and-forget action while the
 * same assistant response continues streaming its final text.
 */
internal class AssistantActionCallDecoder {
    private val pending = StringBuilder()
    private var swallowLeadingLineBreak = false
    private var swallowLeadingLineFeed = false
    private var decodedCalls = 0
    private var recoveredUnclosedCalls = 0
    private var terminalState = "waiting_for_prefix"

    fun accept(chunk: String): AssistantActionCallChunk {
        var value = chunk
        if (swallowLeadingLineFeed) {
            value = value.removePrefix("\n")
            swallowLeadingLineFeed = false
        }
        if (swallowLeadingLineBreak) {
            value = when {
                value.startsWith("\r\n") -> value.removePrefix("\r\n")
                value.startsWith("\r") -> {
                    val remainder = value.removePrefix("\r")
                    swallowLeadingLineFeed = remainder.isEmpty()
                    remainder
                }
                value.startsWith("\n") -> value.removePrefix("\n")
                else -> value
            }
            swallowLeadingLineBreak = false
        }
        if (value.isEmpty()) return AssistantActionCallChunk(visibleText = "")
        pending.append(value)
        return drain(terminal = false)
    }

    /**
     * At item completion, an omitted `</ACTION_CALL>` is recovered using `<FINAL>` or EOF as the
     * boundary. Invalid opening syntax is still released losslessly instead of being executed.
     */
    fun finish(): AssistantActionCallChunk {
        if (pending.isEmpty()) return AssistantActionCallChunk(visibleText = "")
        return drain(terminal = true)
    }

    fun diagnosticSnapshot(): AssistantActionCallDecoderSnapshot =
        AssistantActionCallDecoderSnapshot(
            state = when {
                pending.isEmpty() -> "waiting_for_prefix"
                else -> "buffering_action"
            },
            pendingChars = pending.length,
            pendingStartsWithMarker = pending.startsWith(AssistantActionCallOpenPrefix),
            decodedCalls = decodedCalls,
            recoveredUnclosedCalls = recoveredUnclosedCalls,
        )

    private fun drain(terminal: Boolean): AssistantActionCallChunk {
        val calls = mutableListOf<AssistantActionCall>()
        val visible = StringBuilder()
        while (pending.isNotEmpty()) {
            val buffered = pending.toString()
            val markerStart = buffered.indexOf(AssistantActionCallOpenPrefix)
            if (markerStart < 0) {
                val retainedSuffixLength = if (terminal) {
                    0
                } else {
                    buffered.longestActionPrefixSuffixLength()
                }
                val visibleEnd = buffered.length - retainedSuffixLength
                if (visibleEnd > 0) {
                    visible.append(buffered, 0, visibleEnd)
                    pending.delete(0, visibleEnd)
                }
                if (terminal && pending.isNotEmpty()) {
                    visible.append(pending)
                    pending.clear()
                    terminalState = "pass_through_incomplete_prefix"
                }
                break
            }
            if (markerStart > 0) {
                visible.append(buffered, 0, markerStart)
                pending.delete(0, markerStart)
                terminalState = "scanning_visible_text"
                continue
            }

            val openingEnd = buffered.indexOf('>')
            if (openingEnd < 0) {
                if (terminal) {
                    visible.append(buffered)
                    pending.clear()
                    terminalState = "pass_through_incomplete_open_tag"
                }
                break
            }
            val openingTag = buffered.substring(0, openingEnd + 1)
            val name = ActionOpenTag.matchEntire(openingTag)?.groupValues?.get(1)
            if (name == null) {
                // Preserve invalid lookalikes, but keep scanning in case a valid action follows.
                visible.append(pending.first())
                pending.deleteCharAt(0)
                terminalState = "pass_through_invalid_open_tag"
                continue
            }
            val payloadStart = openingEnd + 1
            val explicitEnd = buffered.indexOf(AssistantActionCallCloseTag, startIndex = payloadStart)
            val finalBoundary = buffered.indexOf(AssistantFinalOpenTag, startIndex = payloadStart)
            val recoveredBoundary = finalBoundary.takeIf { explicitEnd < 0 && it >= 0 }
            val payloadEnd = when {
                explicitEnd >= 0 -> explicitEnd
                recoveredBoundary != null -> recoveredBoundary
                terminal -> buffered.length
                else -> break
            }
            val payload = buffered.substring(payloadStart, payloadEnd).trim()
            if (payload.isEmpty()) {
                visible.append(pending.first())
                pending.deleteCharAt(0)
                terminalState = "pass_through_empty_payload"
                continue
            }

            calls += AssistantActionCall(name = name, argumentsJson = payload)
            decodedCalls += 1
            val consumedEnd = if (explicitEnd >= 0) {
                explicitEnd + AssistantActionCallCloseTag.length
            } else {
                recoveredUnclosedCalls += 1
                payloadEnd
            }
            terminalState = if (explicitEnd >= 0) {
                "action_decoded"
            } else {
                "action_decoded_with_missing_close_tag"
            }
            pending.delete(0, consumedEnd)
            if (explicitEnd >= 0) consumeOptionalLineBreak()
        }
        return AssistantActionCallChunk(visibleText = visible.toString(), calls = calls)
    }

    private fun consumeOptionalLineBreak() {
        when {
            pending.startsWith("\r\n") -> pending.delete(0, 2)
            pending.startsWith("\r") -> {
                pending.deleteCharAt(0)
                swallowLeadingLineFeed = pending.isEmpty()
            }
            pending.startsWith("\n") -> pending.deleteCharAt(0)
            pending.isEmpty() -> swallowLeadingLineBreak = true
        }
    }

    private companion object {
        val ActionOpenTag = Regex("""<ACTION_CALL\s+name="([a-z][a-z0-9_]{0,63})"\s*>""")
    }
}

private fun String.longestActionPrefixSuffixLength(): Int {
    val maximum = minOf(length, AssistantActionCallOpenPrefix.length - 1)
    return (maximum downTo 1).firstOrNull { suffixLength ->
        AssistantActionCallOpenPrefix.startsWith(takeLast(suffixLength))
    } ?: 0
}

internal fun stripAssistantActionCalls(value: String): AssistantActionCallChunk {
    val decoder = AssistantActionCallDecoder()
    val decoded = decoder.accept(value)
    val finished = decoder.finish()
    return AssistantActionCallChunk(
        visibleText = decoded.visibleText + finished.visibleText,
        calls = decoded.calls + finished.calls,
    )
}
