package com.eleckoi.android.feature.modelconfig.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import com.eleckoi.android.engine.generation.config.ModelConfigCollection
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.isImageGenerationConfig
import com.eleckoi.android.feature.modelconfig.ui.settings.ModelSettingsContent
import com.eleckoi.android.feature.modelconfig.ui.settings.modelPickerItems
import com.eleckoi.android.feature.modelconfig.ui.settings.rememberModelSettingsEditorState
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSettingsHeader
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.ConfirmDialog
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import kotlinx.coroutines.delay

internal typealias ModelSettingsEditorState =
    com.eleckoi.android.feature.modelconfig.ui.settings.ModelSettingsEditorState

@Composable
fun ModelSettingsPage(
    models: ModelConfigCollection?,
    target: ModelTarget,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onSave: (ModelConfig) -> Unit,
    onCreateConfig: (String) -> Unit,
    onDeleteConfig: (String) -> Unit,
    onFetchModels: (ModelConfig, (Result<ModelConfig>) -> Unit) -> Unit,
    onTestConnection: (ModelConfig, (Result<Unit>) -> Unit) -> Unit,
) {
    val configs = models?.configs.orEmpty()
    val editorState = rememberModelSettingsEditorState(configs, target)
    val form = editorState.form
    val provider = providerMeta(form.provider)
    val isImageProvider = form.isImageGenerationConfig()
    val providerConfigs = configs
        .filter { normalizeProviderId(it.provider) == normalizeProviderId(form.provider) }
        .let { list ->
            if (list.any { it.id == form.id } || form.id.isBlank()) list else list + form
        }

    LaunchedEffect(form, editorState.dirty) {
        if (!editorState.dirty) return@LaunchedEffect
        delay(800)
        editorState.markSaving()
        onSave(form)
        editorState.markSaved()
    }

    PinnedStatusScaffold(
        appearance = appearance,
        imeAware = false,
        backgroundColor = appearance.mobileBg,
    ) {
        ModelSettingsHeader(
            title = "模型配置",
            appearance = appearance,
            onBack = {
                if (editorState.dirty) onSave(editorState.form)
                onBack()
            },
        )
        ModelSettingsContent(
            state = editorState,
            provider = provider,
            providerConfigs = providerConfigs,
            isImageProvider = isImageProvider,
            appearance = appearance,
            onSave = onSave,
            onCreateConfig = onCreateConfig,
            onFetchModels = onFetchModels,
            onTestConnection = onTestConnection,
        )
    }

    editorState.testState?.let { state ->
        ModelConnectionTestDialog(
            state = state,
            modelLabel = editorState.form.model,
            appearance = appearance,
            onDismiss = editorState::dismissTest,
        )
    }

    if (editorState.headersSheetOpen) {
        ModelHeadersSheet(
            headers = editorState.form.customHeaders,
            appearance = appearance,
            onClose = { editorState.headersSheetOpen = false },
            onConfirm = { headers ->
                editorState.headersSheetOpen = false
                editorState.update(editorState.form.copy(customHeaders = headers))
            },
        )
    }

    if (editorState.apiFormatSheetOpen && !isImageProvider) {
        ModelApiFormatSheet(
            selected = editorState.form.apiFormat,
            appearance = appearance,
            onClose = { editorState.apiFormatSheetOpen = false },
            onSelect = { format ->
                editorState.apiFormatSheetOpen = false
                if (format != null) {
                    editorState.update(editorState.form.copy(apiFormat = format, supportsTools = null))
                }
            },
        )
    }

    if (editorState.modelPickerOpen && !isImageProvider) {
        ModelPickerSheet(
            items = modelPickerItems(editorState.form),
            activeModel = editorState.form.model,
            appearance = appearance,
            onClose = { editorState.modelPickerOpen = false },
            onSelect = { model ->
                editorState.update(editorState.form.copy(model = model))
                editorState.modelPickerOpen = false
            },
        )
    }

    if (editorState.confirmDelete) {
        ConfirmDialog(
            title = if (providerConfigs.size <= 1) "清空配置？" else "删除配置？",
            message = if (providerConfigs.size <= 1) {
                "这是当前模型库的最后一个配置，会清空参数并保留入口。"
            } else {
                "只删除这个配置版本，其他配置不受影响。"
            },
            appearance = appearance,
            confirmText = if (providerConfigs.size <= 1) "确认清空" else "确认删除",
            onDismiss = { editorState.confirmDelete = false },
            onConfirm = {
                editorState.confirmDelete = false
                onDeleteConfig(editorState.deleteCurrent(providerConfigs))
            },
        )
    }
}
