package com.eleckoi.android.feature.chat.data.markdown

import com.eleckoi.android.feature.chat.model.markdown.MarkdownBlockType

internal enum class NativeMarkdownEventKind {
    AppendStable,
    ReplaceTail,
    ClearTail,
}

internal data class NativeMarkdownEvent(
    val kind: NativeMarkdownEventKind,
    val type: MarkdownBlockType,
    val start: Int,
    val end: Int,
    val metadata: Int,
)

/** Thin JNI boundary. Parsing and checkpoint state live in the Grok-aligned Rust core. */
internal class NativeMarkdownParser : AutoCloseable {
    private var handle: Long = nativeCreate()

    fun append(chunk: String): List<NativeMarkdownEvent> {
        check(handle != 0L) { "Markdown parser is closed" }
        return decode(nativeAppend(handle, chunk))
    }

    fun finish(): List<NativeMarkdownEvent> {
        check(handle != 0L) { "Markdown parser is closed" }
        return decode(nativeFinish(handle))
    }

    fun reset() {
        check(handle != 0L) { "Markdown parser is closed" }
        nativeReset(handle)
    }

    override fun close() {
        if (handle != 0L) {
            nativeDestroy(handle)
            handle = 0L
        }
    }

    private fun decode(values: IntArray): List<NativeMarkdownEvent> {
        if (values.isEmpty()) return emptyList()
        require(values.size % EVENT_WIDTH == 0) { "Invalid native Markdown event payload" }
        return buildList(values.size / EVENT_WIDTH) {
            var offset = 0
            while (offset < values.size) {
                val kind = when (values[offset]) {
                    1 -> NativeMarkdownEventKind.AppendStable
                    2 -> NativeMarkdownEventKind.ReplaceTail
                    else -> NativeMarkdownEventKind.ClearTail
                }
                val type = MarkdownBlockType.entries.getOrElse(values[offset + 1]) {
                    MarkdownBlockType.Paragraph
                }
                add(
                    NativeMarkdownEvent(
                        kind = kind,
                        type = type,
                        start = values[offset + 2],
                        end = values[offset + 3],
                        metadata = values[offset + 4],
                    ),
                )
                offset += EVENT_WIDTH
            }
        }
    }

    private external fun nativeCreate(): Long
    private external fun nativeAppend(handle: Long, chunk: String): IntArray
    private external fun nativeFinish(handle: Long): IntArray
    private external fun nativeReset(handle: Long)
    private external fun nativeDestroy(handle: Long)

    private companion object {
        const val EVENT_WIDTH = 5

        init {
            NativeMarkdownRuntime.ensureLoaded()
        }
    }
}
