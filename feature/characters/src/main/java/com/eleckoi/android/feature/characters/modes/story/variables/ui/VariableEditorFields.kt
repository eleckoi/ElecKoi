package com.eleckoi.android.feature.characters.modes.story.variables.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.FormatListBulleted
import androidx.compose.material.icons.rounded.DataObject
import androidx.compose.material.icons.rounded.Numbers
import androidx.compose.material.icons.rounded.TextFields
import androidx.compose.material.icons.rounded.ToggleOn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.story.variables.model.VariableReadMode
import com.eleckoi.android.engine.story.variables.model.VariableValueType
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorCardSpacing
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorShapes
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun VariableReadModeSelector(
    selected: VariableReadMode,
    appearance: AppearanceTheme,
    onSelect: (VariableReadMode) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = StoryEditorCardSpacing)
            .clip(StoryEditorShapes.Card)
            .background(appearance.mobileSurface)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Text(
            "读取方式",
            color = appearance.mobileText,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 10.dp)
                .height(40.dp)
                .clip(StoryEditorShapes.Control)
                .background(appearance.mobileBg)
                .border(1.dp, appearance.mobileMuted.copy(alpha = 0.12f), StoryEditorShapes.Control)
                .padding(3.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            VariableReadMode.entries.forEach { mode ->
                val active = mode == selected
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .height(34.dp)
                        .clip(StoryEditorShapes.Small)
                        .background(if (active) appearance.mobileSurface else appearance.mobileBg)
                        .noRippleClickable { onSelect(mode) },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        mode.label,
                        color = if (active) appearance.mobileText else appearance.mobileMuted,
                        fontSize = 13.sp,
                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Medium,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
internal fun ReadOnlyVariablePathField(
    path: String,
    appearance: AppearanceTheme,
) {
    val horizontalScroll = rememberScrollState()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = StoryEditorCardSpacing)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp))
            .background(appearance.mobileSurface)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Text(
            "变量路径",
            color = appearance.mobileText,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 9.dp)
                .height(30.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                path,
                color = appearance.mobileMuted,
                fontSize = 13.sp,
                lineHeight = 17.sp,
                fontFamily = FontFamily.Monospace,
                maxLines = 1,
                modifier = Modifier.horizontalScroll(horizontalScroll),
            )
        }
    }
}

@Composable
internal fun ReadOnlyVariableField(
    label: String,
    value: String,
    appearance: AppearanceTheme,
    description: String = "",
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = StoryEditorCardSpacing)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp))
            .background(appearance.mobileSurface)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Text(
            label,
            color = appearance.mobileText,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            value.ifBlank { "未设置" },
            color = appearance.mobileText,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(top = 10.dp),
        )
        if (description.isNotBlank()) {
            Text(
                description,
                color = appearance.mobileMuted,
                fontSize = 11.sp,
                lineHeight = 16.sp,
                modifier = Modifier.padding(top = 5.dp),
            )
        }
    }
}

@Composable
internal fun ReadOnlyJsonPreviewField(
    label: String,
    value: String,
    description: String,
    appearance: AppearanceTheme,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = StoryEditorCardSpacing)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp))
            .background(appearance.mobileSurface)
            .padding(horizontal = 14.dp, vertical = 14.dp),
    ) {
        Text(
            label,
            color = appearance.mobileText,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        if (description.isNotBlank()) {
            Text(
                description,
                color = appearance.mobileMuted,
                fontSize = 11.5.sp,
                lineHeight = 16.sp,
                modifier = Modifier.padding(top = 4.dp),
            )
        }
        Box(modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
            SelectionContainer {
                Text(
                    value.ifBlank { "{}" },
                    color = appearance.mobileText,
                    fontSize = 13.sp,
                    lineHeight = 19.sp,
                    fontFamily = FontFamily.Monospace,
                )
            }
        }
    }
}

internal fun variableTypeDescription(type: VariableValueType): String {
    return when (type) {
        VariableValueType.Number -> "JS number，可保存整数或小数"
        VariableValueType.String -> "JS string，用于文字状态和描述"
        VariableValueType.Boolean -> "JS boolean，只保存 true / false"
        VariableValueType.Object -> "JSON object，由具名字段组成的对象"
        VariableValueType.Array -> "JSON array，有顺序的一组 JSON 值"
    }
}

internal fun variableTypeIcon(type: VariableValueType): ImageVector {
    return when (type) {
        VariableValueType.Number -> Icons.Rounded.Numbers
        VariableValueType.String -> Icons.Rounded.TextFields
        VariableValueType.Boolean -> Icons.Rounded.ToggleOn
        VariableValueType.Object -> Icons.Rounded.DataObject
        VariableValueType.Array -> Icons.AutoMirrored.Rounded.FormatListBulleted
    }
}

internal fun defaultValueLabel(type: String): String {
    return when (type) {
        VariableValueType.Array.raw -> "默认值（JSON 数组）"
        else -> "默认值"
    }
}

internal fun defaultValuePlaceholder(type: String): String {
    return when (type) {
        VariableValueType.Number.raw -> "例如 20"
        VariableValueType.String.raw -> "例如 校服"
        VariableValueType.Boolean.raw -> "true 或 false"
        VariableValueType.Array.raw -> "填写 JSON 数组，例如 [\"手机\", \"雨伞\"]"
        else -> "先选择数据结构"
    }
}
