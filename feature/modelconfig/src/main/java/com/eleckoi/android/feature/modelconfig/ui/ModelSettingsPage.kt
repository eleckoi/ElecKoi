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
import com.eleckoi.android.foundation.design.components.ErrorDialog
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
            actionText = "删除",
            actionDanger = true,
            onAction = { editorState.confirmDelete = true },
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

    if (editorState.modelPickerOpen) {
        ModelPickerSheet(
            items = modelPickerItems(editorState.form),
            activeModel = editorState.form.model,
            appearance = appearance,
            onClose = { editorState.modelPickerOpen = false },
            onSelect = { model ->
                editorState.modelPickerOpen = false
                editorState.update(editorState.form.copy(model = model))
            },
        )
    }

    if (editorState.testState == null && editorState.testMessage.isNotBlank()) {
        ErrorDialog(
            message = editorState.testMessage,
            appearance = appearance,
            onDismiss = editorState::clearMessage,
        )
    }

    if (editorState.confirmDelete) {
        val deletesProviderEntry = providerConfigs.size <= 1 && !isFixedModelProvider(form.provider)
        ConfirmDialog(
            title = if (deletesProviderEntry) "删除渠道？" else "删除配置？",
            message = when {
                providerConfigs.size > 1 -> "只删除当前配置，其他配置不受影响。"
                deletesProviderEntry -> "将删除当前配置，并从模型页移除这个渠道入口。"
                else -> "将删除当前配置；模型页的固定入口会保留。"
            },
            appearance = appearance,
            confirmText = "确认删除",
            destructive = true,
            onDismiss = { editorState.confirmDelete = false },
            onConfirm = {
                editorState.confirmDelete = false
                onDeleteConfig(editorState.stopAutosaveForDelete())
                onBack()
            },
        )
    }
}
