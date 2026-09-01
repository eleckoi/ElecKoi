package com.eleckoi.android.feature.characters.modes.story.regex.ui

import com.eleckoi.android.feature.characters.modes.story.regex.ui.components.CompactSwitch

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AppInsetTextField
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.characters.modes.story.regex.data.RegexRuleProcessor
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRule
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleTarget
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorCardSpacing
import com.eleckoi.android.feature.characters.modes.story.ui.shared.storyEditorPalette
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger

private val EditorFieldShape = RoundedCornerShape(12.dp)
private val EditorGroupShape = RoundedCornerShape(16.dp)

@Composable
fun RegexRuleEditorSheet(
    rule: RegexRule,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onSave: (RegexRule) -> Unit,
    onDelete: (() -> Unit)?,
) {
    val palette = appearance.storyEditorPalette()
    var draft by remember(rule) { mutableStateOf(rule) }
    var saveAttempted by remember(rule.id) { mutableStateOf(false) }
    val patternError = when {
        draft.pattern.isBlank() -> "匹配式不能为空"
        else -> RegexRuleProcessor.validationMessage(draft)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Box(
            modifier = Modifier.fillMaxSize().background(palette.pageBg),
            contentAlignment = Alignment.TopCenter,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .widthIn(max = 720.dp)
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .imePadding(),
            ) {
                RegexEditorTopBar(
                    title = if (rule.name.isBlank()) "新建规则" else "编辑规则",
                    appearance = appearance,
                    onDismiss = onDismiss,
                    onSave = {
                        saveAttempted = true
                        if (patternError == null) onSave(draft)
                    },
                )

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(start = 18.dp, end = 18.dp, bottom = 28.dp),
                    verticalArrangement = Arrangement.spacedBy(StoryEditorCardSpacing),
                ) {
                    RegexEditorField(
                        label = "名称",
                        value = draft.name,
                        onValueChange = { draft = draft.copy(name = it) },
                        placeholder = "未命名规则",
                        appearance = appearance,
                    )
                    RegexEditorField(
                        label = "匹配式",
                        value = draft.pattern,
                        onValueChange = { draft = draft.copy(pattern = it) },
                        placeholder = "/表达式/gims",
                        hint = "标志写在末尾，例如 /文本/gi",
                        error = patternError.takeIf { saveAttempted },
                        monospace = true,
                        multiline = true,
                        appearance = appearance,
                    )
                    RegexEditorField(
                        label = "替换为",
                        value = draft.replacement,
                        onValueChange = { draft = draft.copy(replacement = it) },
                        placeholder = "留空表示删除",
                        hint = "支持 \$1、\$<名称>、\$&",
                        monospace = true,
                        multiline = true,
                        collapseLargeReplacement = true,
                        appearance = appearance,
                    )

                    RegexTargetSelector(
                        selected = draft.targets,
                        onSelectionChange = { draft = draft.copy(targets = it) },
                        appearance = appearance,
                    )

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(EditorGroupShape)
                            .background(appearance.mobileSurface),
                    ) {
                        RegexEditorSwitchRow(
                            label = "只改变聊天显示",
                            checked = draft.displayOnly,
                            appearance = appearance,
                            showDivider = true,
                            onCheckedChange = {
                                draft = draft.copy(displayOnly = !draft.displayOnly, promptOnly = false)
                            },
                        )
                        RegexEditorSwitchRow(
                            label = "只改变发送给 AI 的内容",
                            checked = draft.promptOnly,
                            appearance = appearance,
                            showDivider = true,
                            onCheckedChange = {
                                draft = draft.copy(promptOnly = !draft.promptOnly, displayOnly = false)
                            },
                        )
                        RegexEditorSwitchRow(
                            label = "编辑消息时运行",
                            checked = draft.runOnEdit,
                            appearance = appearance,
                            showDivider = false,
                            onCheckedChange = { draft = draft.copy(runOnEdit = !draft.runOnEdit) },
                        )
                    }

                    if (onDelete != null) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .noRippleClickable(onClick = onDelete),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            StrokeSvgIcon(AppIconPaths.Trash, ElecKoiDanger, iconSize = 17.dp, strokeWidth = 1.7f)
                            Text(
                                "删除规则",
                                modifier = Modifier.padding(start = 8.dp),
                                color = ElecKoiDanger,
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RegexEditorTopBar(
    title: String,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().height(60.dp).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "取消",
            modifier = Modifier.noRippleClickable(onClick = onDismiss).padding(horizontal = 10.dp, vertical = 12.dp),
            color = appearance.mobileMuted,
            fontSize = 14.sp,
        )
        Text(
            title,
            modifier = Modifier.weight(1f),
            color = appearance.mobileText,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Text(
            "保存",
            modifier = Modifier.noRippleClickable(onClick = onSave).padding(horizontal = 10.dp, vertical = 12.dp),
            color = appearance.mobileBlue,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun RegexEditorField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    appearance: AppearanceTheme,
    hint: String = "",
    error: String? = null,
    monospace: Boolean = false,
    multiline: Boolean = false,
    collapseLargeReplacement: Boolean = false,
) {
    val palette = appearance.storyEditorPalette()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(appearance.mobileSurface)
            .padding(horizontal = 14.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            label,
            color = appearance.mobileText,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        if (collapseLargeReplacement && shouldCollapseRegexReplacementEditor(value)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(EditorFieldShape)
                    .background(palette.track)
                    .padding(horizontal = 14.dp, vertical = 13.dp),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(
                    "大型前端源码已保留",
                    color = palette.bodyText,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    "${value.length} 字符。为避免手机文本排版卡死，此处不展开；保存其他设置不会改变源码。需要修改时请导出正则文件，编辑后重新导入。",
                    color = palette.meta,
                    fontSize = 11.5.sp,
                    lineHeight = 16.sp,
                )
            }
        } else {
            AppInsetTextField(
                value = value,
                onValueChange = onValueChange,
                appearance = appearance,
                placeholder = placeholder,
                modifier = Modifier
                    .heightIn(min = if (multiline) 74.dp else 48.dp, max = 120.dp),
                shape = EditorFieldShape,
                singleLine = !multiline,
                textStyle = TextStyle(
                    color = palette.bodyText,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default,
                ),
            )
        }
        if (error != null || hint.isNotBlank()) {
            Text(
                error ?: hint,
                modifier = Modifier.padding(horizontal = 2.dp),
                color = if (error != null) ElecKoiDanger else palette.meta,
                fontSize = 11.sp,
                lineHeight = 15.sp,
            )
        }
    }
}

internal fun shouldCollapseRegexReplacementEditor(value: String): Boolean =
    value.length > MaxInlineRegexReplacementCharacters

private const val MaxInlineRegexReplacementCharacters = 64 * 1024

@Composable
private fun RegexTargetSelector(
    selected: Set<RegexRuleTarget>,
    onSelectionChange: (Set<RegexRuleTarget>) -> Unit,
    appearance: AppearanceTheme,
) {
    val palette = appearance.storyEditorPalette()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(EditorGroupShape)
            .background(appearance.mobileSurface),
    ) {
        Text(
            "作用范围",
            modifier = Modifier.padding(start = 14.dp, top = 14.dp, end = 14.dp, bottom = 4.dp),
            color = appearance.mobileText,
            fontSize = 15.sp,
            lineHeight = 19.sp,
            fontWeight = FontWeight.SemiBold,
        )
        RegexRuleTarget.entries.forEachIndexed { index, target ->
            val checked = target in selected
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .noRippleClickable {
                        val next = if (checked) selected - target else selected + target
                        if (next.isNotEmpty()) onSelectionChange(next)
                    }
                    .padding(start = 6.dp, end = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(
                    checked = checked,
                    onCheckedChange = {
                        val next = if (checked) selected - target else selected + target
                        if (next.isNotEmpty()) onSelectionChange(next)
                    },
                    modifier = Modifier.size(42.dp),
                    colors = CheckboxDefaults.colors(
                        checkedColor = appearance.mobileBlue,
                        uncheckedColor = palette.meta.copy(alpha = 0.65f),
                        checkmarkColor = appearance.mobileAccentFg,
                    ),
                )
                Text(
                    target.label,
                    modifier = Modifier.padding(start = 4.dp),
                    color = palette.bodyText,
                    fontSize = 14.sp,
                )
            }
            if (index < RegexRuleTarget.entries.lastIndex) {
                Spacer(
                    Modifier
                        .fillMaxWidth()
                        .padding(start = 52.dp)
                        .height(1.dp)
                        .background(palette.divider),
                )
            }
        }
    }
}

@Composable
private fun RegexEditorSwitchRow(
    label: String,
    checked: Boolean,
    appearance: AppearanceTheme,
    showDivider: Boolean,
    onCheckedChange: () -> Unit,
) {
    val palette = appearance.storyEditorPalette()
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().height(52.dp).padding(start = 14.dp, end = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(label, modifier = Modifier.weight(1f), color = palette.bodyText, fontSize = 14.sp)
            CompactSwitch(checked = checked, appearance = appearance, onCheckedChange = onCheckedChange)
        }
        if (showDivider) {
            Spacer(Modifier.fillMaxWidth().padding(start = 14.dp).height(1.dp).background(palette.divider))
        }
    }
}
