package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownInlineSegment
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets

/** Grok/pulldown-backed inline parser. Only the changing tail is reparsed during streaming. */
internal class NativeInlineMarkdownParser : AutoCloseable {
    private var handle = nativeCreate()

    fun append(chunk: String): List<MarkdownInlineSegment> {
        check(handle != 0L) { "Inline Markdown parser is closed" }
        return decode(nativeAppend(handle, chunk))
    }

    fun finish(): List<MarkdownInlineSegment> {
        check(handle != 0L) { "Inline Markdown parser is closed" }
        return decode(nativeFinish(handle))
    }

    fun reset() {
        check(handle != 0L) { "Inline Markdown parser is closed" }
        nativeReset(handle)
    }

    override fun close() {
        if (handle != 0L) {
            nativeDestroy(handle)
            handle = 0L
        }
    }

    private fun decode(values: ByteArray): List<MarkdownInlineSegment> {
        if (values.isEmpty()) return emptyList()
        val buffer = ByteBuffer.wrap(values).order(ByteOrder.LITTLE_ENDIAN)
        require(buffer.remaining() >= Int.SIZE_BYTES) { "Invalid inline Markdown header" }
        val count = buffer.int
        require(count >= 0) { "Invalid inline Markdown segment count" }
        return buildList(count) {
            repeat(count) {
                require(buffer.remaining() >= Int.SIZE_BYTES * 3) {
                    "Truncated inline Markdown segment"
                }
                val style = buffer.int
                val text = buffer.readUtf8(buffer.int)
                require(buffer.remaining() >= Int.SIZE_BYTES) {
                    "Truncated inline Markdown destination"
                }
                val destinationLength = buffer.int
                add(
                    MarkdownInlineSegment(
                        text = text,
                        style = style,
                        destination = if (destinationLength < 0) null else buffer.readUtf8(destinationLength),
                    ),
                )
            }
            require(!buffer.hasRemaining()) { "Unexpected trailing inline Markdown bytes" }
        }
    }

    private external fun nativeCreate(): Long
    private external fun nativeAppend(handle: Long, chunk: String): ByteArray
    private external fun nativeFinish(handle: Long): ByteArray
    private external fun nativeReset(handle: Long)
    private external fun nativeDestroy(handle: Long)

    private companion object {
        init {
            NativeMarkdownRuntime.ensureLoaded()
        }
    }
}

private fun ByteBuffer.readUtf8(length: Int): String {
    require(length >= 0 && length <= remaining()) { "Invalid inline Markdown UTF-8 length" }
    val bytes = ByteArray(length)
    get(bytes)
    return String(bytes, StandardCharsets.UTF_8)
}
