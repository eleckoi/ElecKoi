package com.eleckoi.android.feature.chat.ui.sheets

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.ModelProviderIcon
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.isChatModelConfig
import com.eleckoi.android.engine.generation.model.isImageGenerationConfig
import com.eleckoi.android.feature.modelconfig.ui.ModelApiFormatSheet
import com.eleckoi.android.feature.modelconfig.ui.configVersionName
import com.eleckoi.android.feature.modelconfig.ui.providerMeta
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.fieldPalette
import com.eleckoi.android.feature.chat.ui.sheets.modelpicker.ConcreteModelsPage
import com.eleckoi.android.feature.chat.ui.sheets.modelpicker.ImageModelParamsPage
import com.eleckoi.android.feature.chat.ui.sheets.modelpicker.ModelParamsPage
import com.eleckoi.android.feature.chat.ui.sheets.modelpicker.ModelVersionGroup
import com.eleckoi.android.feature.chat.ui.sheets.modelpicker.ModelVersionsPage
import com.eleckoi.android.feature.chat.ui.sheets.modelpicker.pickerGroups

private enum class ModelPickerPage { Models, Params }

enum class ModelPickerConfigKind { Chat, Image }

data class ModelPickerLeadingChoice(
    val title: String,
    val subtitle: String,
    val selected: Boolean,
    val onSelect: () -> Unit,
)

@Composable
fun ModelPickerSheet(
    configs: List<ModelConfig>,
    selectedConfigId: String,
    selectedModel: String,
    streamEnabled: Boolean?,
    characterImagePrompt: String = "",
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onSelect: (configId: String, modelId: String) -> Unit,
    onStreamChange: (Boolean) -> Unit,
    onSaveConfig: (ModelConfig, (Result<ModelConfig>) -> Unit) -> Unit,
    onCharacterImagePromptChange: (String, (Result<String>) -> Unit) -> Unit = { _, callback ->
        callback(Result.failure(IllegalStateException("当前页面没有角色提示词")))
    },
    onRefreshModels: (ModelConfig, (Result<ModelConfig>) -> Unit) -> Unit,
    title: String = "选择模型",
    leadingChoice: ModelPickerLeadingChoice? = null,
    showParameters: Boolean = true,
    configKind: ModelPickerConfigKind = ModelPickerConfigKind.Chat,
    showCharacterImagePrompt: Boolean = true,
) {
    val visibleConfigs = remember(configs, configKind) {
        when (configKind) {
            ModelPickerConfigKind.Chat -> configs.filter(ModelConfig::isChatModelConfig)
            ModelPickerConfigKind.Image -> configs.filter(ModelConfig::isImageGenerationConfig)
        }
    }
    var focusedConfigId by rememberSaveable { mutableStateOf(selectedConfigId) }
    val selectedChatConfig = visibleConfigs.firstOrNull { it.id == selectedConfigId }
    val focusedConfig = visibleConfigs.firstOrNull { it.id == focusedConfigId }
        ?: selectedChatConfig
        ?: visibleConfigs.firstOrNull().takeUnless { leadingChoice?.selected == true }
    val activeModel = if (focusedConfig?.id == selectedConfigId) {
        selectedModel.ifBlank { focusedConfig.model }
    } else {
        focusedConfig?.model.orEmpty()
    }
    val activeModelLabel = activeModel
    // Grouped by provider, but on one page. Provider used to be its own drill-down level, which
    // cost a tap and a screen to say what a grey label says in place; flattening it entirely was
    // worse, because five providers with five versions each is one 25-row run with no seams.
    val groups = remember(visibleConfigs, focusedConfig?.id) {
        pickerGroups(visibleConfigs, focusedConfig?.id.orEmpty())
    }
    val versions = remember(groups) { groups.flatMap(ModelVersionGroup::configs) }

    var page by rememberSaveable { mutableStateOf(ModelPickerPage.Models) }
    var openConfigId by rememberSaveable { mutableStateOf("") }
    var versionQuery by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf("") }
    var refreshingConfigId by remember { mutableStateOf("") }
    var apiFormatSheetOpen by rememberSaveable { mutableStateOf(false) }

    val openConfig = versions.firstOrNull { it.id == openConfigId }
    val selectedImageConfigId = visibleConfigs.firstOrNull { config ->
        config.isImageGenerationConfig() && config.enabled
    }?.id.orEmpty()
    val canNavigateBack = openConfig != null || page != ModelPickerPage.Models
    val navigateBack: () -> Unit = {
        when {
            openConfig != null -> openConfigId = ""
            page != ModelPickerPage.Models -> page = ModelPickerPage.Models
        }
    }
    // A config can disappear underneath us while its model list is open.
    LaunchedEffect(openConfigId, openConfig) {
        if (openConfigId.isNotBlank() && openConfig == null) openConfigId = ""
    }
    FixedModalSheet(
        onDismissRequest = onDismiss,
        appearance = appearance,
    ) {
        // Register inside the sheet content so this nested-page handler takes precedence over the
        // modal's own dismiss handler. At the root, it is disabled and system back closes the sheet.
        BackHandler(enabled = canNavigateBack, onBack = navigateBack)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(),
        ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding(),
        ) {
            ModelPickerHeader(
                title = openConfig?.let(::configVersionName) ?: title,
                subtitle = if (leadingChoice?.selected == true) leadingChoice.title else activeModelLabel,
                subtitleProviderId = focusedConfig?.provider.orEmpty(),
                showSubtitle = openConfig == null,
                appearance = appearance,
                onBack = navigateBack.takeIf { canNavigateBack },
                onDismiss = onDismiss,
            )
            // The segment picks between two views of the same config; inside a config's model
            // list it would be picking between a page you are standing on and one you are not.
            if (openConfig == null && showParameters) {
                ModelPickerSegment(page, appearance) { page = it }
            }
            when {
                openConfig != null -> ConcreteModelsPage(
                    config = openConfig,
                    selectedConfigId = focusedConfig?.id.orEmpty(),
                    selectedModel = activeModel,
                    query = query,
                    refreshing = openConfig.id == refreshingConfigId,
                    appearance = appearance,
                    modifier = Modifier.weight(1f),
                    onQueryChange = { query = it },
                    onSelect = { modelId ->
                        focusedConfigId = openConfig.id
                        onSelect(openConfig.id, modelId)
                    },
                    onRefresh = {
                        if (refreshingConfigId.isNotEmpty()) return@ConcreteModelsPage
                        refreshingConfigId = openConfig.id
                        onRefreshModels(openConfig) { refreshingConfigId = "" }
                    },
                )

                page == ModelPickerPage.Models -> ModelVersionsPage(
                    groups = groups,
                    totalVersions = versions.size,
                    selectedChatConfigId = selectedConfigId,
                    selectedImageConfigId = selectedImageConfigId,
                    query = versionQuery,
                    appearance = appearance,
                    modifier = Modifier.weight(1f),
                    onQueryChange = { versionQuery = it },
                    onSelectConfig = { config ->
                        focusedConfigId = config.id
                        if (config.isImageGenerationConfig()) {
                            if (!config.enabled) onSaveConfig(config.copy(enabled = true)) {}
                        } else {
                            val defaultModel = config.model.ifBlank {
                                config.modelOptions.firstOrNull()?.id.orEmpty()
                            }
                            onSelect(config.id, defaultModel)
                        }
                    },
                    onOpenConfig = { config ->
                        query = ""
                        focusedConfigId = config.id
                        if (config.isImageGenerationConfig()) {
                            page = ModelPickerPage.Params
                            openConfigId = ""
                        } else {
                            openConfigId = config.id
                        }
                    },
                    leadingChoice = leadingChoice,
                )

                focusedConfig?.isImageGenerationConfig() == true -> ImageModelParamsPage(
                    selectedConfig = focusedConfig,
                    characterImagePrompt = characterImagePrompt,
                    appearance = appearance,
                    modifier = Modifier.weight(1f),
                    onSaveConfig = onSaveConfig,
                    onCharacterImagePromptChange = onCharacterImagePromptChange,
                    showCharacterImagePrompt = showCharacterImagePrompt,
                )

                else -> ModelParamsPage(
                    selectedConfig = focusedConfig,
                    selectedModel = activeModel,
                    streamEnabled = streamEnabled,
                    appearance = appearance,
                    modifier = Modifier.weight(1f),
                    onStreamChange = onStreamChange,
                    onOpenApiFormat = { apiFormatSheetOpen = true },
                    onSaveConfig = onSaveConfig,
                )
            }
        }
        if (apiFormatSheetOpen && focusedConfig != null && activeModel.isNotBlank()) {
            val activeOption = focusedConfig.modelOptions.firstOrNull { it.id == activeModel }
            ModelApiFormatSheet(
                selected = activeOption?.apiFormatOverride,
                inherited = focusedConfig.apiFormat,
                allowInherited = true,
                appearance = appearance,
                onClose = { apiFormatSheetOpen = false },
                onSelect = { format ->
                    apiFormatSheetOpen = false
                    val current = activeOption ?: ModelOption(activeModel, activeModel)
                    val updated = current.copy(apiFormatOverride = format)
                    val options = focusedConfig.modelOptions.toMutableList().apply {
                        val index = indexOfFirst { it.id == activeModel }
                        if (index >= 0) this[index] = updated else add(updated)
                    }
                    onSaveConfig(
                        focusedConfig.copy(model = activeModel, modelOptions = options, supportsTools = null),
                    ) {}
                },
            )
        }
        }
    }
}

@Composable
private fun ModelPickerHeader(
    title: String,
    subtitle: String,
    subtitleProviderId: String,
    showSubtitle: Boolean,
    appearance: AppearanceTheme,
    onBack: (() -> Unit)?,
    onDismiss: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (onBack != null) {
            Box(
                modifier = Modifier.size(30.dp).padding(top = 1.dp).noRippleClickable(onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                StrokeSvgIcon(AppIconPaths.ChevronLeft, appearance.mobileText, iconSize = 21.dp, strokeWidth = 1.9f)
            }
        }
        Column(modifier = Modifier.weight(1f).padding(start = if (onBack != null) 4.dp else 10.dp)) {
            Text(
                title,
                color = appearance.mobileText,
                fontSize = 20.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (showSubtitle) {
                Row(
                    modifier = Modifier.padding(top = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (subtitle.isNotBlank()) {
                        ModelProviderIcon(
                            providerId = subtitleProviderId,
                            initials = providerMeta(subtitleProviderId).initials,
                            appearance = appearance,
                            modifier = Modifier.size(15.dp),
                        )
                    }
                    Text(
                        subtitle.ifBlank { "尚未选择" },
                        modifier = Modifier.padding(start = if (subtitle.isNotBlank()) 5.dp else 0.dp),
                        color = appearance.mobileMuted,
                        fontSize = 12.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Box(
            modifier = Modifier.size(30.dp).noRippleClickable(onClick = onDismiss),
            contentAlignment = Alignment.Center,
        ) {
            StrokeSvgIcon(AppIconPaths.X, appearance.mobileText, iconSize = 19.dp, strokeWidth = 1.9f)
        }
    }
}

// 32dp, not 48. It used to be a full-height pill in semibold, louder than everything it switches
// between; the segment is a signpost, and the content is what matters.
@Composable
private fun ModelPickerSegment(
    page: ModelPickerPage,
    appearance: AppearanceTheme,
    onChange: (ModelPickerPage) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp)
            .height(32.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(appearance.fieldPalette().container)
            .padding(3.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        // "模型设置" under a heading that already says 选择模型 spent two of its four characters
        // repeating the heading.
        ModelPickerSegmentItem("模型", page == ModelPickerPage.Models, appearance, Modifier.weight(1f)) {
            onChange(ModelPickerPage.Models)
        }
        ModelPickerSegmentItem("参数", page == ModelPickerPage.Params, appearance, Modifier.weight(1f)) {
            onChange(ModelPickerPage.Params)
        }
    }
}

@Composable
private fun ModelPickerSegmentItem(
    label: String,
    selected: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .fillMaxHeight()
            .clip(RoundedCornerShape(7.dp))
            .background(if (selected) appearance.mobileSurface else Color.Transparent)
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = if (selected) appearance.mobileText else appearance.mobileMuted,
            fontSize = 12.5.sp,
        )
    }
}
