package com.eleckoi.android.feature.modelconfig.ui.settings

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.generation.model.ModelConfig
import com.eleckoi.android.engine.generation.model.ModelOption
import com.eleckoi.android.engine.generation.model.isOfficialDeepSeekVisionModel
import com.eleckoi.android.engine.generation.reasoning.DshReasoningEfforts
import com.eleckoi.android.feature.modelconfig.ui.components.ModelFieldDivider
import com.eleckoi.android.feature.modelconfig.ui.components.ModelFieldGroup
import com.eleckoi.android.feature.modelconfig.ui.components.ModelInlineField
import com.eleckoi.android.feature.modelconfig.ui.components.ModelNavigationRow
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSectionHeader
import com.eleckoi.android.feature.modelconfig.ui.reasoning.ModelReasoningSelector
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger

@Composable
internal fun ModelCapabilitySections(
    form: ModelConfig,
    appearance: AppearanceTheme,
    scrollState: ScrollState,
    imeBottomPx: Int,
    onUpdate: (ModelConfig) -> Unit,
) {
    val activeModelOption = form.modelOptions.firstOrNull { it.id == form.model.trim() }
    val reasoningVariants = activeModelOption
        ?.let { DshReasoningEfforts.forModel(form, it) }
        .orEmpty()

    ModelInputCapabilitySection(form, activeModelOption, appearance, onUpdate)
    if (reasoningVariants.isNotEmpty()) {
        ModelSectionHeader("推理", appearance, actions = {})
        ModelFieldGroup(appearance) {
            ModelReasoningSelector(
                variants = reasoningVariants,
                selectedVariant = activeModelOption?.reasoningEffort,
                appearance = appearance,
            ) { selected ->
                onUpdate(
                    form.updateActiveModelOption { option ->
                        option.copy(reasoningEffort = selected)
                    },
                )
            }
        }
    }
    ModelLimitSection(
        form = form,
        activeModelOption = activeModelOption,
        appearance = appearance,
        scrollState = scrollState,
        imeBottomPx = imeBottomPx,
        onUpdate = onUpdate,
    )
}

@Composable
private fun ModelInputCapabilitySection(
    form: ModelConfig,
    activeModelOption: ModelOption?,
    appearance: AppearanceTheme,
    onUpdate: (ModelConfig) -> Unit,
) {
    val officialDeepSeekVision = form.isOfficialDeepSeekVisionModel()
    ModelSectionHeader("输入能力", appearance, actions = {})
    ModelFieldGroup(appearance) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text("支持图片输入", color = appearance.mobileText, fontSize = 14.sp)
            }
            Switch(
                checked = officialDeepSeekVision || activeModelOption?.supportsImageInput == true,
                enabled = form.model.isNotBlank() && !officialDeepSeekVision,
                onCheckedChange = { enabled ->
                    onUpdate(
                        form.updateActiveModelOption { option ->
                            option.copy(supportsImageInput = enabled)
                        },
                    )
                },
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
                    disabledUncheckedThumbColor = appearance.mobileSurface.copy(alpha = 0.72f),
                    disabledUncheckedTrackColor = appearance.mobileMuted.copy(alpha = 0.18f),
                    disabledUncheckedBorderColor = Color.Transparent,
                ),
            )
        }
    }
}

@Composable
private fun ModelLimitSection(
    form: ModelConfig,
    activeModelOption: ModelOption?,
    appearance: AppearanceTheme,
    scrollState: ScrollState,
    imeBottomPx: Int,
    onUpdate: (ModelConfig) -> Unit,
) {
    ModelSectionHeader("上限", appearance, actions = {})
    ModelFieldGroup(appearance) {
        ModelInlineField(
            label = "上下文窗口",
            value = activeModelOption?.contextWindowTokens?.toString().orEmpty(),
            placeholder = if (form.model.isBlank()) {
                "先选模型"
            } else {
                "自动 ${ModelOption.AgentFallbackContextWindowTokens}"
            },
            appearance = appearance,
            scrollState = scrollState,
            imeBottomPx = imeBottomPx,
            keyboardType = KeyboardType.Number,
        ) { value ->
            onUpdate(
                form.updateActiveModelOption { option ->
                    option.copy(contextWindowTokens = value.optionalTokenCount())
                },
            )
        }
        ModelFieldDivider(appearance)
        ModelInlineField(
            label = "自动压缩阈值",
            value = activeModelOption?.autoCompactTokenLimit?.toString().orEmpty(),
            placeholder = if (form.model.isBlank()) {
                "先选模型"
            } else {
                val contextWindow = activeModelOption?.contextWindowTokens
                    ?: ModelOption.AgentFallbackContextWindowTokens
                val automaticLimit = contextWindow.toLong() *
                    ModelOption.AgentDefaultAutoCompactPercent / 100L
                "自动 $automaticLimit"
            },
            appearance = appearance,
            scrollState = scrollState,
            imeBottomPx = imeBottomPx,
            keyboardType = KeyboardType.Number,
        ) { value ->
            onUpdate(
                form.updateActiveModelOption { option ->
                    option.copy(autoCompactTokenLimit = value.optionalTokenCount())
                },
            )
        }
        ModelFieldDivider(appearance)
        ModelInlineField(
            label = "单次最大输出",
            value = activeModelOption?.maxOutputTokens?.toString().orEmpty(),
            placeholder = if (form.model.isBlank()) "先选模型" else "自动",
            appearance = appearance,
            scrollState = scrollState,
            imeBottomPx = imeBottomPx,
            keyboardType = KeyboardType.Number,
        ) { value ->
            onUpdate(
                form.updateActiveModelOption { option ->
                    option.copy(maxOutputTokens = value.optionalTokenCount())
                },
            )
        }
    }
    val limitHint = modelLimitHint(activeModelOption)
    if (limitHint.isNotBlank()) {
        Text(
            text = limitHint,
            color = ElecKoiDanger,
            fontSize = 11.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 8.dp),
        )
    }
}

@Composable
internal fun ModelNetworkSection(
    form: ModelConfig,
    appearance: AppearanceTheme,
    scrollState: ScrollState,
    imeBottomPx: Int,
    onOpenHeaders: () -> Unit,
    onUpdate: (ModelConfig) -> Unit,
) {
    ModelSectionHeader("网络", appearance, actions = {})
    ModelFieldGroup(appearance) {
        ModelInlineField(
            label = "代理",
            value = form.proxyUrl,
            placeholder = "可选",
            appearance = appearance,
            scrollState = scrollState,
            imeBottomPx = imeBottomPx,
            keyboardType = KeyboardType.Uri,
        ) { value ->
            onUpdate(form.copy(proxyUrl = value))
        }
        ModelFieldDivider(appearance)
        ModelNavigationRow(
            label = "自定义请求头",
            value = if (form.customHeaders.isEmpty()) "可选" else "${form.customHeaders.size} 条",
            valueMuted = form.customHeaders.isEmpty(),
            appearance = appearance,
            onClick = onOpenHeaders,
        )
    }
}
