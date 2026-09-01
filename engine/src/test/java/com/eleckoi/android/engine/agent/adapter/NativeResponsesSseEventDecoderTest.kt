package com.eleckoi.android.engine.agent.adapter

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeResponsesSseEventDecoderTest {
    @Test
    fun `decodes one native responses event at its blank-line boundary`() {
        val decoder = NativeResponsesSseEventDecoder()

        assertTrue(decoder.acceptLine("event: response.output_text.delta").isEmpty())
        assertTrue(
            decoder.acceptLine(
                "data: {\"type\":\"response.output_text.delta\",\"item_id\":\"msg\",\"delta\":\"hi\"}",
            ).isEmpty(),
        )
        val event = decoder.acceptLine("").single()

        assertEquals("response.output_text.delta", event.type)
        assertEquals("hi", (event.payload["delta"] as JsonPrimitive).contentOrNull)
        assertTrue(decoder.finish().isEmpty())
    }

    @Test
    fun `flushes a final event when stream ends without a trailing blank line`() {
        val decoder = NativeResponsesSseEventDecoder()
        decoder.acceptLine("event: response.completed")
        decoder.acceptLine("data: {\"response\":{},\"type\":\"response.completed\"}")

        assertEquals("response.completed", decoder.finish().single().type)
    }

    @Test
    fun `ignores compatibility done marker and cost ping after completion`() {
        val decoder = NativeResponsesSseEventDecoder()

        decoder.acceptLine("event: response.completed")
        decoder.acceptLine("data: {\"response\":{},\"type\":\"response.completed\"}")
        assertEquals("response.completed", decoder.acceptLine("").single().type)

        decoder.acceptLine("data: [DONE]")
        assertTrue(decoder.acceptLine("").isEmpty())

        decoder.acceptLine("event: ping")
        decoder.acceptLine("data: {\"type\":\"ping\",\"cost\":\"0.0001\"}")
        assertTrue(decoder.acceptLine("").isEmpty())
        assertTrue(decoder.finish().isEmpty())
    }
}
