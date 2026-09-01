package com.eleckoi.android.engine.generation.provider

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class OpenAiCompatibleClientTest {
    @Test
    fun `supporting completion inherits provider defaults when output limit is not configured`() {
        val payload = textCompletionPayload(
            config = ModelConfig(
                model = "deepseek-v4-flash",
                modelOptions = listOf(ModelOption("deepseek-v4-flash")),
            ),
            systemPrompt = "system",
            userPrompt = "user",
        )

        assertFalse(payload.has("temperature"))
        assertFalse(payload.has("max_tokens"))
        assertFalse(payload.has("thinking"))
        assertFalse(payload.has("reasoning_effort"))
    }

    @Test
    fun `supporting completion uses selected model output limit when configured`() {
        val payload = textCompletionPayload(
            config = ModelConfig(
                model = "gpt-test",
                modelOptions = listOf(ModelOption("gpt-test", maxOutputTokens = 8_192)),
            ),
            systemPrompt = "system",
            userPrompt = "user",
        )

        assertEquals(8_192, payload.getInt("max_tokens"))
        assertFalse(payload.has("temperature"))
        assertFalse(payload.has("thinking"))
    }

    @Test
    fun `empty final content reports reasoning and finish metadata`() {
        val response = JSONObject()
            .put(
                "choices",
                JSONArray().put(
                    JSONObject()
                        .put("finish_reason", "length")
                        .put(
                            "message",
                            JSONObject()
                                .put("content", JSONObject.NULL)
                                .put("reasoning_content", "thinking only"),
                        ),
                ),
            )
            .put("usage", JSONObject().put("completion_tokens", 900))

        val error = assertThrows(ElecKoiDataException::class.java) {
            textFromCompletionResponse(response)
        }

        assertTrue(error.message.orEmpty().contains("finish_reason=length"))
        assertTrue(error.message.orEmpty().contains("reasoning_chars=13"))
        assertTrue(error.message.orEmpty().contains("completion_tokens=900"))
    }
}
