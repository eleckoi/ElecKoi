package com.eleckoi.android.feature.settings.ui.websearch

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.modelconfig.ui.components.ModelActionButton
import com.eleckoi.android.feature.modelconfig.ui.components.ModelField
import com.eleckoi.android.feature.modelconfig.ui.components.ModelFieldGroup
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSectionHeader
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSectionNote
import com.eleckoi.android.feature.modelconfig.ui.components.ModelSettingsHeader
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.feature.settings.data.websearch.WebSearchMode
import kotlinx.coroutines.delay

@Composable
fun WebSearchSettingsPage(
    appearance: AppearanceTheme,
    viewModel: WebSearchSettingsViewModel,
    onBack: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()
    var apiKeyVisible by remember { mutableStateOf(false) }

    LaunchedEffect(apiKeyVisible) {
        if (apiKeyVisible) {
            delay(15_000)
            apiKeyVisible = false
        }
    }

    PinnedStatusScaffold(
        appearance = appearance,
        backgroundColor = appearance.mobileBg,
    ) {
        ModelSettingsHeader("联网搜索", appearance, onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(scrollState)
                .padding(horizontal = 18.dp, vertical = 16.dp),
        ) {
            ModelSectionHeader("搜索方式", appearance, actions = {})
            SearchModePicker(
                selected = state.mode,
                appearance = appearance,
                onSelect = {
                    viewModel.onIntent(WebSearchSettingsIntent.SetMode(it))
                },
            )
            ModelSectionNote(
                when (state.mode) {
                    WebSearchMode.ProviderNative ->
                        "DeepSeek 官方 Responses · 无需额外 Key"
                    WebSearchMode.Tavily ->
                        "适用于中转地址和其他模型"
                },
                appearance,
            )

            if (state.mode == WebSearchMode.Tavily) {
                ModelSectionHeader("连接", appearance, actions = {})
                ModelFieldGroup(appearance) {
                    ModelField(
                        label = "Tavily API Key",
                        value = state.apiKeyDraft,
                        placeholder = if (state.apiKeyConfigured) {
                            "已安全保存；输入新 Key 可替换"
                        } else {
                            "tvly-..."
                        },
                        appearance = appearance,
                        scrollState = scrollState,
                        trailingIcon = AppIconPaths.Eye,
                        trailingContentDescription = if (apiKeyVisible) {
                            "隐藏 API Key"
                        } else {
                            "显示 API Key 15 秒"
                        },
                        secureEntry = true,
                        secureEntryVisible = apiKeyVisible,
                        onTrailingClick = { apiKeyVisible = !apiKeyVisible },
                        onChange = {
                            viewModel.onIntent(WebSearchSettingsIntent.SetApiKeyDraft(it))
                        },
                    )
                }
                ModelSectionNote("Key 仅加密保存在手机中。", appearance)

                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (state.apiKeyConfigured) {
                        ModelActionButton(
                            text = "移除 Key",
                            icon = AppIconPaths.Trash,
                            appearance = appearance,
                            modifier = Modifier.weight(1f),
                        ) {
                            viewModel.onIntent(WebSearchSettingsIntent.RemoveApiKey)
                        }
                    }
                    ModelActionButton(
                        text = when {
                            state.testing -> "测试中"
                            state.apiKeyDraft.isNotBlank() -> "保存并测试"
                            else -> "测试连接"
                        },
                        icon = AppIconPaths.Plug,
                        appearance = appearance,
                        modifier = Modifier.weight(1f),
                        primary = true,
                    ) {
                        if (!state.testing) {
                            viewModel.onIntent(
                                if (state.apiKeyDraft.isNotBlank()) {
                                    WebSearchSettingsIntent.SaveAndTest
                                } else {
                                    WebSearchSettingsIntent.TestConnection
                                },
                            )
                        }
                    }
                }

                if (state.notice.isNotBlank() || state.errorMessage.isNotBlank()) {
                    Text(
                        text = state.errorMessage.ifBlank { state.notice },
                        color = if (state.errorMessage.isNotBlank()) {
                            ElecKoiDanger
                        } else {
                            appearance.mobileMuted
                        },
                        fontSize = 12.sp,
                        lineHeight = 18.sp,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 9.dp),
                    )
                }
                if (state.usageSummary.isNotBlank()) {
                    Text(
                        state.usageSummary,
                        color = appearance.mobileBlue,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(start = 6.dp, end = 6.dp, top = 2.dp),
                    )
                }

                ModelSectionHeader("搜索结果", appearance, actions = {})
                ResultLimitPicker(
                    selected = state.maxResults,
                    appearance = appearance,
                    onSelect = {
                        viewModel.onIntent(WebSearchSettingsIntent.SetMaxResults(it))
                    },
                )
                ModelSectionNote("结果越多，发送给模型的文本越多。", appearance)
            }

            ModelSectionNote("下次进入对话时生效。", appearance)
        }
    }
}

@Composable
private fun SearchModePicker(
    selected: WebSearchMode,
    appearance: AppearanceTheme,
    onSelect: (WebSearchMode) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SearchModeChoice(
            mode = WebSearchMode.ProviderNative,
            title = "模型原生",
            description = "无需 Key",
            selected = selected == WebSearchMode.ProviderNative,
            appearance = appearance,
            onSelect = onSelect,
        )
        SearchModeChoice(
            mode = WebSearchMode.Tavily,
            title = "Tavily",
            description = "使用 API Key",
            selected = selected == WebSearchMode.Tavily,
            appearance = appearance,
            onSelect = onSelect,
        )
    }
}

@Composable
private fun RowScope.SearchModeChoice(
    mode: WebSearchMode,
    title: String,
    description: String,
    selected: Boolean,
    appearance: AppearanceTheme,
    onSelect: (WebSearchMode) -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .weight(1f)
            .clip(RoundedCornerShape(18.dp))
            .background(
                if (selected) appearance.mobileBlue.copy(alpha = 0.10f)
                else appearance.mobileSurface,
            )
            .selectable(
                selected = selected,
                interactionSource = interactionSource,
                indication = null,
                role = Role.RadioButton,
                onClick = { onSelect(mode) },
            )
            .padding(horizontal = 14.dp, vertical = 15.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = if (selected) appearance.mobileBlue else appearance.mobileText,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = description,
                color = appearance.mobileMuted,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                modifier = Modifier.padding(top = 3.dp),
            )
        }
    }
}

@Composable
private fun ResultLimitPicker(
    selected: Int,
    appearance: AppearanceTheme,
    onSelect: (Int) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        listOf(3, 5, 8).forEach { count ->
            val active = selected == count
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (active) appearance.mobileText else appearance.mobileSurface)
                    .noRippleClickable { onSelect(count) }
                    .padding(vertical = 13.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "$count 条",
                    color = if (active) appearance.mobileSurface else appearance.mobileText,
                    fontSize = 14.sp,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                )
            }
        }
    }
}
