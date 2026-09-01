package com.eleckoi.android.engine.agent.protocol

import com.eleckoi.android.engine.agent.api.AgentMessagePhase

const val AssistantCommentaryOpenTag = "<COMMENTARY>"
const val AssistantCommentaryCloseTag = "</COMMENTARY>"
const val AssistantFinalOpenTag = "<FINAL>"
const val AssistantFinalCloseTag = "</FINAL>"

data class AssistantPhaseHeaderChunk(
    /** Text retained in the current runtime turn. */
    val rawText: String,
    /** Text safe to expose in the UI or persist for a later turn. */
    val visibleText: String,
    val phase: AgentMessagePhase?,
)

/**
 * Detects and removes a leading ElecKoi phase element across arbitrary streaming boundaries.
 *
 * `<FINAL>` / `<COMMENTARY>` select the UI surface. Their matching closing tag is consumed from
 * the visible stream. If the model omits the closing tag, EOF closes the element implicitly.
 */
internal class AssistantPhaseHeaderDecoder {
    private val opening = StringBuilder()
    private val possibleClosing = StringBuilder()
    private var mode = Mode.Detecting
    private var closeTag: String? = null
    private var awaitingLeadingLineBreak = false
    private var consumeLeadingLineFeed = false

    var phase: AgentMessagePhase? = null
        private set

    fun accept(chunk: String): AssistantPhaseHeaderChunk {
        if (chunk.isEmpty()) return emptyChunk()
        return when (mode) {
            Mode.Detecting -> detect(chunk)
            Mode.Content -> decoded(chunk, filterContent(consumeOptionalLeadingLineBreak(chunk)))
            Mode.PassThrough -> decoded(chunk, chunk)
        }
    }

    fun finish(): AssistantPhaseHeaderChunk {
        val rawPending = if (mode == Mode.Detecting) opening.toString() else ""
        val visiblePending = when (mode) {
            Mode.Detecting -> rawPending
            // A trailing prefix such as `</FIN` is protocol residue, not roleplay text. EOF is the
            // implicit close boundary, so it is intentionally hidden.
            Mode.Content -> ""
            Mode.PassThrough -> ""
        }
        opening.clear()
        possibleClosing.clear()
        mode = Mode.PassThrough
        return decoded(rawPending, visiblePending)
    }

    private fun detect(chunk: String): AssistantPhaseHeaderChunk {
        opening.append(chunk)
        val buffered = opening.toString()
        val marker = Markers.firstOrNull { candidate -> buffered.startsWith(candidate.openTag) }
        if (marker != null) {
            phase = marker.phase
            closeTag = marker.closeTag
            awaitingLeadingLineBreak = true
            opening.clear()
            mode = Mode.Content
            val remainder = buffered.substring(marker.openTag.length)
            return decoded(
                rawText = buffered,
                visibleText = filterContent(consumeOptionalLeadingLineBreak(remainder)),
            )
        }
        if (Markers.any { marker -> marker.openTag.startsWith(buffered) }) return emptyChunk()
        opening.clear()
        mode = Mode.PassThrough
        return decoded(buffered, buffered)
    }

    private fun consumeOptionalLeadingLineBreak(value: String): String {
        if (!awaitingLeadingLineBreak && !consumeLeadingLineFeed) return value
        var remainder = value
        if (consumeLeadingLineFeed) {
            remainder = remainder.removePrefix("\n")
            consumeLeadingLineFeed = false
            awaitingLeadingLineBreak = false
            return remainder
        }
        if (remainder.isEmpty()) return remainder
        awaitingLeadingLineBreak = false
        if (remainder.startsWith("\r\n")) return remainder.removePrefix("\r\n")
        if (remainder.startsWith("\n")) return remainder.removePrefix("\n")
        if (remainder.startsWith("\r")) {
            remainder = remainder.removePrefix("\r")
            consumeLeadingLineFeed = remainder.isEmpty()
        }
        return remainder
    }

    private fun filterContent(chunk: String): String {
        val expectedClose = closeTag ?: return chunk
        if (chunk.isEmpty() && possibleClosing.isEmpty()) return ""
        val value = possibleClosing.append(chunk).toString()
        possibleClosing.clear()
        val closingIndex = value.indexOf(expectedClose)
        if (closingIndex >= 0) {
            val before = value.substring(0, closingIndex).removeOneTrailingLineBreak()
            val after = value.substring(closingIndex + expectedClose.length)
                .removePrefix("\r\n")
                .removePrefix("\r")
                .removePrefix("\n")
            mode = Mode.PassThrough
            return before + after
        }

        var heldCharacters = (1 until expectedClose.length)
            .lastOrNull { length -> value.endsWith(expectedClose.take(length)) }
            ?: 0
        if (heldCharacters == 0) return value
        val beforeHeld = value.dropLast(heldCharacters)
        heldCharacters += when {
            beforeHeld.endsWith("\r\n") -> 2
            beforeHeld.endsWith("\r") || beforeHeld.endsWith("\n") -> 1
            else -> 0
        }
        possibleClosing.append(value.takeLast(heldCharacters))
        return value.dropLast(heldCharacters)
    }

    private fun String.removeOneTrailingLineBreak(): String = when {
        endsWith("\r\n") -> dropLast(2)
        endsWith("\r") || endsWith("\n") -> dropLast(1)
        else -> this
    }

    private fun decoded(rawText: String, visibleText: String) = AssistantPhaseHeaderChunk(
        rawText = rawText,
        visibleText = visibleText,
        phase = phase,
    )

    private fun emptyChunk() = decoded(rawText = "", visibleText = "")

    private enum class Mode {
        Detecting,
        Content,
        PassThrough,
    }

    private data class Marker(
        val openTag: String,
        val closeTag: String,
        val phase: AgentMessagePhase,
    )

    private companion object {
        val Markers = listOf(
            Marker(
                openTag = AssistantCommentaryOpenTag,
                closeTag = AssistantCommentaryCloseTag,
                phase = AgentMessagePhase.Commentary,
            ),
            Marker(
                openTag = AssistantFinalOpenTag,
                closeTag = AssistantFinalCloseTag,
                phase = AgentMessagePhase.FinalAnswer,
            ),
        )
    }
}

fun stripAssistantPhaseHeader(value: String): AssistantPhaseHeaderChunk {
    val phase = OpeningMarkerRegex.findAll(value).lastOrNull()?.groupValues?.get(1)?.let { marker ->
        when (marker) {
            "COMMENTARY" -> AgentMessagePhase.Commentary
            else -> AgentMessagePhase.FinalAnswer
        }
    }
    return AssistantPhaseHeaderChunk(
        rawText = value,
        visibleText = value
            .replace(OpeningMarkerRegex, "")
            .replace(ClosingMarkerRegex, ""),
        phase = phase,
    )
}

internal fun AgentMessagePhase.assistantPhaseHeader(): String = when (this) {
    AgentMessagePhase.Commentary -> AssistantCommentaryOpenTag
    AgentMessagePhase.FinalAnswer -> AssistantFinalOpenTag
}

private val OpeningMarkerRegex = Regex(
    """<(COMMENTARY|FINAL)>(?:\r\n|[\r\n])?""",
)

private val ClosingMarkerRegex = Regex(
    """(?:\r\n|[\r\n])?</(?:COMMENTARY|FINAL)>""",
)
