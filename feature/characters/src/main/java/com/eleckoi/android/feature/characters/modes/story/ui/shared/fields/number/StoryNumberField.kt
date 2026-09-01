package com.eleckoi.android.feature.characters.modes.story.ui.shared

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.imeBringIntoViewOnFocus
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.fieldPalette

@Composable
internal fun NumberSection(
    label: String,
    value: Int,
    minValue: Int,
    expanded: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    scrollState: ScrollState,
    imeBottomPx: Int,
    onValueChange: (Int) -> Unit,
    onTogglePreview: () -> Unit,
    showPreviewToggle: Boolean = true,
    previewAlwaysExpanded: Boolean = false,
    content: @Composable () -> Unit,
) {
    val field = appearance.fieldPalette()
    var focused by remember { mutableStateOf(false) }
    var draft by remember(value, minValue) {
        val text = value.coerceAtLeast(minValue).toString()
        mutableStateOf(TextFieldValue(text = text, selection = TextRange(text.length)))
    }

    fun commit(next: Int) {
        val normalized = next.coerceAtLeast(minValue)
        val text = normalized.toString()
        draft = TextFieldValue(text = text, selection = TextRange(text.length))
        onValueChange(normalized)
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(appearance.mobileSurface),
        ) {
            Text(
                label,
                color = appearance.mobileText,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 14.dp, top = 14.dp, end = 14.dp, bottom = 4.dp),
                maxLines = 1,
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (showPreviewToggle && !previewAlwaysExpanded) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        StrokeSvgIcon(
                            paths = if (expanded) AppIconPaths.ChevronDown else AppIconPaths.ChevronRight,
                            color = appearance.mobileMuted,
                            modifier = Modifier
                                .clip(StoryEditorShapes.Small)
                                .noRippleClickable(onClick = onTogglePreview),
                            iconSize = 13.dp,
                            strokeWidth = 1.7f,
                        )
                        Text(
                            if (expanded) "点击折叠" else "点击预览",
                            modifier = Modifier
                                .padding(start = 2.dp)
                                .clip(StoryEditorShapes.Small)
                                .noRippleClickable(onClick = onTogglePreview),
                            color = appearance.mobileMuted,
                            fontSize = 13.sp,
                            maxLines = 1,
                        )
                    }
                }
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End,
                ) {
                    if (focused) {
                        Text(
                            "整数 >= $minValue",
                            color = appearance.mobileBlue,
                            fontSize = 10.sp,
                            lineHeight = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(end = 6.dp),
                        )
                    }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StepButton("-", appearance) { commit(value - 1) }
                    Box(
                        modifier = Modifier
                            .size(width = 42.dp, height = 32.dp)
                            .border(
                                if (focused) 1.dp else 0.5.dp,
                                if (focused) field.focusedBorder else field.border,
                                RoundedCornerShape(9.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        BasicTextField(
                            value = draft,
                            onValueChange = { raw ->
                                val digits = raw.text.filter { it.isDigit() }.take(6)
                                val selection = raw.selection.end.coerceIn(0, digits.length)
                                draft = TextFieldValue(text = digits, selection = TextRange(selection))
                                digits.toIntOrNull()?.let { onValueChange(it.coerceAtLeast(minValue)) }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .imeBringIntoViewOnFocus(scrollState, imeBottomPx)
                                .onFocusChanged { state ->
                                    val wasFocused = focused
                                    focused = state.isFocused
                                    when {
                                        state.isFocused && !wasFocused -> {
                                            draft = draft.copy(selection = TextRange(0, draft.text.length))
                                        }
                                        !state.isFocused && wasFocused -> {
                                            commit(draft.text.toIntOrNull() ?: minValue)
                                        }
                                    }
                                },
                            textStyle = TextStyle(
                                color = appearance.mobileText,
                                fontSize = 15.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.SemiBold,
                                textAlign = TextAlign.Center,
                            ),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            singleLine = true,
                            cursorBrush = SolidColor(appearance.mobileBlue),
                        )
                    }
                    StepButton("+", appearance, modifier = Modifier.padding(start = 6.dp)) { commit(value + 1) }
                }
            }
            }
            if (expanded || previewAlwaysExpanded) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(1.dp)
                        .padding(horizontal = 12.dp)
                        .background(appearance.mobileMuted.copy(alpha = 0.10f)),
                )
                Box(modifier = Modifier.fillMaxWidth().padding(start = 12.dp, top = 10.dp, end = 12.dp, bottom = 12.dp)) {
                    content()
                }
            }
        }
    }
}
