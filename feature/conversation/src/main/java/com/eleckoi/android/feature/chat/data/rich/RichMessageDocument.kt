package com.eleckoi.android.feature.chat.data.rich

internal enum class RichMessageDocumentKind {
    FullDocument,
    Fragment,
}

internal data class RichMessageDocument(
    val source: String,
    val kind: RichMessageDocumentKind,
) {
    val contentKey: String = "${source.length}:${source.hashCode()}:${kind.name}"
}

internal sealed interface RichMessagePart {
    val id: String

    data class Native(
        override val id: String,
        val source: String,
    ) : RichMessagePart

    data class Rich(
        override val id: String,
        val document: RichMessageDocument,
    ) : RichMessagePart
}

internal data class RichMessagePresentation(
    val parts: List<RichMessagePart>,
)

/** Recognizes authored browser content without treating ordinary XML-like prose as executable UI. */
internal fun detectRichMessageDocument(source: String): RichMessageDocument? {
    if ('<' !in source || '>' !in source) return null
    val candidate = source.withoutMarkdownFencedCode().trim()
    if (candidate.isEmpty()) return null
    val kind = when {
        ExplicitRichMarker.containsMatchIn(candidate) -> RichMessageDocumentKind.Fragment
        HtmlDocumentMarker.containsMatchIn(candidate) -> RichMessageDocumentKind.FullDocument
        ScriptOrStyleBlock.containsMatchIn(candidate) -> RichMessageDocumentKind.Fragment
        PairedInteractiveElement.containsMatchIn(candidate) -> RichMessageDocumentKind.Fragment
        StyledElement.containsMatchIn(candidate) -> RichMessageDocumentKind.Fragment
        else -> return null
    }
    return RichMessageDocument(source = source, kind = kind)
}

/**
 * Streaming may expose only a prefix of authored markup. Execute it only after a closing document
 * or paired fragment proves that the browser content arrived as one complete unit. This still
 * allows an atomic regex replacement to render immediately instead of leaking its CSS as prose.
 */
internal fun detectCompleteStreamingRichMessageDocument(source: String): RichMessageDocument? {
    val document = detectRichMessageDocument(source) ?: return null
    val candidate = source.withoutMarkdownFencedCode().trim()
    val structurallyComplete = when (document.kind) {
        RichMessageDocumentKind.FullDocument -> HtmlDocumentClose.containsMatchIn(candidate)
        RichMessageDocumentKind.Fragment ->
            ScriptOrStyleBlock.containsMatchIn(candidate) ||
                PairedInteractiveElement.containsMatchIn(candidate)
    }
    return document.takeIf { structurallyComplete }
}

/** Marks one display-only regex replacement as an atomic browser segment when it contains UI. */
fun decorateRichDisplayReplacement(replacement: String): String {
    if (RichReplacementStart.containsMatchIn(replacement)) return replacement
    // Imported frontends may be stored as one fenced Markdown code block. The fence is presentation
    // metadata, not part of the authored document. Only regex replacements take this path, so
    // ordinary fenced HTML examples in model prose remain non-executable.
    val richSource = replacement.singleOuterMarkdownFenceContent()
        ?.takeIf { detectRichMessageDocument(it) != null }
        ?: replacement.takeIf { detectRichMessageDocument(it) != null }
        ?: return replacement
    return buildString(richSource.length + 98) {
        append('\n')
        append(RichReplacementStartMarker)
        append('\n')
        append(richSource)
        append('\n')
        append(RichReplacementEndMarker)
        append('\n')
    }
}

private fun String.singleOuterMarkdownFenceContent(): String? {
    val trimmed = trim()
    val firstLineEnd = trimmed.indexOf('\n')
    if (firstLineEnd < 0) return null
    val opening = trimmed.substring(0, firstLineEnd).trimStart()
    val marker = opening.firstOrNull()?.takeIf { it == '`' || it == '~' } ?: return null
    val markerLength = opening.takeWhile { it == marker }.length
    if (markerLength < 3) return null

    val lastLineStart = trimmed.lastIndexOf('\n') + 1
    if (lastLineStart <= firstLineEnd) return null
    val closing = trimmed.substring(lastLineStart).trim()
    val closingLength = closing.takeWhile { it == marker }.length
    if (closingLength < markerLength || closing.drop(closingLength).isNotBlank()) return null
    return trimmed.substring(firstLineEnd + 1, lastLineStart).trim()
}

/**
 * Produces an ordered native/browser presentation. Display regex replacements carry exact internal
 * boundaries, so nested HTML never needs to be parsed with a regular expression. Unmarked authored
 * HTML keeps the legacy native-prefix + rich-tail behavior.
 */
internal fun detectRichMessagePresentation(
    source: String,
    streaming: Boolean,
): RichMessagePresentation? {
    detectMarkedRichMessagePresentation(source)?.let { return it }

    val lastContentIndex = source.indexOfLast { !it.isWhitespace() }
    if (lastContentIndex < 0) return null
    val masked = source.maskMarkdownFencedCode()
    val richStart = sequenceOf(
        ExplicitRichMarker.find(masked)?.range?.first,
        HtmlDocumentMarker.find(masked)?.range?.first,
        ScriptOrStyleBlock.find(masked)?.range?.first,
        PairedInteractiveElement.find(masked)?.range?.first,
        StyledElement.find(masked)?.range?.first,
    ).filterNotNull().minOrNull() ?: return null
    // A display replacement inserts one complete HTML template atomically. Only locate its first
    // authored tag here; regex tag pairing cannot determine the end of nested sibling elements.
    val richSource = source.substring(richStart, lastContentIndex + 1).trim()
    val document = if (streaming) {
        detectCompleteStreamingRichMessageDocument(richSource)
    } else {
        detectRichMessageDocument(richSource)
    } ?: return null
    return RichMessagePresentation(
        parts = buildList {
            addNativePart(source.substring(0, richStart))
            add(RichMessagePart.Rich(id = "rich-0", document = document))
        },
    )
}

private fun detectMarkedRichMessagePresentation(source: String): RichMessagePresentation? {
    val masked = source.maskMarkdownFencedCode()
    var cursor = 0
    var partIndex = 0
    var foundBoundary = false
    val parts = buildList {
        while (cursor < masked.length) {
            val start = RichReplacementStart.find(masked, cursor) ?: break
            val contentStart = start.range.last + 1
            val end = RichReplacementEnd.find(masked, contentStart) ?: return null
            foundBoundary = true
            addNativePart(source.substring(cursor, start.range.first), partIndex++)
            val richSource = source.substring(contentStart, end.range.first).trim()
            val document = detectRichMessageDocument(richSource) ?: return null
            add(
                RichMessagePart.Rich(
                    id = "part-${partIndex++}-rich",
                    document = document,
                ),
            )
            cursor = end.range.last + 1
        }
        if (foundBoundary) addNativePart(source.substring(cursor), partIndex)
    }
    return parts.takeIf { foundBoundary && it.isNotEmpty() }?.let(::RichMessagePresentation)
}

private fun MutableList<RichMessagePart>.addNativePart(
    source: String,
    index: Int = 0,
) {
    source.trim().takeIf(String::isNotEmpty)?.let { nativeSource ->
        add(
            RichMessagePart.Native(
                id = "part-$index-native",
                source = nativeSource,
            ),
        )
    }
}

private fun String.withoutMarkdownFencedCode(): String = maskMarkdownFencedCode()

private fun String.maskMarkdownFencedCode(): String = buildString(length) {
    var fenceCharacter: Char? = null
    var fenceLength = 0
    var lineStart = 0
    while (lineStart < this@maskMarkdownFencedCode.length) {
        val newlineIndex = this@maskMarkdownFencedCode.indexOf('\n', lineStart)
        val lineEnd = if (newlineIndex < 0) this@maskMarkdownFencedCode.length else newlineIndex
        val line = this@maskMarkdownFencedCode.substring(lineStart, lineEnd)
        var prefixLength = 0
        while (
            prefixLength < line.length &&
            prefixLength < 3 &&
            (line[prefixLength] == ' ' || line[prefixLength] == '\t')
        ) {
            prefixLength += 1
        }
        val candidate = line.drop(prefixLength)
        val marker = candidate.firstOrNull()
        val markerLength = if (marker == '`' || marker == '~') {
            candidate.takeWhile { it == marker }.length
        } else {
            0
        }
        if (fenceCharacter == null && markerLength >= 3) {
            fenceCharacter = marker
            fenceLength = markerLength
            repeat(line.length) { append(' ') }
        } else if (
            fenceCharacter != null &&
            marker == fenceCharacter &&
            markerLength >= fenceLength &&
            candidate.drop(markerLength).isBlank()
        ) {
            fenceCharacter = null
            fenceLength = 0
            repeat(line.length) { append(' ') }
        } else if (fenceCharacter == null) {
            append(line)
        } else {
            repeat(line.length) { append(' ') }
        }
        if (newlineIndex >= 0) {
            append('\n')
            lineStart = newlineIndex + 1
        } else {
            lineStart = this@maskMarkdownFencedCode.length
        }
    }
}

private val ExplicitRichMarker = Regex("""<!--\s*eleckoi\s*:\s*rich\s*-->""", RegexOption.IGNORE_CASE)
private const val RichReplacementStartMarker = "<!-- eleckoi:rich-replacement:start -->"
private const val RichReplacementEndMarker = "<!-- eleckoi:rich-replacement:end -->"
private val RichReplacementStart = Regex(
    """<!--\s*eleckoi\s*:\s*rich-replacement\s*:\s*start\s*-->""",
    RegexOption.IGNORE_CASE,
)
private val RichReplacementEnd = Regex(
    """<!--\s*eleckoi\s*:\s*rich-replacement\s*:\s*end\s*-->""",
    RegexOption.IGNORE_CASE,
)
private val HtmlDocumentMarker = Regex("""(?is)(?:<!doctype\s+html\b|<html(?:\s|>))""")
private val HtmlDocumentClose = Regex("""(?is)</(?:body|html)\s*>""")
private val ScriptOrStyleBlock = Regex("""(?is)<(script|style)(?:\s[^>]*)?>.*?</\1\s*>""")
private val PairedInteractiveElement = Regex(
    """(?is)<(div|section|article|main|header|footer|nav|aside|table|form|button|details|dialog|canvas|svg)(?:\s[^>]*)?>.*?</\1\s*>""",
)
private val StyledElement = Regex(
    """(?is)<[a-z][a-z0-9:-]*(?:\s+[^>]*?(?:style|class|id|on[a-z]+|data-[a-z0-9_-]+)\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)[^>]*)/?>""",
)
