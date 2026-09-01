package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownNode
import com.eleckoi.android.feature.chat.model.markdown.MarkdownBlockType
import com.eleckoi.android.feature.chat.model.markdown.MarkdownCodeContent
import com.eleckoi.android.feature.chat.data.stream.isAppendOnlyUpdate

/**
 * Owns one append-only native parser session.
 *
 * Completed nodes are immutable. During streaming only the unfrozen tail nodes are replaced, so
 * Compose can retain measurements and draw caches for every checkpointed block.
 */
internal class MarkdownDocumentAssembler(
    private val cacheOwnerKey: String,
) : AutoCloseable {
    private val parser = NativeMarkdownParser()
    private val stableInlineParser = NativeInlineMarkdownParser()
    private val tailInlineParser = NativeInlineMarkdownParser()
    private val codeHighlighter = NativeCodeHighlighter()
    private var latestMarkdown = ""
    private var consumedLength = 0
    private val stableNodes = mutableListOf<MarkdownNode>()
    private val tailNodes = mutableListOf<MarkdownNode>()
    private var finalized = false
    private var tailInlineStart = -1
    private var tailInlineType: MarkdownBlockType? = null
    private var tailInlineSource = ""
    private val tailCodeIndex = IncrementalCodeLineIndex()

    @Synchronized
    fun update(markdown: String, streaming: Boolean): List<MarkdownNode> {
        val renderMarkdown = normalizeMarkdownForRendering(markdown)
        if (finalized || !isAppendOnlyUpdate(previous = latestMarkdown, current = renderMarkdown)) {
            reset()
        }

        val previousLength = consumedLength
        latestMarkdown = renderMarkdown
        if (renderMarkdown.length > previousLength) {
            val delta = renderMarkdown.substring(previousLength)
            apply(parser.append(delta))
            consumedLength = renderMarkdown.length
        }

        if (!streaming && !finalized) {
            apply(parser.finish())
            finalized = true
        }

        val snapshot = buildList(stableNodes.size + tailNodes.size) {
            addAll(stableNodes)
            addAll(tailNodes)
        }
        if (shouldCacheMarkdownDocument(streaming = streaming, finalized = finalized)) {
            MarkdownDocumentCache.put(cacheOwnerKey, markdown, snapshot)
        }
        return snapshot
    }

    @Synchronized
    fun reset() {
        parser.reset()
        latestMarkdown = ""
        consumedLength = 0
        stableNodes.clear()
        tailNodes.clear()
        finalized = false
        stableInlineParser.reset()
        tailInlineParser.reset()
        tailInlineStart = -1
        tailInlineType = null
        tailInlineSource = ""
        tailCodeIndex.clear()
        codeHighlighter.reset()
    }

    @Synchronized
    override fun close() {
        parser.close()
        stableInlineParser.close()
        tailInlineParser.close()
        codeHighlighter.close()
    }

    private fun apply(events: List<NativeMarkdownEvent>) {
        events.forEach { event ->
            when (event.kind) {
                NativeMarkdownEventKind.AppendStable -> {
                    stableNodes += event.toNode(stable = true)
                }

                NativeMarkdownEventKind.ReplaceTail -> tailNodes += event.toNode(stable = false)
                NativeMarkdownEventKind.ClearTail -> {
                    tailNodes.clear()
                    clearTailInlineSession()
                }
            }
        }
    }

    private fun NativeMarkdownEvent.toNode(stable: Boolean): MarkdownNode {
        val safeStart = start.coerceIn(0, latestMarkdown.length)
        val safeEnd = end.coerceIn(safeStart, latestMarkdown.length)
        val indexedCode = if (type == MarkdownBlockType.CodeFence) {
            if (stable) {
                parseCodeFence(latestMarkdown, safeStart, safeEnd)
            } else {
                tailCodeIndex.update(start, latestMarkdown, safeEnd)
            }
        } else null
        val codeContent = indexedCode?.let { code ->
            code.withHighlights(
                codeHighlighter.highlight(
                    fenceInfo = code.language,
                    startInTail = safeStart,
                    bodyReachesEof = !stable,
                    text = code.accessibilityText(code.textLength),
                    bodyStartOffset = code.bodyStartOffset,
                ),
            )
        }
        val rawSource = if (type == MarkdownBlockType.CodeFence) {
            ""
        } else {
            latestMarkdown.substring(safeStart, safeEnd)
        }
        val displaySource = displaySource(type, rawSource)
        val inlineSegments = if (type.supportsInlineParsing()) {
            if (stable) {
                stableInlineParser.reset()
                stableInlineParser.append(displaySource)
                stableInlineParser.finish()
            } else {
                updateTailInline(event = this, displaySource = displaySource)
            }
        } else {
            emptyList()
        }
        val tableContent = if (stable && type == MarkdownBlockType.Table) {
            NativeMarkdownTableParser.parse(rawSource)
        } else {
            null
        }
        return MarkdownNode(
            id = if (stable) {
                "${type.name}:$safeStart:$safeEnd"
            } else {
                "stream-tail:${type.name}:$safeStart"
            },
            type = type,
            source = rawSource,
            start = safeStart,
            end = safeEnd,
            metadata = metadata,
            stable = stable,
            inlineSegments = inlineSegments,
            code = codeContent,
            table = tableContent,
        )
    }

    private fun updateTailInline(
        event: NativeMarkdownEvent,
        displaySource: String,
    ) = if (
        tailInlineStart == event.start && tailInlineType == event.type &&
        isAppendOnlyUpdate(previous = tailInlineSource, current = displaySource)
    ) {
        val result = tailInlineParser.append(displaySource.substring(tailInlineSource.length))
        tailInlineSource = displaySource
        result
    } else {
        tailInlineParser.reset()
        tailInlineStart = event.start
        tailInlineType = event.type
        tailInlineSource = displaySource
        tailInlineParser.append(displaySource)
    }

    private fun clearTailInlineSession() {
        tailInlineParser.reset()
        tailInlineStart = -1
        tailInlineType = null
        tailInlineSource = ""
    }

}

internal fun shouldCacheMarkdownDocument(
    streaming: Boolean,
    finalized: Boolean,
): Boolean = !streaming && finalized

private fun parseCodeFence(source: String, blockStart: Int, blockEnd: Int): MarkdownCodeContent {
    val firstLineEnd = source.indexOf('\n', blockStart).let { if (it < 0 || it > blockEnd) blockEnd else it }
    val first = source.substring(blockStart, firstLineEnd).trim()
    val marker = when {
        first.startsWith("```") -> "```"
        first.startsWith("~~~") -> "~~~"
        else -> ""
    }
    val language = if (marker.isEmpty()) "" else first.removePrefix(marker).trim()
    val bodyStart = if (marker.isEmpty()) blockStart else (firstLineEnd + 1).coerceAtMost(blockEnd)
    var bodyEnd = blockEnd
    if (marker.isNotEmpty()) {
        var candidateEnd = blockEnd
        while (candidateEnd > bodyStart && (source[candidateEnd - 1] == '\n' || source[candidateEnd - 1] == '\r')) {
            candidateEnd -= 1
        }
        val candidateStart = source.lastIndexOf('\n', (candidateEnd - 1).coerceAtLeast(0))
            .let { if (it < bodyStart) bodyStart else it + 1 }
        if (source.substring(candidateStart, candidateEnd).trim().startsWith(marker)) {
            bodyEnd = candidateStart
        }
    }
    while (bodyEnd > bodyStart && (source[bodyEnd - 1] == '\n' || source[bodyEnd - 1] == '\r')) {
        bodyEnd -= 1
    }
    return MarkdownCodeContent.indexed(
        language = language,
        body = source.substring(bodyStart, bodyEnd.coerceAtLeast(bodyStart)),
    )
}

private fun MarkdownBlockType.supportsInlineParsing(): Boolean = when (this) {
    MarkdownBlockType.Paragraph,
    MarkdownBlockType.Heading,
    MarkdownBlockType.Quote,
    MarkdownBlockType.OrderedList,
    MarkdownBlockType.UnorderedList,
    -> true
    else -> false
}

private fun displaySource(type: MarkdownBlockType, raw: String): String = when (type) {
    MarkdownBlockType.Heading -> raw.trim().dropWhile { it == '#' }.trimStart()
    MarkdownBlockType.Quote -> raw.lineSequence().joinToString("\n", transform = ::grokQuoteLine)
    else -> raw.trimEnd()
}

/** Mirrors Grok's per-level blockquote marker transform instead of deleting nesting depth. */
private fun grokQuoteLine(source: String): String {
    var remaining = source.trimStart()
    val output = StringBuilder()
    while (remaining.startsWith('>')) {
        output.append("│ ")
        remaining = remaining.drop(1).trimStart()
    }
    return output.append(remaining).toString()
}
