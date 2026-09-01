package com.eleckoi.android.feature.characters.modes.story.variables.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.FormatListBulleted
import androidx.compose.material.icons.rounded.DataObject
import androidx.compose.material.icons.rounded.Numbers
import androidx.compose.material.icons.rounded.TextFields
import androidx.compose.material.icons.rounded.ToggleOn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.engine.story.variables.model.VariableItemConfig
import com.eleckoi.android.engine.story.variables.model.VariableObjectConfig
import com.eleckoi.android.engine.story.variables.model.VariableReadMode
import com.eleckoi.android.engine.story.variables.model.VariableValueType
import com.eleckoi.android.engine.story.variables.model.isInitializationObject
import com.eleckoi.android.feature.characters.modes.story.ui.shared.DropdownField
import com.eleckoi.android.feature.characters.modes.story.ui.shared.DropdownOption
import com.eleckoi.android.feature.characters.modes.story.ui.shared.PlainInput
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorCardSpacing
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorShapes
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorHeader
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun VariableObjectEditorPage(
    variableObject: VariableObjectConfig,
    variablePath: String,
    objectStateJson: String,
    initialStateJson: String,
    schemaCode: String,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onObjectChange: ((VariableObjectConfig) -> VariableObjectConfig) -> Unit,
    onObjectJsonChange: (String) -> String?,
    onSchemaCodeChange: (String) -> Unit,
) {
    val density = LocalDensity.current
    val imeBottomPx = WindowInsets.ime.getBottom(density)
    val imeBottom = with(density) { imeBottomPx.toDp() }
    val scrollState = rememberScrollState()
    val fixed = variableObject.isInitializationObject()
    var runtimeTab by remember { mutableStateOf(VariableRuntimeConfigTab.InitialState) }
    var objectJsonDraft by remember(variableObject.id) { mutableStateOf(objectStateJson) }
    var objectJsonError by remember(variableObject.id) { mutableStateOf("") }

    BackHandler(onBack = onBack)

    PinnedStatusScaffold(appearance = appearance, imeAware = false, backgroundColor = appearance.mobileBg) {
        StoryEditorHeader(
            title = variableObject.name.ifBlank { "变量组" },
            appearance = appearance,
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .background(appearance.mobileBg)
                .imePadding()
                .verticalScroll(scrollState)
                .padding(horizontal = 18.dp, vertical = 8.dp)
                .padding(bottom = 18.dp),
        ) {
            ReadOnlyVariablePathField(
                path = variablePath,
                appearance = appearance,
            )
            if (fixed) {
                VariableRuntimeConfigTabs(
                    selected = runtimeTab,
                    appearance = appearance,
                    onSelect = { runtimeTab = it },
                )
                when (runtimeTab) {
                    VariableRuntimeConfigTab.InitialState -> {
                        ReadOnlyJsonPreviewField(
                            label = "初始状态预览",
                            value = initialStateJson,
                            description = "根据变量组、数据结构和默认值自动生成；<...> 表示动态键模板，不会作为真实键写入运行状态。",
                            appearance = appearance,
                        )
                    }
                    VariableRuntimeConfigTab.Schema -> {
                        PlainInput(
                            label = "总校验配置",
                            value = schemaCode,
                            appearance = appearance,
                            scrollState = scrollState,
                            imeBottomPx = imeBottomPx,
                            minHeight = 300,
                            placeholder = "z.object({\n  世界: z.object({\n    当前天气: z.string(),\n    当前地点: z.string(),\n  }),\n  星见绫音: z.object({\n    好感度: z.number().min(0).max(100),\n    服装状态: z.enum([\"校服\", \"便服\", \"湿透校服\"]),\n  }),\n})",
                            immersiveTitle = "总校验配置",
                            groupedStyle = true,
                            onChange = onSchemaCodeChange,
                        )
                    }
                }
            } else {
                PlainInput(
                    label = "变量组名称",
                    value = variableObject.name,
                    appearance = appearance,
                    scrollState = scrollState,
                    imeBottomPx = imeBottomPx,
                    minHeight = 50,
                    placeholder = "变量组名称",
                    singleLine = true,
                    groupedStyle = true,
                    onChange = { value -> onObjectChange { it.copy(name = value.take(40)) } },
                )
                ReadOnlyVariableField(
                    label = "数据结构",
                    value = "object",
                    description = "JSON object：由具名字段组成，可以继续嵌套变量组和变量。",
                    appearance = appearance,
                )
                PlainInput(
                    label = "变量说明",
                    value = variableObject.description,
                    appearance = appearance,
                    scrollState = scrollState,
                    imeBottomPx = imeBottomPx,
                    minHeight = 100,
                    placeholder = "说明这个对象是什么、整体表达什么状态，供 Agent 选择和理解变量。",
                    immersiveTitle = "变量说明",
                    groupedStyle = true,
                    onChange = { value -> onObjectChange { it.copy(description = value) } },
                )
                PlainInput(
                    label = "更新规则",
                    value = variableObject.updateRule,
                    appearance = appearance,
                    scrollState = scrollState,
                    imeBottomPx = imeBottomPx,
                    minHeight = 180,
                    placeholder = "填写 Agent 在什么情况下应该更新这个对象，以及对象内部字段应遵循的整体规则。",
                    immersiveTitle = "更新规则",
                    groupedStyle = true,
                    onChange = { value -> onObjectChange { it.copy(updateRule = value) } },
                )
                PlainInput(
                    label = "对象内容（JSON）",
                    value = objectJsonDraft,
                    appearance = appearance,
                    scrollState = scrollState,
                    imeBottomPx = imeBottomPx,
                    minHeight = 180,
                    placeholder = "{\n  \"好感度\": 10,\n  \"服装\": \"校服\",\n  \"详细状态\": {\n    \"心情\": \"平静\"\n  }\n}",
                    immersiveTitle = "对象内容（JSON）",
                    groupedStyle = true,
                    onChange = { value ->
                        objectJsonDraft = value
                        objectJsonError = onObjectJsonChange(value).orEmpty()
                    },
                )
                Text(
                    text = objectJsonError.ifBlank { "输入有效 JSON 对象后，会自动同步为下面的变量组和变量。" },
                    color = if (objectJsonError.isBlank()) appearance.mobileMuted else appearance.mobileBlue,
                    fontSize = 11.5.sp,
                    lineHeight = 16.sp,
                    modifier = Modifier.padding(top = 5.dp, start = 2.dp),
                )
            }
        }
    }
}

private enum class VariableRuntimeConfigTab(
    val label: String,
) {
    InitialState("初始状态预览"),
    Schema("总校验配置"),
}

@Composable
private fun VariableRuntimeConfigTabs(
    selected: VariableRuntimeConfigTab,
    appearance: AppearanceTheme,
    onSelect: (VariableRuntimeConfigTab) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = StoryEditorCardSpacing)
            .height(40.dp)
            .clip(StoryEditorShapes.Control)
            .background(appearance.mobileSurface)
            .border(1.dp, appearance.mobileMuted.copy(alpha = 0.12f), StoryEditorShapes.Control)
            .padding(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        VariableRuntimeConfigTab.entries.forEach { tab ->
            val active = tab == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(34.dp)
                    .clip(StoryEditorShapes.Small)
                    .background(if (active) appearance.mobilePinnedBg else appearance.mobileSurface)
                    .noRippleClickable { onSelect(tab) },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    tab.label,
                    color = if (active) appearance.mobileText else appearance.mobileMuted,
                    fontSize = 13.sp,
                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
internal fun VariableItemEditorPage(
    variable: VariableItemConfig,
    variablePath: String,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onConvertToObject: () -> Unit,
    onVariableChange: ((VariableItemConfig) -> VariableItemConfig) -> Unit,
) {
    val density = LocalDensity.current
    val imeBottomPx = WindowInsets.ime.getBottom(density)
    val imeBottom = with(density) { imeBottomPx.toDp() }
    val scrollState = rememberScrollState()
    val typeOptions = VariableValueType.entries.map { type ->
        DropdownOption(
            title = type.raw,
            description = variableTypeDescription(type),
            leadingImageVector = variableTypeIcon(type),
        )
    }
    val selectedType = VariableValueType.entries.firstOrNull { it.raw == variable.type }

    BackHandler(onBack = onBack)

    PinnedStatusScaffold(appearance = appearance, imeAware = false, backgroundColor = appearance.mobileBg) {
        StoryEditorHeader(
            title = variable.title.ifBlank { "变量" },
            appearance = appearance,
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .background(appearance.mobileBg)
                .imePadding()
                .verticalScroll(scrollState)
                .padding(horizontal = 18.dp, vertical = 8.dp)
                .padding(bottom = 18.dp),
        ) {
            ReadOnlyVariablePathField(
                path = variablePath,
                appearance = appearance,
            )
            VariableReadModeSelector(
                selected = variable.readMode,
                appearance = appearance,
                onSelect = { readMode ->
                    onVariableChange { it.copy(readMode = readMode) }
                },
            )
            PlainInput(
                label = "变量名称",
                value = variable.title,
                appearance = appearance,
                scrollState = scrollState,
                imeBottomPx = imeBottomPx,
                minHeight = 50,
                placeholder = "变量名称",
                singleLine = true,
                groupedStyle = true,
                onChange = { value -> onVariableChange { it.copy(title = value.take(60)) } },
            )
            DropdownField(
                label = "数据结构",
                value = selectedType?.let {
                    DropdownOption(
                        title = it.raw,
                        description = variableTypeDescription(it),
                        leadingImageVector = variableTypeIcon(it),
                    )
                },
                placeholder = "请选择 JSON 数据结构",
                options = typeOptions,
                appearance = appearance,
                groupedStyle = true,
                onSelect = { index ->
                    val nextType = VariableValueType.entries[index]
                    if (nextType == VariableValueType.Object) {
                        onConvertToObject()
                    } else {
                        onVariableChange { it.copy(type = nextType.raw) }
                    }
                },
            )
            PlainInput(
                label = defaultValueLabel(variable.type),
                value = variable.defaultValue,
                appearance = appearance,
                scrollState = scrollState,
                imeBottomPx = imeBottomPx,
                minHeight = if (variable.type == VariableValueType.Array.raw) 120 else 50,
                placeholder = defaultValuePlaceholder(variable.type),
                singleLine = variable.type != VariableValueType.Array.raw,
                immersiveTitle = if (variable.type == VariableValueType.Array.raw) defaultValueLabel(variable.type) else null,
                groupedStyle = true,
                onChange = { value -> onVariableChange { it.copy(defaultValue = value) } },
            )
            PlainInput(
                label = "变量说明",
                value = variable.description,
                appearance = appearance,
                scrollState = scrollState,
                imeBottomPx = imeBottomPx,
                minHeight = 100,
                placeholder = "说明这个变量是什么、表达什么状态，供 Agent 选择和理解变量。",
                immersiveTitle = "变量说明",
                groupedStyle = true,
                onChange = { value -> onVariableChange { it.copy(description = value) } },
            )
            PlainInput(
                label = "更新规则",
                value = variable.updateRule,
                appearance = appearance,
                scrollState = scrollState,
                imeBottomPx = imeBottomPx,
                minHeight = 180,
                placeholder = "填写 Agent 在什么情况下应该更新这个变量，以及应该怎样更新。",
                immersiveTitle = "更新规则",
                groupedStyle = true,
                onChange = { value -> onVariableChange { it.copy(updateRule = value) } },
            )
        }
    }
}
