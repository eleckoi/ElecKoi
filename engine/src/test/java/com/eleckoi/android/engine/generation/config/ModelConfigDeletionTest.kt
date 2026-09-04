package com.eleckoi.android.engine.generation.config

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.NovelAiImageProviderId
import org.junit.Assert.assertEquals
import org.junit.Test

class ModelConfigDeletionTest {
    @Test
    fun `deleting the only chat config leaves no active config`() {
        val target = config("only", "custom")

        assertEquals("", activeConfigIdAfterDelete(collection(target.id, target), target))
    }

    @Test
    fun `deleting the active config prefers another config from the same provider`() {
        val target = config("custom-1", "custom")
        val sameProvider = config("custom-2", "custom")
        val otherProvider = config("deepseek-1", "deepseek")

        assertEquals(
            sameProvider.id,
            activeConfigIdAfterDelete(
                collection(target.id, target, sameProvider, otherProvider),
                target,
            ),
        )
    }

    @Test
    fun `deleting an image config preserves the active chat config`() {
        val chat = config("chat", "deepseek")
        val image = config("image", NovelAiImageProviderId)

        assertEquals(
            chat.id,
            activeConfigIdAfterDelete(collection(chat.id, chat, image), image),
        )
    }

    private fun config(id: String, provider: String) = ModelConfig(id = id, provider = provider)

    private fun collection(
        activeId: String,
        vararg configs: ModelConfig,
    ) = ModelConfigCollection(
        activeConfigId = activeId,
        activeConfig = configs.firstOrNull { it.id == activeId } ?: ModelConfig(),
        configs = configs.toList(),
    )
}
