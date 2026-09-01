package com.eleckoi.android.feature.modelconfig.ui

import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelApiFormat
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.feature.modelconfig.ui.settings.resolveInitialConfig
import org.junit.Assert.assertEquals
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
