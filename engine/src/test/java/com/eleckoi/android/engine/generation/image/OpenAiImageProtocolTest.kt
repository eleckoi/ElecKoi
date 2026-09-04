package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ImageBackground
import com.eleckoi.android.engine.generation.model.ImageQuality
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.OpenAiImageProviderId
import com.eleckoi.android.engine.generation.model.defaultImageSettings
import com.eleckoi.android.engine.generation.model.imageSizeError
import java.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class OpenAiImageProtocolTest {
    private val config = ModelConfig(
        provider = OpenAiImageProviderId,
        imageSettings = defaultImageSettings(OpenAiImageProviderId),
    )

    @Test
    fun `gpt image request uses Images contract and natural language exclusions`() {
        val request = openAiImageRequestJson(
            config.copy(
                imageSettings = config.imageSettings.copy(
                    quality = ImageQuality.High,
                    background = ImageBackground.Transparent,
                ),
            ),
            SceneImagePrompt("A quiet portrait in warm light.", "logos and captions"),
        )
        assertEquals("gpt-image-2", request.getString("model"))
        assertEquals("1024x1536", request.getString("size"))
        assertEquals("high", request.getString("quality"))
        assertEquals("transparent", request.getString("background"))
        assertEquals("png", request.getString("output_format"))
        assertEquals(1, request.getInt("n"))
        assertEquals(
            "A quiet portrait in warm light.\n\nAvoid: logos and captions",
            request.getString("prompt"),
        )
        listOf("negative_prompt", "parameters", "sampler", "response_format", "input_fidelity")
            .forEach { field -> assertFalse("Unsupported field $field", request.has(field)) }
    }

    @Test
    fun `base address accepts official root v1 custom path and full endpoint`() {
        assertEquals("https://api.openai.com/v1/images/generations", openAiImageEndpoint(""))
        assertEquals("https://example.com/v1/images/generations", openAiImageEndpoint("https://example.com/"))
        assertEquals("https://example.com/v1/images/generations", openAiImageEndpoint("https://example.com/v1/"))
        assertEquals("https://example.com/proxy/v1/images/generations", openAiImageEndpoint("https://example.com/proxy/v1"))
        assertEquals("https://example.com/images/generations", openAiImageEndpoint("https://example.com/images/generations"))
        listOf(
            "https://key@example.com/v1",
            "https://example.com/v1?key=secret",
            "https://example.com/v1#x",
            "file:///tmp/image",
        ).forEach { endpoint ->
            assertThrows(Exception::class.java) { openAiImageEndpoint(endpoint) }
        }
    }

    @Test
    fun `valid custom sizes survive while invalid sizes fail before request`() {
        listOf(1024 to 1024, 1536 to 864, 3840 to 2160, 2160 to 3840).forEach { (width, height) ->
            assertNull(imageSizeError(OpenAiImageProviderId, width, height))
            val request = openAiImageRequestJson(
                config.copy(imageSettings = config.imageSettings.copy(width = width, height = height)),
                SceneImagePrompt("A landscape", ""),
            )
            assertEquals("${width}x${height}", request.getString("size"))
        }
        listOf(1025 to 1024, 512 to 512, 4096 to 1024, 3840 to 1024, 3840 to 3840)
            .forEach { (width, height) ->
                assertThrows(IllegalArgumentException::class.java) {
                    openAiImageRequestJson(
                        config.copy(imageSettings = config.imageSettings.copy(width = width, height = height)),
                        SceneImagePrompt("A landscape", ""),
                    )
                }
            }
    }

    @Test
    fun `empty exclusions stay empty for GPT and retain NovelAI defaults at boundary`() {
        val scene = parseSceneImagePrompts(
            """{"frames":[{"id":1,"prompt":"A portrait","negative_prompt":""}]}""",
        ).single()
        assertEquals("", scene.negativePrompt)
        val natural = finalSceneImagePrompt(
            config.imageSettings,
            "Character description.",
            scene,
            naturalLanguage = true,
        )
        assertEquals("", natural.negativePrompt)
        assertFalse(openAiImageRequestJson(config, natural).getString("prompt").contains("Avoid:"))
        assertEquals(DefaultNegativePrompt, finalSceneImagePrompt(config.imageSettings, "", scene).negativePrompt)
    }

    @Test
    fun `decode accepts base64 PNG and rejects responses without image`() {
        val image = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        val body = JSONObject()
            .put("data", JSONArray().put(JSONObject().put("b64_json", Base64.getEncoder().encodeToString(image))))
            .toString()
        assertArrayEquals(image, decodeOpenAiImage(body))
        listOf("{}", """{"data":[]}""", """{"data":[{"b64_json":"%%%"}]}""").forEach {
            assertThrows(Exception::class.java) { decodeOpenAiImage(it) }
        }
    }
}
