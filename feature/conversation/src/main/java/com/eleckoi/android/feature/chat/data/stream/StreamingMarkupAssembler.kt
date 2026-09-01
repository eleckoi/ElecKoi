package com.eleckoi.android.feature.chat.data.stream

import com.eleckoi.android.feature.chat.model.content.ChatContentBlock

/** Avoids rescanning a growing plain-text reply for protocol tags on every animation frame. */
class StreamingMarkupAssembler(
    private val cacheOwnerKey: String = "streaming-markup",
) {
    private var lastSource = ""
    internal var structuredMode: Boolean = false
        private set

    fun update(source: String, streaming: Boolean): List<ChatContentBlock> {
        if (!streaming) {
            lastSource = source
            structuredMode = false
            return ChatContentBlockCache.get(cacheOwnerKey, source) ?: ElecKoiMarkupParser
                .parse(source, streaming = false)
                .also { ChatContentBlockCache.put(cacheOwnerKey, source, it) }
        }
        if (!isAppendOnlyUpdate(previous = lastSource, current = source)) {
            lastSource = ""
            structuredMode = false
        }

        if (!structuredMode) {
            val scanFrom = (lastSource.length - ProtocolTagOverlap).coerceAtLeast(0)
            structuredMode = ElecKoiMarkupParser.hasSupportedOpenTag(source, scanFrom)
        }
        lastSource = source

        if (!structuredMode) {
            return source.takeIf(String::isNotBlank)?.let {
                listOf(ChatContentBlock.Text(id = PlainTextBlockId, markdown = it))
            }.orEmpty()
        }
        return ElecKoiMarkupParser.parse(source, streaming = true)
    }

    private companion object {
        const val ProtocolTagOverlap = 32
        const val PlainTextBlockId = "text-0"
    }
}
