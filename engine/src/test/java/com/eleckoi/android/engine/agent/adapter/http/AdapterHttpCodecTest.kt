package com.eleckoi.android.engine.agent.adapter

import java.io.ByteArrayInputStream
import org.junit.Assert.assertEquals
import org.junit.Test

class AdapterHttpCodecTest {
    @Test
    fun `retains normalized request headers for route policy`() {
        val body = "{}"
        val raw = (
            "POST /token/v1/responses HTTP/1.1\r\n" +
                "Content-Length: ${body.toByteArray().size}\r\n" +
                "X-DeepSeek-Harness-Compact: 1\r\n" +
                "\r\n" +
                body
            ).toByteArray()

        val request = AdapterHttpCodec.readRequest(ByteArrayInputStream(raw))

        assertEquals("1", request.headers["x-deepseek-harness-compact"])
        assertEquals(body, request.body.toString(Charsets.UTF_8))
    }
}
