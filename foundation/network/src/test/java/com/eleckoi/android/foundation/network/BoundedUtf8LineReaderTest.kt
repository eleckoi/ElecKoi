package com.eleckoi.android.foundation.network

import java.io.ByteArrayInputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class BoundedUtf8LineReaderTest {
    @Test
    fun `reads crlf blank and final unterminated lines`() {
        BoundedUtf8LineReader(
            ByteArrayInputStream("first\r\n\n最后".toByteArray()),
            maxLineChars = 20,
            maxTotalChars = 100,
        ).use { reader ->
            assertEquals("first", reader.readLine())
            assertEquals("", reader.readLine())
            assertEquals("最后", reader.readLine())
            assertNull(reader.readLine())
        }
    }

    @Test
    fun `fails before allocating an unbounded line or response`() {
        assertThrows(BoundedTextLimitException::class.java) {
            BoundedUtf8LineReader(
                ByteArrayInputStream("x".repeat(100).toByteArray()),
                maxLineChars = 16,
                maxTotalChars = 64,
            ).use { it.readLine() }
        }
        assertThrows(BoundedTextLimitException::class.java) {
            BoundedUtf8LineReader(
                ByteArrayInputStream("a\nb\nc\nd\n".toByteArray()),
                maxLineChars = 4,
                maxTotalChars = 6,
            ).use { while (it.readLine() != null) Unit }
        }
    }
}
