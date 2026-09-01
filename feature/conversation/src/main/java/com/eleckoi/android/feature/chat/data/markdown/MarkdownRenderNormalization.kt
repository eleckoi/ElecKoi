package com.eleckoi.android.feature.chat.data.markdown

/**
 * Keeps visible XML/HTML-style wrapper lines from swallowing a following fenced code block.
 *
 * ElecKoi renders HTML as text rather than executing it. CommonMark still classifies a standalone
 * tag as an HTML block, though, and that block remains open until a blank line. LLM output often
 * places the opening fence on the very next line, so the fence becomes literal text and its closing
 * fence starts a second, incorrect code block. A render-only blank line gives both constructs the
 * visible block semantics ElecKoi supports without changing the stored message.
 */
internal fun normalizeMarkdownForRendering(markdown: String): String {
    if ('<' !in markdown || ("```" !in markdown && "~~~" !in markdown)) return markdown
    return StandaloneTagBeforeFence.replace(markdown) { match ->
        match.value + match.groupValues[2]
    }
}

private val StandaloneTagBeforeFence = Regex(
    pattern = """^([ \t]{0,3}</?[A-Za-z][A-Za-z0-9:_-]*(?:[ \t]+[^<>\r\n]*)?/?>[ \t]*)(\r?\n)(?=[ \t]{0,3}(?:`{3,}|~{3,})[^\r\n]*(?:\r?\n|\z))""",
    option = RegexOption.MULTILINE,
)
