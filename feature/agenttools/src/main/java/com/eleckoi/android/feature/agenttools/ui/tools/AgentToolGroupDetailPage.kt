package com.eleckoi.android.feature.agenttools.ui.tools

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material.icons.Icons
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.feature.agenttools.AgentToolsViewModel
import com.eleckoi.android.feature.agenttools.model.PersonalToolGroupEntry
import com.eleckoi.android.feature.agenttools.model.PersonalToolGroupSource
import com.eleckoi.android.feature.agenttools.ui.components.AgentToolSwitch
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSettingsHeader
import com.eleckoi.android.feature.modelconfig.ui.configVersionName
import com.eleckoi.android.feature.chat.ui.sheets.ModelPickerLeadingChoice
import com.eleckoi.android.feature.chat.ui.sheets.ModelPickerConfigKind
import com.eleckoi.android.feature.chat.ui.sheets.ImageModelParamsMode
import com.eleckoi.android.feature.chat.ui.sheets.ModelPickerSheet
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.engine.agent.tools.AgentToolRequestPolicy
import com.eleckoi.android.engine.agent.tools.AgentToolScopes
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.isImageGenerationConfig

/**
 * The one place a tool group is allowed to explain itself. Authors decide whether to switch a
 * group on from what its individual tools can do, so the wire names and their descriptions are
 * shown verbatim rather than summarized.
 */
@Composable
fun AgentToolGroupDetailPage(
    appearance: AppearanceTheme,
    viewModel: AgentToolsViewModel,
    toolScopeId: String,
    groupId: String,
    onBack: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()
    var subagentModelPickerOpen by rememberSaveable(toolScopeId) { mutableStateOf(false) }
    var imageModelPickerOpen by rememberSaveable(toolScopeId) { mutableStateOf(false) }
    LaunchedEffect(toolScopeId) {
        viewModel.selectToolScope(toolScopeId)
    }

    val group = state.groups.firstOrNull { it.id == groupId }
    val isCreatorGroup = groupId == AgentToolRequestPolicy.BuiltInCreator
    val isImageConfigurationGroup =
        isCreatorGroup || groupId == AgentToolRequestPolicy.BuiltInAutoIllustration
    val selectedImageConfigId = state.imageModelConfigIds[groupId].orEmpty()
    val activeImageConfig = state.modelConfigs.firstOrNull {
        it.id == selectedImageConfigId && it.isImageGenerationConfig()
    }

    PinnedStatusScaffold(
        appearance = appearance,
        backgroundColor = appearance.mobileBg,
    ) {
        ModelSettingsHeader(group?.name.orEmpty().ifBlank { "工具" }, appearance, onBack)
        if (group == null) {
            Text(
                text = "这组工具已经不在当前会话里了",
                color = appearance.mobileMuted,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 24.dp),
            )
            return@PinnedStatusScaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 18.dp),
        ) {
            if (!isCreatorGroup) {
                DetailCard(appearance) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp)
                            .height(56.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = if (isImageConfigurationGroup) {
                                "启用自动配图"
                            } else {
                                "启用此工具组"
                            },
                            color = appearance.mobileText,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.weight(1f),
                        )
                        AgentToolSwitch(
                            checked = group.enabled,
                            appearance = appearance,
                            modifier = Modifier.semantics {
                                contentDescription = "${group.name}工具开关"
                            },
                            onCheckedChange = { viewModel.setPersonalToolGroupEnabled(group.id, it) },
                        )
                    }
                }
            }

            if (group.description.isNotBlank()) {
                Text(
                    text = group.description,
                    color = appearance.mobileMuted,
                    fontSize = 12.5.sp,
                    lineHeight = 19.sp,
                    modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 10.dp),
                )
            }

            if (group.id == AgentToolRequestPolicy.BuiltInCollaboration) {
                DetailLabel(text = "子 Agent 模型", appearance = appearance)
                DetailCard(appearance) {
                    SubagentModelSelector(
                        configs = state.modelConfigs,
                        selectedConfigId = state.subagentModelConfigId,
                        selectedModel = state.subagentModel,
                        appearance = appearance,
                        onOpen = { subagentModelPickerOpen = true },
                    )
                }
                Text(
                    text = "每个子 Agent 使用独立上下文。跟随主模型时复用当前对话模型；选择配置后，子 Agent 固定使用该配置的模型与参数。",
                    color = appearance.mobileMuted,
                    fontSize = 12.5.sp,
                    lineHeight = 19.sp,
                    modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 10.dp),
                )
            }

            if (isImageConfigurationGroup) {
                DetailLabel(
                    text = if (isCreatorGroup) "图片生成" else "绘图模型与参数",
                    appearance = appearance,
                )
                DetailCard(appearance) {
                    ImageModelSelector(
                        config = activeImageConfig,
                        onDemand = isCreatorGroup,
                        appearance = appearance,
                        onOpen = { imageModelPickerOpen = true },
                    )
                }
            }

            if (!isImageConfigurationGroup || isCreatorGroup) {
                DetailLabel(
                    text = if (group.tools.isEmpty()) "工具" else "包含 ${group.tools.size} 个工具",
                    appearance = appearance,
                )
                DetailCard(appearance) {
                    if (group.tools.isEmpty()) {
                        Text(
                            text = "还没有读取到这组工具的清单",
                            color = appearance.mobileMuted,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 18.dp),
                        )
                    } else {
                        group.tools.forEachIndexed { index, tool ->
                            if (index > 0) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(horizontal = 14.dp),
                                    thickness = 0.5.dp,
                                    color = appearance.mobileText.copy(alpha = 0.07f),
                                )
                            }
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                            ) {
                                Text(
                                    text = tool.name,
                                    color = appearance.mobileText,
                                    fontSize = 14.sp,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Medium,
                                )
                                if (tool.displayName.isNotBlank() && tool.displayName != tool.name) {
                                    Text(
                                        text = tool.displayName,
                                        color = appearance.mobileText.copy(alpha = 0.75f),
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(top = 3.dp),
                                    )
                                }
                                if (tool.description.isNotBlank()) {
                                    Text(
                                        text = tool.description,
                                        color = appearance.mobileMuted,
                                        fontSize = 12.5.sp,
                                        lineHeight = 19.sp,
                                        modifier = Modifier.padding(top = 3.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            DetailLabel(text = "来源", appearance = appearance)
            DetailCard(appearance) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp)
                        .height(54.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(30.dp)
                            .clip(RoundedCornerShape(9.dp))
                            .background(group.accentColor(appearance).copy(alpha = 0.11f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = group.icon(),
                            contentDescription = null,
                            tint = group.accentColor(appearance),
                            modifier = Modifier.size(17.dp),
                        )
                    }
                    Spacer(Modifier.width(11.dp))
                    Text(
                        text = group.sourceLabel(),
                        color = appearance.mobileText,
                        fontSize = 15.sp,
                    )
                }
            }
            Spacer(Modifier.height(40.dp))
        }
    }
    if (subagentModelPickerOpen) {
        ModelPickerSheet(
            configs = state.modelConfigs,
            selectedConfigId = state.subagentModelConfigId,
            selectedModel = state.subagentModel,
            streamEnabled = null,
            appearance = appearance,
            onDismiss = { subagentModelPickerOpen = false },
            onSelect = { configId, model ->
                viewModel.setSubagentModel(configId, model)
            },
            onStreamChange = {},
            onSaveConfig = viewModel::saveModelConfig,
            onRefreshModels = viewModel::refreshModels,
            title = "选择子 Agent 模型",
            leadingChoice = ModelPickerLeadingChoice(
                title = "跟随主模型",
                subtitle = "使用当前对话选择的模型与参数",
                selected = state.subagentModelConfigId.isBlank(),
                onSelect = {
                    viewModel.setSubagentModel("", "")
                },
            ),
        )
    }
    if (imageModelPickerOpen) {
        ModelPickerSheet(
            configs = state.modelConfigs,
            selectedConfigId = activeImageConfig?.id.orEmpty(),
            selectedModel = activeImageConfig?.model.orEmpty(),
            streamEnabled = null,
            characterImagePrompt = state.characterImagePrompt,
            appearance = appearance,
            onDismiss = { imageModelPickerOpen = false },
            onSelect = { configId, _ ->
                viewModel.setImageModel(groupId, configId)
            },
            onStreamChange = {},
            onSaveConfig = viewModel::saveImageModelConfig,
            onCharacterImagePromptChange = viewModel::saveCharacterImagePrompt,
            onRefreshModels = viewModel::refreshModels,
            title = if (isCreatorGroup) "图片生成设置" else "自动配图设置",
            configKind = ModelPickerConfigKind.Image,
            imageParamsMode = if (isCreatorGroup) {
                ImageModelParamsMode.OnDemand
            } else {
                ImageModelParamsMode.AutomaticIllustration
            },
            showCharacterImagePrompt =
                groupId == AgentToolRequestPolicy.BuiltInAutoIllustration &&
                    AgentToolScopes.characterId(toolScopeId) != null,
        )
    }
}

@Composable
private fun ImageModelSelector(
    config: ModelConfig?,
    onDemand: Boolean,
    appearance: AppearanceTheme,
    onOpen: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                role = androidx.compose.ui.semantics.Role.Button,
                onClickLabel = "配置绘图模型",
                onClick = onOpen,
            )
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = config?.let(::configVersionName) ?: "未配置绘图模型",
                color = appearance.mobileText,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            Text(
                text = config?.model.orEmpty().ifBlank {
                    if (onDemand) {
                        "选择模型并设置输出尺寸与生成参数"
                    } else {
                        "选择模型并设置分镜、画幅与提示词"
                    }
                },
                color = appearance.mobileMuted,
                fontSize = 12.5.sp,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
        StrokeSvgIcon(
            paths = AppIconPaths.ChevronRight,
            color = appearance.mobileSoft,
            iconSize = 17.dp,
        )
    }
}

@Composable
private fun SubagentModelSelector(
    configs: List<ModelConfig>,
    selectedConfigId: String,
    selectedModel: String,
    appearance: AppearanceTheme,
    onOpen: () -> Unit,
) {
    val selected = configs.firstOrNull { it.id == selectedConfigId }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                role = androidx.compose.ui.semantics.Role.Button,
                onClickLabel = "选择子 Agent 模型",
                onClick = onOpen,
            )
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = selected?.let(::configVersionName) ?: "跟随主模型",
                color = appearance.mobileText,
                fontSize = 15.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            Text(
                text = if (selected == null) {
                    "使用当前对话选择的模型与参数"
                } else {
                    selectedModel.ifBlank { selected.model }
                },
                color = appearance.mobileMuted,
                fontSize = 12.5.sp,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
        StrokeSvgIcon(
            paths = AppIconPaths.ChevronRight,
            color = appearance.mobileSoft,
            iconSize = 17.dp,
        )
    }
}

@Composable
private fun DetailCard(
    appearance: AppearanceTheme,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(appearance.mobileSurface),
    ) {
        content()
    }
}

@Composable
private fun DetailLabel(text: String, appearance: AppearanceTheme) {
    Text(
        text = text,
        color = appearance.mobileMuted,
        fontSize = 12.sp,
        modifier = Modifier.padding(start = 6.dp, top = 26.dp, bottom = 8.dp),
    )
}

private fun PersonalToolGroupEntry.sourceLabel(): String = when (source) {
    PersonalToolGroupSource.BuiltIn -> "ElecKoi 内置"
    PersonalToolGroupSource.Mcp -> sourceId.ifBlank { "MCP 服务器" }
    PersonalToolGroupSource.Extension -> sourceId.ifBlank { "扩展" }
}
