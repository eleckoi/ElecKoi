package com.eleckoi.android.engine.generation.config

import com.eleckoi.android.engine.generation.image.ImageGenerationClient
import com.eleckoi.android.engine.generation.image.SceneImagePrompt
import com.eleckoi.android.engine.generation.model.ImageQuality
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.NovelAiDefaultModel
import com.eleckoi.android.engine.generation.model.NovelAiImageProviderId
import com.eleckoi.android.engine.generation.model.OpenAiImageProviderId
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class ModelConnectionTesterTest {
    @Test
    fun `image connection tests use image client and never Agent capability probe`() = runBlocking {
        for (provider in listOf(NovelAiImageProviderId, OpenAiImageProviderId)) {
            var tested: ModelConfig? = null
            var prompt: SceneImagePrompt? = null
            val original = ModelConfig(provider = provider, apiKey = "test-key", model = " selected-image-model ")
            val client = ImageGenerationClient { config, scene, capture ->
                tested = config
                prompt = scene
                assertNull(capture)
                byteArrayOf()
            }
            testModelConnection(
                original,
                verifyAgentCapabilities = { fail("Image tests must not call Agent capability") },
                imageClient = client,
            )
            assertEquals(
                original.copy(
                    model = "selected-image-model",
                    imageSettings = original.imageSettings.copy(quality = ImageQuality.Low),
                ),
                tested,
            )
            assertTrue(requireNotNull(prompt).prompt.isNotBlank())
        }
    }

    @Test
    fun `chat connection tests retain capability validation and fallback model`() = runBlocking {
        var tested: ModelConfig? = null
        val config = ModelConfig(
            provider = "custom",
            apiKey = "test-key",
            modelOptions = listOf(ModelOption(id = " chat-model ")),
        )
        testModelConnection(
            config,
            verifyAgentCapabilities = { tested = it },
            imageClient = ImageGenerationClient { _, _, _ -> error("must not generate image") },
        )
        assertEquals(config.copy(model = "chat-model"), tested)
    }

    @Test
    fun `missing credentials or model fail before network`() = runBlocking {
        val valid = ModelConfig(
            provider = NovelAiImageProviderId,
            apiKey = "test-key",
            model = NovelAiDefaultModel,
        )
        for ((config, expected) in listOf(valid.copy(apiKey = " ") to "缺少 API Key", valid.copy(model = " ") to "测试生图")) {
            val result = runCatching {
                testModelConnection(
                    config,
                    verifyAgentCapabilities = { error("must not send request") },
                    imageClient = ImageGenerationClient { _, _, _ -> error("must not send request") },
                )
            }
            assertTrue(result.isFailure)
            assertTrue(result.exceptionOrNull()?.message.orEmpty().contains(expected))
        }
    }
}
