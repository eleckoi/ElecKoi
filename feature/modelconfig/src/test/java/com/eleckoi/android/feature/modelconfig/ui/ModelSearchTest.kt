package com.eleckoi.android.feature.modelconfig.ui

import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.NovelAiImageProviderId
import com.eleckoi.android.engine.generation.model.OpenAiImageProviderId
import org.junit.Assert.assertEquals
import org.junit.Test

class ModelSearchTest {
    @Test
    fun `general providers expose only custom and DeepSeek`() {
        assertEquals(
            listOf("custom", "deepseek"),
            visibleModelProviders(emptyList())
                .filter { it.section == ModelLibrarySectionId.General }
                .map { it.id },
        )
    }

    @Test
    fun `add sheet lists domestic channels and drawing without foreign promotional providers`() {
        assertEquals(
            listOf(
                "custom",
                "deepseek",
                "zhipu",
                "zai",
                "moonshot",
                OpenAiImageProviderId,
                NovelAiImageProviderId,
            ),
            addableModelProviders.map { it.id },
        )
        assertEquals(
            listOf("custom", "deepseek", "zhipu"),
            visibleModelProviders(
                listOf(ModelConfig(provider = "zhipu", model = "glm-test")),
            ).filter { it.section == ModelLibrarySectionId.General }.map { it.id },
        )
    }

    @Test
    fun `optional groups appear only after their provider is saved`() {
        assertEquals(
            emptyList<String>(),
            visibleModelProviders(emptyList())
                .filter { it.section != ModelLibrarySectionId.General }
                .map { it.id },
        )
        assertEquals(
            listOf(NovelAiImageProviderId),
            visibleModelProviders(listOf(ModelConfig(provider = NovelAiImageProviderId)))
                .filter { it.section == ModelLibrarySectionId.Image }
                .map { it.id },
        )
    }

    @Test
    fun `fixed entries remain while a removed optional provider disappears`() {
        val saved = listOf(ModelConfig(id = "kimi", provider = "moonshot"))

        assertEquals(
            listOf("custom", "deepseek", "moonshot"),
            visibleModelProviders(saved).map { it.id },
        )
        assertEquals(
            listOf("custom", "deepseek"),
            visibleModelProviders(emptyList()).map { it.id },
        )
    }

    @Test
    fun `model search matches provider label badge and summary`() {
        assertEquals(
            listOf("custom"),
            filterModelProvidersForSearch(modelProviders, "自定义").map { it.id },
        )
        assertEquals(
            listOf(OpenAiImageProviderId, NovelAiImageProviderId),
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

    @Test
    fun `add form validates blank duplicate and malformed ids without changing case`() {
        val items = listOf(ModelOption(id = "glm-5.3-flash"))

        assertEquals(null, modelNameError(items, "  custom-model  "))
        assertEquals(null, modelNameError(items, "GLM-5.3-FLASH"))
        assertEquals("该模型已在列表中，请返回列表选择", modelNameError(items, "glm-5.3-flash"))
        assertEquals("请填写模型名", modelNameError(items, "   "))
        assertEquals("模型名中不能包含空格或换行", modelNameError(items, "my model"))
        assertEquals("模型名中不能包含空格或换行", modelNameError(items, "my\nmodel"))
    }
}
