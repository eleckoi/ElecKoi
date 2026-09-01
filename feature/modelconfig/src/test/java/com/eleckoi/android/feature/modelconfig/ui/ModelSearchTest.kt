package com.eleckoi.android.feature.modelconfig.ui

import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.NovelAiImageProviderId
import org.junit.Assert.assertEquals
import org.junit.Test

class ModelSearchTest {
    @Test
    fun `general providers expose only custom and DeepSeek`() {
        assertEquals(
            listOf("custom", "deepseek"),
            modelProviders.filter { it.section == ModelLibrarySectionId.General }.map { it.id },
        )
    }

    @Test
    fun `model search matches provider label badge and summary`() {
        assertEquals(
            listOf("custom"),
            filterModelProvidersForSearch(modelProviders, "自定义").map { it.id },
        )
        assertEquals(
            listOf(NovelAiImageProviderId),
            filterModelProvidersForSearch(modelProviders, "绘画").map { it.id },
        )
    }

    @Test
    fun `model picker search is trimmed case insensitive and keeps provider order`() {
        val items = listOf(
            ModelOption(id = "minimax-m3"),
            ModelOption(id = "Kimi-K2.7-Code"),
            ModelOption(id = "deepseek-v4", name = "DeepSeek Chat"),
        )

        assertEquals(
            listOf("Kimi-K2.7-Code"),
            filterModelPickerItems(items, "  kimi  ").map { it.id },
        )
        assertEquals(
            listOf("deepseek-v4"),
            filterModelPickerItems(items, "chat").map { it.id },
        )
        assertEquals(items, filterModelPickerItems(items, "   "))
    }
}
