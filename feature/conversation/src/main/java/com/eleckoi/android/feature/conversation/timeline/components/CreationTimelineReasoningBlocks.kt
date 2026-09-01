package com.eleckoi.android.feature.conversation.timeline.components

import com.eleckoi.android.feature.conversation.timeline.*

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.chat.ui.LocalChatRenderingPreferences
import com.eleckoi.android.feature.preferences.ChatReasoningDisplayMode

@Composable
fun ReasoningDetailBlock(
    stateKey: String,
    label: String,
    text: String,
    appearance: AppearanceTheme,
) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(
            text = label,
            color = appearance.mobileMuted,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        )
        ExpandableReasoningText(
            stateKey = stateKey,
            text = text,
            appearance = appearance,
        )
    }
}

@Composable
fun ExpandableReasoningText(
    stateKey: String,
    text: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val expandAll = LocalChatRenderingPreferences.current.reasoningDisplayMode ==
        ChatReasoningDisplayMode.Expanded
    var visibleLines by remember(stateKey) { mutableStateOf(ReasoningCollapsedLines) }
    var hasHiddenLines by remember(stateKey) { mutableStateOf(false) }
    val resolvedVisibleLines = if (expandAll) Int.MAX_VALUE else visibleLines
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(
            text = text.trim(),
            modifier = Modifier.fillMaxWidth(),
            color = appearance.mobileText.copy(alpha = 0.78f),
            fontSize = 13.sp,
            lineHeight = 20.sp,
            maxLines = resolvedVisibleLines,
            overflow = TextOverflow.Clip,
            onTextLayout = { result ->
                hasHiddenLines = result.hasVisualOverflow
            },
        )
        if (!expandAll && (hasHiddenLines || visibleLines > ReasoningCollapsedLines)) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (hasHiddenLines) {
                    Text(
                        text = "展示更多…",
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .clickable {
                                visibleLines += ReasoningExpandedLineStep
                            }
                            .padding(vertical = 5.dp),
                        color = appearance.mobileBlue,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
                if (visibleLines > ReasoningCollapsedLines) {
                    Text(
                        text = "收起",
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .clickable {
                                visibleLines = ReasoningCollapsedLines
                            }
                            .padding(vertical = 5.dp),
                        color = appearance.mobileMuted,
                        fontSize = 12.5.sp,
                    )
                }
            }
        }
    }
}

@Composable
fun DetailTextBlock(
    label: String,
    text: String,
    appearance: AppearanceTheme,
    monospace: Boolean,
) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(
            text = label,
            color = appearance.mobileMuted,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
        )
        Text(
            text = text,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(13.dp))
                .background(appearance.mobileSearchBg)
                .padding(horizontal = 13.dp, vertical = 12.dp),
            color = appearance.mobileText,
            fontSize = if (monospace) 12.sp else 13.sp,
            lineHeight = if (monospace) 18.sp else 20.sp,
            fontFamily = if (monospace) FontFamily.Monospace else FontFamily.Default,
        )
    }
}
