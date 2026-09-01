package com.eleckoi.android.feature.chat.ui.roleplay.web.display

internal fun String.withoutRoleplayDisplayHtmlComments(): String {
    if (!contains("<!--")) return this
    val normalized = replace("\r\n", "\n").replace('\r', '\n')
    var fenceCharacter: Char? = null
    var fenceLength = 0
    var inlineTicks = 0
    var insideComment = false
    return normalized
        .split('\n')
        .joinToString(separator = "\n") { line ->
            val fence = if (!insideComment) line.markdownFence() else null
            if (fence != null) {
                if (fenceCharacter == null) {
                    fenceCharacter = fence.first
                    fenceLength = fence.second
                } else if (fenceCharacter == fence.first && fence.second >= fenceLength) {
                    fenceCharacter = null
                    fenceLength = 0
                }
                line
            } else if (fenceCharacter != null) {
                line
            } else {
                buildString(line.length) {
                    var cursor = 0
                    while (cursor < line.length) {
                        if (insideComment) {
                            val end = line.indexOf("-->", startIndex = cursor)
                            if (end < 0) break
                            insideComment = false
                            cursor = end + 3
                        } else if (line[cursor] == '`') {
                            var end = cursor + 1
                            while (end < line.length && line[end] == '`') end++
                            val runLength = end - cursor
                            inlineTicks = when (inlineTicks) {
                                0 -> runLength
                                runLength -> 0
                                else -> inlineTicks
                            }
                            append(line, cursor, end)
                            cursor = end
                        } else if (inlineTicks == 0 && line.startsWith("<!--", startIndex = cursor)) {
                            val commentEnd = line.indexOf("-->", startIndex = cursor + 4)
                            val rendererControlEnd = commentEnd
                                .takeIf { it >= 0 }
                                ?.takeIf {
                                    line.substring(cursor + 4, it)
                                        .isRoleplayRendererControlComment()
                                }
                                ?.plus(3)
                            if (rendererControlEnd != null) {
                                append(line, cursor, rendererControlEnd)
                                cursor = rendererControlEnd
                            } else {
                                insideComment = true
                                cursor += 4
                            }
                        } else {
                            append(line[cursor])
                            cursor++
                        }
                    }
                }
            }
        }
}

/**
 * A character-card regex can replace a placeholder that the model wrapped in a Markdown fence.
 * The replacement markers are internal and prove that the entire fenced payload is executable
 * display HTML, so remove only a fence whose complete non-blank body is one marked replacement.
 */
internal fun String.withoutRoleplayRichReplacementFences(): String {
    if (!contains("rich-replacement", ignoreCase = true)) return this
    val normalized = replace("\r\n", "\n").replace('\r', '\n')
    val lines = normalized.split('\n')
    val output = ArrayList<String>(lines.size)
    var index = 0
    while (index < lines.size) {
        val opening = lines[index].markdownFence()
        if (opening == null) {
            output += lines[index++]
            continue
        }
        var closingIndex = index + 1
        while (
            closingIndex < lines.size &&
            !lines[closingIndex].closesMarkdownFence(opening)
        ) {
            closingIndex += 1
        }
        if (closingIndex >= lines.size) {
            output.addAll(lines.subList(index, lines.size))
            break
        }
        val content = lines.subList(index + 1, closingIndex)
        val firstContent = content.indexOfFirst(String::isNotBlank)
        val lastContent = content.indexOfLast(String::isNotBlank)
        val isWholeRichReplacement = firstContent >= 0 &&
            RichReplacementStartComment.matches(content[firstContent].trim()) &&
            RichReplacementEndComment.matches(content[lastContent].trim())
        if (isWholeRichReplacement) {
            output.addAll(content)
        } else {
            output.addAll(lines.subList(index, closingIndex + 1))
        }
        index = closingIndex + 1
    }
    return output.joinToString(separator = "\n")
}

private fun String.isRoleplayRendererControlComment(): Boolean =
    RoleplayRendererControlComment.matches(trim())

private val RoleplayRendererControlComment = Regex(
    pattern = """eleckoi\s*:\s*rich-replacement\s*:\s*(?:start|end)""",
    option = RegexOption.IGNORE_CASE,
)

private val RichReplacementStartComment = Regex(
    pattern = """<!--\s*eleckoi\s*:\s*rich-replacement\s*:\s*start\s*-->""",
    option = RegexOption.IGNORE_CASE,
)

private val RichReplacementEndComment = Regex(
    pattern = """<!--\s*eleckoi\s*:\s*rich-replacement\s*:\s*end\s*-->""",
    option = RegexOption.IGNORE_CASE,
)

private fun String.markdownFence(): Pair<Char, Int>? {
    var cursor = 0
    while (cursor < length && cursor < 3 && this[cursor] == ' ') cursor++
    val marker = getOrNull(cursor)?.takeIf { it == '`' || it == '~' } ?: return null
    var end = cursor + 1
    while (end < length && this[end] == marker) end++
    val length = end - cursor
    return if (length >= 3) marker to length else null
}

private fun String.closesMarkdownFence(opening: Pair<Char, Int>): Boolean {
    var cursor = 0
    while (cursor < length && cursor < 3 && this[cursor] == ' ') cursor++
    if (getOrNull(cursor) != opening.first) return false
    var end = cursor + 1
    while (end < length && this[end] == opening.first) end++
    return end - cursor >= opening.second && substring(end).isBlank()
}
