package com.eleckoi.android.feature.modelconfig.ui.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.defaultApiFormatForProvider
import com.eleckoi.android.engine.generation.model.withProviderDefaults
import com.eleckoi.android.feature.modelconfig.ui.ModelTarget
import com.eleckoi.android.feature.modelconfig.ui.ModelTestState
import com.eleckoi.android.feature.modelconfig.ui.ModelTestStatus
import com.eleckoi.android.feature.modelconfig.ui.ModelTestStep
import com.eleckoi.android.feature.modelconfig.ui.normalizeProviderId

internal class ModelSettingsEditorState(initialForm: ModelConfig, initialDirty: Boolean) {
    var form by mutableStateOf(initialForm)
    var dirty by mutableStateOf(initialDirty)
    var saveState by mutableStateOf("idle")
    var loadingModels by mutableStateOf(false)
    var testing by mutableStateOf(false)
    var testMessage by mutableStateOf("")
    var modelPickerOpen by mutableStateOf(false)
    var confirmDelete by mutableStateOf(false)
    var headersSheetOpen by mutableStateOf(false)
    var apiFormatSheetOpen by mutableStateOf(false)
    var testState by mutableStateOf<ModelTestState?>(null)

    fun syncFrom(configs: List<ModelConfig>, target: ModelTarget) {
        if (dirty) return
        val current = configs.firstOrNull { it.id == form.id }
        form = current ?: resolveInitialConfig(configs, target)
        dirty = target.draftId.isNotBlank() && current == null && form.id == target.draftId
        saveState = "idle"
        testMessage = ""
    }

    fun update(next: ModelConfig) {
        form = next
        dirty = true
        saveState = "idle"
        testMessage = ""
    }

    fun markSaving() {
        saveState = "saving"
    }

    fun markSaved() {
        dirty = false
        saveState = "saved"
    }

    fun selectConfig(selected: ModelConfig) {
        form = selected
        dirty = false
        saveState = "idle"
        testMessage = ""
    }

    fun startFetchModels(): Boolean {
        if (loadingModels) return false
        loadingModels = true
        return true
    }

    fun finishFetchModels(result: Result<ModelConfig>) {
        loadingModels = false
        result.onSuccess { fetched ->
            form = fetched
            dirty = false
            saveState = "saved"
            modelPickerOpen = true
            testMessage = ""
        }.onFailure { error ->
            testMessage = error.message ?: "读取模型失败"
        }
    }

    fun startTestConnection(): Boolean {
        if (testing) return false
        testing = true
        testMessage = ""
        testState = ModelTestState(
            steps = listOf(
                ModelTestStep("地址与密钥", status = ModelTestStatus.Running),
                ModelTestStep("模型列表"),
                ModelTestStep("工具调用", hint = "tools"),
            ),
        )
        return true
    }

    private fun updateStep(index: Int, transform: (ModelTestStep) -> ModelTestStep) {
        val current = testState ?: return
        testState = current.copy(
            steps = current.steps.mapIndexed { itemIndex, step ->
                if (itemIndex == index) transform(step) else step
            },
        )
    }

    // The models call proves the address and key in one real request, so both rows settle together.
    fun finishConnectionStage(result: Result<ModelConfig>) {
        result.onSuccess { fetched ->
            form = fetched
            dirty = false
            saveState = "saved"
            updateStep(0) { it.copy(status = ModelTestStatus.Passed) }
            updateStep(1) {
                it.copy(status = ModelTestStatus.Passed, detail = "${fetched.modelOptions.size} 个")
            }
            updateStep(2) { it.copy(status = ModelTestStatus.Running) }
        }.onFailure { error ->
            updateStep(0) {
                it.copy(status = ModelTestStatus.Failed, detail = error.message?.take(24) ?: "失败")
            }
            testMessage = "当前接口格式测试失败，请尝试其他接口格式。"
            testState = testState?.copy(finished = true, formatFallbackSuggested = true)
            testing = false
        }
    }

    fun finishToolStage(result: Result<Unit>) {
        testing = false
        result.onSuccess {
            updateStep(2) { it.copy(status = ModelTestStatus.Passed, detail = "支持") }
            testState = testState?.copy(finished = true, toolsSupported = true)
        }.onFailure { error ->
            updateStep(2) {
                it.copy(status = ModelTestStatus.Failed, detail = error.message?.take(24) ?: "不支持")
            }
            testMessage = "当前接口格式未通过工具测试，请尝试其他接口格式。"
            testState = testState?.copy(
                finished = true,
                toolsSupported = false,
                formatFallbackSuggested = true,
            )
        }
    }

    fun dismissTest() {
        testState = null
    }

    fun deleteCurrent(providerConfigs: List<ModelConfig>): String {
        val deletedId = form.id
        val next = providerConfigs.firstOrNull { it.id != form.id }
        form = next ?: form.copy(
            name = "",
            apiKey = "",
            baseUrl = "",
            proxyUrl = "",
            model = "",
            modelOptions = emptyList(),
            apiKeyNeedsReentry = false,
            enabled = false,
            apiFormat = defaultApiFormatForProvider(form.provider),
        ).withProviderDefaults()
        dirty = false
        saveState = "saved"
        testMessage = ""
        return deletedId
    }
}

@Composable
internal fun rememberModelSettingsEditorState(
    configs: List<ModelConfig>,
    target: ModelTarget,
): ModelSettingsEditorState {
    val state = remember(target) {
        ModelSettingsEditorState(
            initialForm = resolveInitialConfig(configs, target),
            initialDirty = target.draftId.isNotBlank(),
        )
    }
    LaunchedEffect(configs, target) {
        // Refresh the version currently on screen without snapping back to the navigation target.
        state.syncFrom(configs, target)
    }
    return state
}

internal fun resolveInitialConfig(configs: List<ModelConfig>, target: ModelTarget): ModelConfig {
    if (target.draftId.isNotBlank()) {
        val provider = normalizeProviderId(target.providerId)
        return ModelConfig(
            id = target.draftId,
            provider = provider,
            apiFormat = defaultApiFormatForProvider(provider),
        ).withProviderDefaults()
    }
    val existing = configs.firstOrNull { it.id == target.configId }
        ?: configs.firstOrNull {
            normalizeProviderId(it.provider) == normalizeProviderId(target.providerId)
        }
    val initial = existing ?: run {
        val provider = normalizeProviderId(target.providerId)
        ModelConfig(provider = provider, apiFormat = defaultApiFormatForProvider(provider))
    }
    return initial.withProviderDefaults()
}
