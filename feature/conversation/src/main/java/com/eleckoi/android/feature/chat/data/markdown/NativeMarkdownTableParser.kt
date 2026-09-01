package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownInlineSegment
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableAlignment
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableCell
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableContent
import com.eleckoi.android.feature.chat.model.markdown.MarkdownTableRow
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets

/** Decodes Grok's structured table event stream; stable tables are parsed only once. */
internal object NativeMarkdownTableParser {
    fun parse(source: String): MarkdownTableContent = decodeMarkdownTable(nativeParse(source))

    private external fun nativeParse(source: String): ByteArray

    init {
        NativeMarkdownRuntime.ensureLoaded()
    }
}

internal fun decodeMarkdownTable(values: ByteArray): MarkdownTableContent {
    if (values.isEmpty()) return MarkdownTableContent(emptyList(), emptyList())
    val buffer = ByteBuffer.wrap(values).order(ByteOrder.LITTLE_ENDIAN)
    require(buffer.readInt() == FORMAT_VERSION) { "Unsupported native Markdown table format" }
    val alignments = List(buffer.readCount()) {
        when (buffer.readInt()) {
            1 -> MarkdownTableAlignment.Left
            2 -> MarkdownTableAlignment.Center
            3 -> MarkdownTableAlignment.Right
            else -> MarkdownTableAlignment.None
        }
    }
    val rows = List(buffer.readCount()) {
        val header = buffer.readInt() != 0
        val cells = List(buffer.readCount()) {
            val segments = List(buffer.readCount()) {
                val style = buffer.readInt()
                val text = buffer.readUtf8(buffer.readLength())
                val destinationLength = buffer.readLength()
                MarkdownInlineSegment(
                    text = text,
                    style = style,
                    destination = if (destinationLength < 0) null else buffer.readUtf8(destinationLength),
                )
            }
            MarkdownTableCell(segments)
        }
        MarkdownTableRow(header = header, cells = cells)
    }
    require(!buffer.hasRemaining()) { "Unexpected trailing native Markdown table bytes" }
    return MarkdownTableContent(alignments = alignments, rows = rows)
}

private fun ByteBuffer.readInt(): Int {
    require(remaining() >= Int.SIZE_BYTES) { "Truncated native Markdown table payload" }
    return int
}

private fun ByteBuffer.readCount(): Int = readInt().also {
    require(it in 0..MAX_COLLECTION_SIZE) { "Invalid native Markdown table collection size" }
}

private fun ByteBuffer.readLength(): Int = readInt().also {
    require(it >= -1 && it <= remaining()) { "Invalid native Markdown table string length" }
}

private fun ByteBuffer.readUtf8(length: Int): String {
    require(length >= 0 && length <= remaining()) { "Invalid native Markdown table UTF-8 length" }
    val bytes = ByteArray(length)
    get(bytes)
    return String(bytes, StandardCharsets.UTF_8)
}

private const val MAX_COLLECTION_SIZE = 100_000
private const val FORMAT_VERSION = 1
