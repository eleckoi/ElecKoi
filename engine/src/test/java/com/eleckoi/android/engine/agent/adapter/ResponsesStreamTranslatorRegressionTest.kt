package com.eleckoi.android.engine.agent.adapter

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ResponsesStreamTranslatorRegressionTest {
    @Test
    fun `long stream processes every delta once and terminal signals stay idempotent`() {
        val stream = ChatCompletionsToResponsesStream(idFactory = { "long-stream" })
        val emittedText = StringBuilder()
        var createdEvents = 0

        repeat(2_048) { index ->
            val finishReason = if (index == 2_047) "\"stop\"" else "null"
            val events = stream.acceptData(
                """{"id":"long","choices":[{"index":0,"delta":{"content":"x"},"finish_reason":$finishReason}]}""",
            )
            createdEvents += events.count { it.type == "response.created" }
            events.filter { it.type == "response.output_text.delta" }
                .forEach { event ->
                    emittedText.append((event.payload["delta"] as? JsonPrimitive)?.contentOrNull.orEmpty())
                }
        }

        val terminal = stream.acceptData("[DONE]")
        terminal.filter { it.type == "response.output_text.delta" }
            .forEach { event ->
                emittedText.append((event.payload["delta"] as? JsonPrimitive)?.contentOrNull.orEmpty())
            }

        assertEquals(1, createdEvents)
        assertEquals("x".repeat(2_048), emittedText.toString())
        assertEquals(1, terminal.count { it.type == "response.completed" })
        assertTrue(stream.acceptData("[DONE]").isEmpty())
        assertTrue(stream.finish().isEmpty())
        assertTrue(
            stream.acceptData(
                """{"id":"late","choices":[{"index":0,"delta":{"content":"ignored"},"finish_reason":null}]}""",
            ).isEmpty(),
        )
    }
}
