package com.eleckoi.android.feature.chat.ui.sheets.modelpicker

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.isOfficialDeepSeekVisionModel
import com.eleckoi.android.engine.generation.reasoning.DshReasoningEfforts
import com.eleckoi.android.feature.modelconfig.ui.components.ModelInlineField
import com.eleckoi.android.feature.modelconfig.ui.displayName
import com.eleckoi.android.feature.modelconfig.ui.reasoning.ModelReasoningSelector
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger

@Composable
internal fun ModelParamsPage(
    selectedConfig: ModelConfig?,
    selectedModel: String,
    streamEnabled: Boolean?,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onStreamChange: (Boolean) -> Unit,
    onOpenApiFormat: () -> Unit,
    onSaveConfig: (ModelConfig, (Result<ModelConfig>) -> Unit) -> Unit,
) {
    val option = remember(selectedConfig, selectedModel) {
        selectedConfig?.modelOptions?.firstOrNull { it.id == selectedModel }
            ?: selectedModel.takeIf { it.isNotBlank() }?.let(::ModelOption)
    }
    val editable = selectedConfig != null && option != null

    var contextWindow by rememberSaveable(selectedConfig?.id, selectedModel, option?.contextWindowTokens) {
        mutableStateOf(option?.contextWindowTokens?.toString().orEmpty())
    }
    var autoCompact by rememberSaveable(selectedConfig?.id, selectedModel, option?.autoCompactTokenLimit) {
        mutableStateOf(option?.autoCompactTokenLimit?.toString().orEmpty())
    }
    var maxOutput by rememberSaveable(selectedConfig?.id, selectedModel, option?.maxOutputTokens) {
        mutableStateOf(option?.maxOutputTokens?.toString().orEmpty())
    }
    var reasoningEffort by rememberSaveable(selectedConfig?.id, selectedModel, option?.reasoningEffort) {
        mutableStateOf(option?.reasoningEffort)
    }
    var supportsImageInput by rememberSaveable(selectedConfig?.id, selectedModel, option?.supportsImageInput) {
        mutableStateOf(option?.supportsImageInput == true)
    }
    var saveState by remember { mutableStateOf(ParamsSaveState.Idle) }
    val officialDeepSeekVision = remember(selectedConfig, selectedModel) {
        selectedConfig?.copy(model = selectedModel)?.isOfficialDeepSeekVisionModel() == true
    }
    val reasoningVariants = remember(selectedConfig, option) {
        if (selectedConfig == null || option == null) {
            emptyList()
        } else {
            DshReasoningEfforts.forModel(selectedConfig, option)
        }
    }

    val contextValue = contextWindow.toOptionalInt()
    val compactValue = autoCompact.toOptionalInt()
    val outputValue = maxOutput.toOptionalInt()
    val effectiveContext = contextValue ?: option?.contextWindowTokens

    val contextError = contextWindow.isNotBlank() && contextValue?.let {
        it in ModelOption.MinContextWindowTokens..ModelOption.MaxContextWindowTokens
    } != true
    val compactError = autoCompact.isNotBlank() && compactValue?.let {
        it in ModelOption.MinAutoCompactTokenLimit..ModelOption.MaxContextWindowTokens &&
            (effectiveContext == null || it <= effectiveContext)
    } != true
    val outputError = maxOutput.isNotBlank() && outputValue?.let {
        it >= ModelOption.MinMaxOutputTokens && (effectiveContext == null || it <= effectiveContext)
    } != true
    val hasError = contextError || compactError || outputError

    val pending = editable && !hasError && (
        contextValue != option.contextWindowTokens ||
            compactValue != option.autoCompactTokenLimit ||
            outputValue != option.maxOutputTokens ||
            reasoningEffort != option.reasoningEffort ||
            (!officialDeepSeekVision && supportsImageInput != option.supportsImageInput)
        )

    // Nothing is written while a value is out of range: half-typed numbers routinely fail the
    // cross-field checks, and persisting them would fight the person still typing.
    LaunchedEffect(
        pending,
        contextValue,
        compactValue,
        outputValue,
        reasoningEffort,
        supportsImageInput,
        officialDeepSeekVision,
    ) {
        if (!pending) return@LaunchedEffect
        saveState = ParamsSaveState.Saving
        kotlinx.coroutines.delay(600)
        val config = selectedConfig
        val current = option
        val updated = current.copy(
            contextWindowTokens = contextValue,
            autoCompactTokenLimit = compactValue,
            maxOutputTokens = outputValue,
            reasoningEffort = reasoningEffort,
            supportsImageInput = if (officialDeepSeekVision) {
                current.supportsImageInput
            } else {
                supportsImageInput
            },
        )
        val options = config.modelOptions.toMutableList().apply {
            val index = indexOfFirst { it.id == updated.id }
            if (index >= 0) this[index] = updated else add(updated)
        }
        onSaveConfig(config.copy(model = selectedModel, modelOptions = options)) { result ->
            saveState = if (result.isFailure) ParamsSaveState.Failed else ParamsSaveState.Saved
        }
    }
    LaunchedEffect(saveState) {
        if (saveState != ParamsSaveState.Saved) return@LaunchedEffect
        kotlinx.coroutines.delay(1800)
        saveState = ParamsSaveState.Idle
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 14.dp),
    ) {
        if (editable) {
            ParamsGroupLabel("连接", appearance)
            SheetGroupCard(appearance) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .noRippleClickable(onClick = onOpenApiFormat)
                        .padding(horizontal = 14.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("接口格式", modifier = Modifier.weight(1f), color = appearance.mobileText, fontSize = 15.sp)
                    Text(
                        option.apiFormatOverride?.displayName ?: "跟随连接",
                        color = appearance.mobileMuted,
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    StrokeSvgIcon(
                        AppIconPaths.ChevronRight,
                        appearance.mobileSoft,
                        iconSize = 15.dp,
                        modifier = Modifier.padding(start = 5.dp),
                    )
                }
            }

            ParamsGroupLabel("输入能力", appearance)
            SheetGroupCard(appearance) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f).padding(end = 10.dp)) {
                        Text("支持图片输入", color = appearance.mobileText, fontSize = 15.sp)
                        Text(
                            if (officialDeepSeekVision) {
                                "DeepSeek 官方视觉模型，已自动声明 input: [text, image]"
                            } else {
                                "向 DSH 声明 input: [text, image]"
                            },
                            color = appearance.mobileMuted,
                            fontSize = 11.sp,
                            lineHeight = 15.sp,
                            modifier = Modifier.padding(top = 2.dp),
                        )
                    }
                    Switch(
                        checked = officialDeepSeekVision || supportsImageInput,
                        enabled = !officialDeepSeekVision,
                        onCheckedChange = { supportsImageInput = it },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = appearance.mobileSurface,
                            checkedTrackColor = appearance.mobileText,
                            checkedBorderColor = appearance.mobileText,
                            uncheckedThumbColor = appearance.mobileSurface,
                            uncheckedTrackColor = appearance.mobileSoft,
                            uncheckedBorderColor = appearance.mobileSoft,
                            disabledCheckedThumbColor = appearance.mobileSurface,
                            disabledCheckedTrackColor = appearance.mobileText,
                            disabledCheckedBorderColor = appearance.mobileText,
                        ),
                    )
                }
            }
        }

        if (streamEnabled != null) {
            ParamsGroupLabel("输出", appearance)
            SheetGroupCard(appearance) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .noRippleClickable { onStreamChange(!streamEnabled) }
                        .padding(start = 14.dp, end = 12.dp, top = 8.dp, bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("流式输出", modifier = Modifier.weight(1f), color = appearance.mobileText, fontSize = 15.sp)
                    Switch(
                        checked = streamEnabled,
                        onCheckedChange = onStreamChange,
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = appearance.mobileSurface,
                            checkedTrackColor = appearance.mobileText,
                            checkedBorderColor = appearance.mobileText,
                            uncheckedThumbColor = appearance.mobileSurface,
                            uncheckedTrackColor = appearance.mobileSoft,
                            uncheckedBorderColor = appearance.mobileSoft,
                        ),
                    )
                }
            }
        }

        if (reasoningVariants.isNotEmpty()) {
            ParamsGroupLabel("推理", appearance)
            SheetGroupCard(appearance) {
                ModelReasoningSelector(
                    variants = reasoningVariants,
                    selectedVariant = reasoningEffort,
                    appearance = appearance,
                    onSelect = { reasoningEffort = it },
                )
            }
            Text(
                "档位由 DSH/pi-ai 按当前接口格式转换；默认不覆盖上游。",
                color = appearance.mobileSoft,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 9.dp),
            )
        }

        ParamsGroupLabel("上限", appearance)
        SheetGroupCard(appearance) {
            ModelInlineField(
                label = "上下文窗口",
                value = contextWindow,
                placeholder = if (editable) "272000" else "先选择模型",
                appearance = appearance,
                isError = contextError,
                onChange = { contextWindow = it.onlyDigits() },
            )
            SheetGroupDivider(appearance)
            ModelInlineField(
                label = "自动压缩阈值",
                value = autoCompact,
                placeholder = if (editable) autoCompactHint(effectiveContext) else "先选择模型",
                appearance = appearance,
                isError = compactError,
                onChange = { autoCompact = it.onlyDigits() },
            )
            SheetGroupDivider(appearance)
            ModelInlineField(
                label = "单次最大输出",
                value = maxOutput,
                placeholder = if (editable) "上游默认" else "先选择模型",
                appearance = appearance,
                isError = outputError,
                onChange = { maxOutput = it.onlyDigits() },
            )
        }

        val (note, noteColor) = paramsNote(
            editable = editable,
            contextError = contextError,
            compactError = compactError,
            outputError = outputError,
            saveState = saveState,
            appearance = appearance,
        )
        Text(
            note,
            color = noteColor,
            fontSize = 11.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 9.dp),
        )
    }
}

@Composable
private fun paramsNote(
    editable: Boolean,
    contextError: Boolean,
    compactError: Boolean,
    outputError: Boolean,
    saveState: ParamsSaveState,
    appearance: AppearanceTheme,
): Pair<String, Color> = when {
    !editable -> "先在「模型」页选一个模型，参数是跟着模型走的。" to appearance.mobileSoft
    contextError -> "上下文窗口需要在 ${ModelOption.MinContextWindowTokens} 到 ${ModelOption.MaxContextWindowTokens} 之间。" to ElecKoiDanger
    compactError -> "自动压缩阈值不能超过上下文窗口。" to ElecKoiDanger
    outputError -> "单次最大输出不能超过上下文窗口。" to ElecKoiDanger
    saveState == ParamsSaveState.Failed -> "保存失败，改一下再试。" to ElecKoiDanger
    saveState == ParamsSaveState.Saving -> "保存中…" to appearance.mobileMuted
    saveState == ParamsSaveState.Saved -> "已保存" to appearance.mobileMuted
    else -> "灰字是当前会被使用的值，填写后覆盖，清空即恢复。" to appearance.mobileSoft
}

private fun autoCompactHint(contextTokens: Int?): String {
    contextTokens ?: return "上下文的 90%"
    return (contextTokens.toLong() * 9 / 10).toString()
}

private fun String.toOptionalInt(): Int? = trim().takeIf(String::isNotEmpty)?.toIntOrNull()
