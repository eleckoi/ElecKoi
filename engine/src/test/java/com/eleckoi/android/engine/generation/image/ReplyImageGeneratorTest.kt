package com.eleckoi.android.engine.generation.image

import com.eleckoi.android.engine.generation.model.ImageGenerationSettings
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.NovelAiImageProviderId
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ReplyImageGeneratorTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun `deletes only explicitly referenced generated png files`() {
        val root = temporaryFolder.newFolder("generated-images")
        val session = File(root, "session-1").apply { mkdirs() }
        val generated = File(session, "message-1.png").apply { writeBytes(byteArrayOf(1)) }
        val outside = temporaryFolder.newFile("outside.png").apply { writeBytes(byteArrayOf(2)) }
        val generator = ReplyImageGenerator(root)

        generator.deleteGeneratedFiles(listOf(generated.absolutePath, outside.absolutePath))

        assertFalse(generated.exists())
        assertTrue(outside.exists())
    }

    @Test
    fun `deleting a chat removes its generated image directory`() {
        val root = temporaryFolder.newFolder("chat-images")
        val session = File(root, "session-2").apply { mkdirs() }
        File(session, "message-1.png").writeBytes(byteArrayOf(1))
        File(session, "reply-1.png.tmp").writeBytes(byteArrayOf(2))
        val generator = ReplyImageGenerator(root)

        generator.deleteSessionImages("session-2")

        assertFalse(session.exists())
    }

    @Test
    fun `on demand generation does not inherit automatic illustration prompts`() = runBlocking {
        val root = temporaryFolder.newFolder("on-demand-images")
        var capturedPrompt: SceneImagePrompt? = null
        val generator = ReplyImageGenerator(
            rootDirectory = root,
            imageClient = ImageGenerationClient { _, prompt, _ ->
                capturedPrompt = prompt
                byteArrayOf(1, 2, 3)
            },
        )
        val config = ModelConfig(
            provider = NovelAiImageProviderId,
            imageSettings = ImageGenerationSettings(
                promptPrefix = "roleplay style",
                negativePrompt = "roleplay negative",
            ),
        )

        generator.generate(
            imageConfig = config,
            sessionId = "creator-workspace",
            imageId = "asset",
            characterImagePrompt = "role appearance",
            scenePrompt = SceneImagePrompt(
                prompt = "current request",
                negativePrompt = "current avoid",
            ),
            includeConfiguredPromptDefaults = false,
        )

        assertEquals("current request", capturedPrompt?.prompt)
        assertEquals("current avoid", capturedPrompt?.negativePrompt)
    }
}
