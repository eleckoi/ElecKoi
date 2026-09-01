package com.eleckoi.android.engine.generation.reasoning

import com.eleckoi.android.engine.generation.model.ModelApiFormat
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DshReasoningEffortsTest {
    @Test
    fun `Responses and Chat expose every DSH effort`() {
        listOf(ModelApiFormat.Responses, ModelApiFormat.ChatCompletions).forEach { format ->
            val option = ModelOption("model")
            val config = ModelConfig(model = option.id, modelOptions = listOf(option), apiFormat = format)

            assertEquals(
                listOf("off", "minimal", "low", "medium", "high", "xhigh", "max"),
                DshReasoningEfforts.forModel(config, option).map { it.id },
            )
        }
    }

    @Test
    fun `Messages and Gemini omit levels pi-ai would clamp`() {
        listOf(ModelApiFormat.AnthropicMessages, ModelApiFormat.GoogleGemini).forEach { format ->
            val option = ModelOption("model")
            val config = ModelConfig(model = option.id, modelOptions = listOf(option), apiFormat = format)

            assertEquals(
                listOf("off", "minimal", "low", "medium", "high"),
                DshReasoningEfforts.forModel(config, option).map { it.id },
            )
        }
    }

    @Test
    fun `DeepSeek exposes only efforts accepted by the DSH DeepSeek adapter`() {
        listOf(ModelApiFormat.Responses, ModelApiFormat.ChatCompletions).forEach { format ->
            val option = ModelOption("deepseek-v4-flash-vision-exp")
            val config = ModelConfig(
                provider = "deepseek",
                model = option.id,
                modelOptions = listOf(option),
                apiFormat = format,
            )

            assertEquals(
                listOf("off", "low", "high", "max"),
                DshReasoningEfforts.forModel(config, option).map { it.id },
            )
        }
    }

    @Test
    fun `selected effort is validated against active protocol`() {
        val option = ModelOption("model", reasoningEffort = "MAX")
        val responses = ModelConfig(
            model = option.id,
            modelOptions = listOf(option),
            apiFormat = ModelApiFormat.Responses,
        )
        val messages = responses.copy(apiFormat = ModelApiFormat.AnthropicMessages)

        assertEquals("max", DshReasoningEfforts.selected(responses))
        assertNull(DshReasoningEfforts.selected(messages))
    }
}
