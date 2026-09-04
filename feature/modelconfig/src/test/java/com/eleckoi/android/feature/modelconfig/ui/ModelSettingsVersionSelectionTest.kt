package com.eleckoi.android.feature.modelconfig.ui

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelApiFormat
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.feature.modelconfig.ui.settings.resolveInitialConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ModelSettingsVersionSelectionTest {
    @Test
    fun `Room refresh keeps the version selected inside the editor`() {
        val original = config(id = "config-123", name = "123")
        val selected = config(id = "config-deepseek", name = "DeepSeek", model = "deepseek-v4-flash")
        val state = ModelSettingsEditorState(original, initialDirty = false)

        state.selectConfig(selected)
        state.syncFrom(
            configs = listOf(original, selected.copy(model = "deepseek-v4-pro")),
            target = ModelTarget(providerId = "custom", configId = original.id),
        )

        assertEquals(selected.id, state.form.id)
        assertEquals("deepseek-v4-pro", state.form.model)
    }

    @Test
    fun `model library opens and summarizes the active provider version`() {
        val original = config(id = "config-123", name = "123")
        val selected = config(id = "config-deepseek", name = "DeepSeek", model = "deepseek-v4-pro")
        val configs = listOf(original, selected)

        assertEquals(
            selected,
            firstConfigForProvider(configs, "custom", preferredConfigId = selected.id),
        )
        assertEquals(
            "DeepSeek · deepseek-v4-pro",
            latestConfigSummary(
                configs,
                providerMeta("custom"),
                preferredConfigId = selected.id,
            ),
        )
    }

    @Test
    fun `DeepSeek library row keeps the concise official API summary`() {
        val configured = ModelConfig(
            id = "config-deepseek",
            name = "未命名",
            provider = "deepseek",
            model = "deepseek-v4-flash",
        )

        assertEquals(
            "官方 API",
            latestConfigSummary(listOf(configured), providerMeta("deepseek"), configured.id),
        )
        assertEquals(
            "官方 API",
            latestConfigSummary(emptyList(), providerMeta("deepseek")),
        )
    }

    @Test
    fun `opening an unconfigured provider uses its creation format`() {
        assertEquals(
            ModelApiFormat.Responses,
            resolveInitialConfig(emptyList(), ModelTarget(providerId = "custom")).apiFormat,
        )
    }

    @Test
    fun `new draft stays selected instead of falling back to the first saved config`() {
        val existing = config(id = "config-existing", name = "existing-provider")
        val target = ModelConfig(id = "config-draft", provider = "custom")
            .toDraftModelTarget()

        val draft = resolveInitialConfig(listOf(existing), target)

        assertEquals("config-draft", draft.id)
        assertEquals("", draft.name)
        assertEquals("", target.configId)
        assertEquals("config-draft", target.draftId)
    }

    @Test
    fun `opening a new provider does not mark the untouched draft dirty`() {
        val target = ModelConfig(id = "config-draft", provider = "zhipu").toDraftModelTarget()
        val state = ModelSettingsEditorState(resolveInitialConfig(emptyList(), target), initialDirty = false)

        state.syncFrom(emptyList(), target)

        assertFalse(state.dirty)
    }

    @Test
    fun `reading models opens the picker without leaving inline status text`() {
        val state = ModelSettingsEditorState(config(id = "config", name = "DeepSeek"), initialDirty = false)
        val fetched = state.form.copy(
            modelOptions = listOf(ModelOption(id = "deepseek-v4-flash")),
        )

        state.finishFetchModels(Result.success(fetched))

        assertTrue(state.modelPickerOpen)
        assertEquals("", state.testMessage)
        assertEquals(fetched.modelOptions, state.form.modelOptions)
    }

    @Test
    fun `reading model failure stays out of layout and is dismissible`() {
        val state = ModelSettingsEditorState(config(id = "config", name = "DeepSeek"), initialDirty = false)

        state.finishFetchModels(Result.failure(IllegalStateException("读取失败")))

        assertFalse(state.modelPickerOpen)
        assertEquals("读取失败", state.testMessage)
        state.clearMessage()
        assertEquals("", state.testMessage)
    }

    @Test
    fun `connection failure suggests another format without changing the selected format`() {
        val state = ModelSettingsEditorState(
            ModelConfig(apiFormat = ModelApiFormat.Responses),
            initialDirty = false,
        )

        assertTrue(state.startTestConnection())
        state.finishConnectionStage(Result.failure(IllegalStateException("unsupported endpoint")))

        assertEquals(ModelApiFormat.Responses, state.form.apiFormat)
        assertTrue(state.testState?.formatFallbackSuggested == true)
        assertEquals("当前接口格式测试失败，请尝试其他接口格式。", state.testMessage)
    }

    @Test
    fun `connection failure gives the same generic format suggestion for Chat`() {
        val option = ModelOption(
            id = "chat-model",
            apiFormatOverride = ModelApiFormat.ChatCompletions,
        )
        val state = ModelSettingsEditorState(
            ModelConfig(
                model = option.id,
                modelOptions = listOf(option),
                apiFormat = ModelApiFormat.Responses,
            ),
            initialDirty = false,
        )

        assertTrue(state.startTestConnection())
        state.finishConnectionStage(Result.failure(IllegalStateException("connection failed")))

        assertEquals(ModelApiFormat.Responses, state.form.apiFormat)
        assertTrue(state.testState?.formatFallbackSuggested == true)
        assertEquals("当前接口格式测试失败，请尝试其他接口格式。", state.testMessage)
    }

    private fun config(
        id: String,
        name: String,
        model: String = "",
    ): ModelConfig = ModelConfig(
        id = id,
        name = name,
        provider = "custom",
        model = model,
    )
}
