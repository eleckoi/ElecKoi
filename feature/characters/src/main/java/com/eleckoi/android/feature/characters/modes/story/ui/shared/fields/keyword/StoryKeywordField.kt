package com.eleckoi.android.feature.characters.modes.story.ui.shared

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.imeBringIntoViewOnFocus
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.fieldPalette

@Composable
@OptIn(ExperimentalLayoutApi::class)
internal fun KeywordInput(
    label: String,
    keywords: List<String>,
    appearance: AppearanceTheme,
    scrollState: ScrollState,
    imeBottomPx: Int,
    placeholder: String,
    groupedStyle: Boolean = false,
    onKeywordsChange: (List<String>) -> Unit,
) {
    var draft by remember { mutableStateOf("") }
    var wasFocused by remember { mutableStateOf(false) }
    val field = appearance.fieldPalette()
    val latestKeywords by rememberUpdatedState(keywords)
    val latestOnKeywordsChange by rememberUpdatedState(onKeywordsChange)

    fun commit(text: String = draft) {
        val additions = parseKeywords(text)
        if (additions.isNotEmpty()) {
            latestOnKeywordsChange((latestKeywords + additions).distinct())
        }
        draft = ""
    }

    // A keyword visually becomes a tag only after committing it. Leaving a field is a normal
    // mobile-editor commit action, so a typed final word must not vanish just because the author
    // did not type a comma or press the IME action first.
    DisposableEffect(Unit) {
        onDispose { commit() }
    }

    Column(modifier = Modifier.fillMaxWidth().padding(top = if (groupedStyle) StoryEditorCardSpacing else 11.dp)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(appearance.mobileSurface)
                .padding(horizontal = 14.dp, vertical = 12.dp),
        ) {
            Text(
                label,
                color = appearance.mobileText,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(bottom = 10.dp),
            )
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 76.dp)
                .border(
                        if (wasFocused) 1.dp else 0.5.dp,
                        if (wasFocused) field.focusedBorder else field.border,
                        RoundedCornerShape(14.dp),
                    )
                    .padding(10.dp),
                horizontalArrangement = Arrangement.spacedBy(7.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                keywords.forEach { keyword ->
                    Row(
                        modifier = Modifier
                            .height(31.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(appearance.mobilePinnedBg)
                            .padding(start = 10.dp, end = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(keyword, color = appearance.mobileBlue, fontSize = 12.sp, maxLines = 1)
                        Text(
                            "×",
                            modifier = Modifier.padding(start = 5.dp).noRippleClickable {
                                onKeywordsChange(keywords.filterNot { it == keyword })
                            },
                            color = appearance.mobileBlue,
                            fontSize = 13.sp,
                        )
                    }
                }
                Box(
                    modifier = Modifier.widthIn(min = 112.dp, max = 220.dp).height(31.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (draft.isBlank()) {
                        Text(
                            if (keywords.isEmpty()) placeholder else "继续输入",
                            color = appearance.mobileMuted,
                            fontSize = 12.sp,
                            maxLines = 1,
                        )
                    }
                    BasicTextField(
                        value = draft,
                        onValueChange = { raw ->
                            val delimiterIndex = raw.indexOfLast { it == ',' || it == '，' || it == '、' || it == '\n' }
                            if (delimiterIndex >= 0) {
                                val committedText = raw.substring(0, delimiterIndex)
                                val remainder = raw.substring(delimiterIndex + 1)
                                val additions = parseKeywords(committedText)
                                if (additions.isNotEmpty()) {
                                    onKeywordsChange((keywords + additions).distinct())
                                }
                                draft = remainder
                            } else {
                                draft = raw
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .imeBringIntoViewOnFocus(scrollState, imeBottomPx)
                            .onFocusChanged { state ->
                                if (wasFocused && !state.isFocused) commit()
                                wasFocused = state.isFocused
                            },
                        textStyle = TextStyle(color = appearance.mobileText, fontSize = 12.sp, lineHeight = 17.sp),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { commit() }),
                        singleLine = true,
                        cursorBrush = SolidColor(appearance.mobileBlue),
                    )
                }
            }
            val helperText = when (label) {
                "识别关键点" -> "描述什么情况下这条设定与当前对话有关，不需要写完整提示词。"
                "附加关键词" -> ""
                else -> "任意关键词命中即可触发；输入后切换焦点、离开页面或按完成会自动保存。"
            }
            if (helperText.isNotBlank()) {
                Text(
                    helperText,
                    color = appearance.mobileMuted,
                    fontSize = 10.sp,
                    lineHeight = 15.sp,
                    modifier = Modifier.padding(top = 9.dp),
                )
            }
        }
    }
}
