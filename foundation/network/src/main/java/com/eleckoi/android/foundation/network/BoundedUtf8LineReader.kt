package com.eleckoi.android.foundation.network

import java.io.Closeable
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader

class BoundedTextLimitException(message: String) : IOException(message)

/** Buffered UTF-8 line reader with limits applied before an entire attacker-controlled line is allocated. */
class BoundedUtf8LineReader(
    input: InputStream,
    private val maxLineChars: Int,
    private val maxTotalChars: Int,
) : Closeable {
    private val reader = InputStreamReader(input, Charsets.UTF_8)
    private val buffer = CharArray(4 * 1024)
    private var offset = 0
    private var available = 0
    private var totalChars = 0
    private var endOfInput = false

    init {
        require(maxLineChars > 0 && maxTotalChars >= maxLineChars) { "文本流安全上限无效" }
    }

    fun readLine(): String? {
        if (endOfInput) return null
        val line = StringBuilder(minOf(maxLineChars, 16 * 1024))
        var consumed = false
        while (true) {
            val value = nextChar()
            if (value == null) {
                endOfInput = true
                return if (consumed) line.toString() else null
            }
            consumed = true
            totalChars++
            if (totalChars > maxTotalChars) {
                throw BoundedTextLimitException("文本流总大小超过安全上限")
            }
            when (value) {
                '\n' -> return line.toString()
                '\r' -> Unit
                else -> {
                    if (line.length >= maxLineChars) {
                        throw BoundedTextLimitException("文本流单行大小超过安全上限")
                    }
                    line.append(value)
                }
            }
        }
    }

    override fun close() = reader.close()

    private fun nextChar(): Char? {
        if (offset >= available) {
            available = reader.read(buffer)
            offset = 0
            if (available < 0) return null
        }
        return buffer[offset++]
    }
}
