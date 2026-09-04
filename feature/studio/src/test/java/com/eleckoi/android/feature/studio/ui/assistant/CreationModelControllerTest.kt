package com.eleckoi.android.feature.studio.ui.assistant

import com.eleckoi.android.engine.generation.config.ModelConfigCollection
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.OpenAiImageProviderId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CreationModelControllerTest {
    @Test
    fun `image configuration can never become the creation assistant chat model`() {
        val image = ModelConfig(
            id = "image",
            provider = OpenAiImageProviderId,
            model = "gpt-image-2",
        )
        val chat = ModelConfig(
            id = "chat",
            provider = "deepseek",
            model = "deepseek-chat",
        )
        val collection = ModelConfigCollection(
            activeConfigId = chat.id,
            activeConfig = chat,
            configs = listOf(image, chat),
        )

        val selected = collection.resolveCreationChatConfig(
            currentConfigId = image.id,
            defaultConfigId = chat.id,
        )

        assertEquals(chat, selected)
        assertTrue(collection.chatConfigs.none { it.id == image.id })
    }
}
