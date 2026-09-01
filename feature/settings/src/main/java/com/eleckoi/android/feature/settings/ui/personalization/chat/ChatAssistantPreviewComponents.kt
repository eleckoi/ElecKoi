package com.eleckoi.android.feature.settings.ui.personalization.chat

import com.eleckoi.android.feature.settings.ui.personalization.components.*

import com.eleckoi.android.foundation.design.components.noRippleClickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.chat.ui.blocks.reasoning.ReasoningIdeaCat
import com.eleckoi.android.feature.chat.ui.loading.CatThinkingIndicator
import com.eleckoi.android.feature.chat.ui.loading.DotsThinkingIndicator
import com.eleckoi.android.engine.agent.api.AgentWorkItemType
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineItem
import com.eleckoi.android.feature.conversation.timeline.model.CreationTimelineKind
import com.eleckoi.android.feature.conversation.timeline.ui.DshProcessedTurnTimeline
import com.eleckoi.android.feature.conversation.timeline.ui.turn.ProcessedTurnSection
import com.eleckoi.android.feature.conversation.timeline.CreationTurnUi
import com.eleckoi.android.feature.preferences.ChatTimelineThinkingAnimation
import com.eleckoi.android.feature.preferences.ChatToolTimelineStyle
import com.eleckoi.android.feature.preferences.ChatWaitingAnimation

// Same two-card control as the bubble shapes, except the drawing is the animation itself, running.
// A still frame of a loading animation tells you nothing about the thing you are choosing.
@Composable
internal fun AiAssistantTimelinePreview(
    style: ChatToolTimelineStyle,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    val previewTurn = remember {
        CreationTurnUi(
            id = "ai-assistant-settings-preview",
            user = null,
            processing = listOf(
                CreationTimelineItem(
                    id = "preview-reasoning",
                    kind = CreationTimelineKind.Assistant,
                    text = "整理需求与角色设定",
                ),
                CreationTimelineItem(
                    id = "preview-tool",
                    kind = CreationTimelineKind.Tool,
                    text = "角色设定",
                    workItemType = AgentWorkItemType.Tool,
                    toolName = "读取设定",
                ),
            ),
            chronologicalTail = emptyList(),
            finalAnswer = CreationTimelineItem(
                id = "preview-answer",
                kind = CreationTimelineKind.Assistant,
                text = "已经按你的要求整理好了。",
            ),
            running = false,
            startedAtMillis = 1_000L,
            completedAtMillis = 5_000L,
            diff = "",
            turnDiffObserved = false,
            paths = emptyList(),
        )
    }
    Column(
        modifier = modifier
            .background(appearance.mobileChatBg)
            .padding(horizontal = 20.dp, vertical = 18.dp),
    ) {
        Text(
            text = "AI",
            color = appearance.mobileText,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(12.dp))
        when (style) {
            ChatToolTimelineStyle.Codex -> ProcessedTurnSection(
                turn = previewTurn,
                appearance = appearance,
                onOpenDetail = {},
                animateGeometry = false,
                showInitialThinkingRow = false,
            )
            ChatToolTimelineStyle.Dsh -> DshProcessedTurnTimeline(
                turn = previewTurn,
                appearance = appearance,
                onOpenDetail = {},
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text(
            text = previewTurn.finalAnswer?.text.orEmpty(),
            color = appearance.mobileText,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
    }
}

@Composable
internal fun TimelineAnimationPreview(
    waitingAnimation: ChatWaitingAnimation,
    thinkingAnimation: ChatTimelineThinkingAnimation,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .background(appearance.mobileChatBg)
            .padding(horizontal = 20.dp, vertical = 18.dp),
    ) {
        Text(
            text = "AI",
            color = appearance.mobileText,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(modifier = Modifier.height(20.dp))
        Row(
            modifier = Modifier.height(42.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(width = 48.dp, height = 34.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                when (waitingAnimation) {
                    ChatWaitingAnimation.Dots -> DotsThinkingIndicator(appearance = appearance)
                    ChatWaitingAnimation.Cat -> CatThinkingIndicator(appearance = appearance)
                }
            }
            Text(
                text = "正在回复",
                color = appearance.mobileMuted,
                fontSize = 13.sp,
            )
        }
        HorizontalDivider(
            modifier = Modifier.padding(vertical = 12.dp),
            color = appearance.mobileLine,
        )
        Row(
            modifier = Modifier.height(42.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier.size(width = 48.dp, height = 34.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                ReasoningIdeaCat(
                    coverColor = appearance.mobileChatBg,
                    surfaceVisible = true,
                    animated = true,
                    styleOverride = thinkingAnimation,
                )
            }
            Text(
                text = "正在思考",
                color = appearance.mobileMuted,
                fontSize = 13.sp,
            )
        }
    }
}

@Composable
internal fun WaitingAnimationPicker(
    selected: ChatWaitingAnimation,
    appearance: AppearanceTheme,
    onSelect: (ChatWaitingAnimation) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        BubbleShapeOption(
            label = "三点",
            selected = selected == ChatWaitingAnimation.Dots,
            appearance = appearance,
            modifier = Modifier.weight(1f),
            onClick = { onSelect(ChatWaitingAnimation.Dots) },
        ) {
            DotsThinkingIndicator(appearance = appearance)
        }
        BubbleShapeOption(
            label = "鲸鱼娘",
            selected = selected == ChatWaitingAnimation.Cat,
            appearance = appearance,
            modifier = Modifier.weight(1f),
            onClick = { onSelect(ChatWaitingAnimation.Cat) },
        ) {
            CatThinkingIndicator(appearance = appearance)
        }
    }
}

@Composable
internal fun TimelineThinkingAnimationPicker(
    selected: ChatTimelineThinkingAnimation,
    appearance: AppearanceTheme,
    onSelect: (ChatTimelineThinkingAnimation) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        BubbleShapeOption(
            label = "三竖条",
            selected = selected == ChatTimelineThinkingAnimation.Bars,
            appearance = appearance,
            modifier = Modifier.weight(1f),
            onClick = { onSelect(ChatTimelineThinkingAnimation.Bars) },
        ) {
            ReasoningIdeaCat(
                coverColor = appearance.mobileSurface,
                surfaceVisible = true,
                animated = true,
                styleOverride = ChatTimelineThinkingAnimation.Bars,
            )
        }
        BubbleShapeOption(
            label = "半身",
            selected = selected == ChatTimelineThinkingAnimation.HalfBody,
            appearance = appearance,
            modifier = Modifier.weight(1f),
            onClick = { onSelect(ChatTimelineThinkingAnimation.HalfBody) },
        ) {
            ReasoningIdeaCat(
                coverColor = appearance.mobileSurface,
                surfaceVisible = true,
                animated = true,
                styleOverride = ChatTimelineThinkingAnimation.HalfBody,
            )
        }
        BubbleShapeOption(
            label = "大头",
            selected = selected == ChatTimelineThinkingAnimation.BigHead,
            appearance = appearance,
            modifier = Modifier.weight(1f),
            onClick = { onSelect(ChatTimelineThinkingAnimation.BigHead) },
        ) {
            ReasoningIdeaCat(
                coverColor = appearance.mobileSurface,
                surfaceVisible = true,
                animated = true,
                styleOverride = ChatTimelineThinkingAnimation.BigHead,
            )
        }
    }
}

internal data class ChatTextChoice<T>(
    val value: T,
    val label: String,
    val blurb: String,
)

@Composable
internal fun <T> ChatTextChoicePicker(
    choices: List<ChatTextChoice<T>>,
    selected: T,
    appearance: AppearanceTheme,
    onSelect: (T) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        choices.forEach { choice ->
            val isSelected = choice.value == selected
            val shape = RoundedCornerShape(12.dp)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(shape)
                    .background(appearance.mobileSurface)
                    .border(
                        width = if (isSelected) 1.5.dp else 0.5.dp,
                        color = if (isSelected) appearance.mobileText else appearance.mobileLine,
                        shape = shape,
                    )
                    .noRippleClickable { onSelect(choice.value) }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        text = choice.label,
                        color = appearance.mobileText,
                        fontSize = 14.sp,
                        fontWeight = if (isSelected) FontWeight.Medium else FontWeight.Normal,
                    )
                    Text(
                        text = choice.blurb,
                        color = appearance.mobileSoft,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
                if (isSelected) {
                    Icon(
                        imageVector = Icons.Rounded.Check,
                        contentDescription = null,
                        tint = appearance.mobileText,
                        modifier = Modifier
                            .padding(start = 12.dp)
                            .size(18.dp),
                    )
                }
            }
        }
    }
}

@Composable
internal fun BubbleShapeOption(
    label: String,
    selected: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    dimmed: Boolean = false,
    onClick: () -> Unit,
    diagram: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        modifier = modifier
            .clip(shape)
            .background(appearance.mobileSurface)
            .border(
                width = if (selected) 1.5.dp else 0.5.dp,
                color = if (selected) appearance.mobileText else appearance.mobileLine,
                shape = shape,
            )
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 11.dp),
    ) {
        // Fixed diagram height: the two drawings have different natural heights, which otherwise
        // makes one card taller than the other.
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(32.dp),
            contentAlignment = Alignment.Center,
        ) {
            diagram()
        }
        Spacer(modifier = Modifier.height(9.dp))
        Text(
            label,
            color = when {
                dimmed -> appearance.mobileLine
                selected -> appearance.mobileText
                else -> appearance.mobileMuted
            },
            fontSize = 12.sp,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
internal fun DiagramDot(size: Dp, appearance: AppearanceTheme) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(appearance.mobileSoft),
    )
}

@Composable
internal fun DiagramBar(modifier: Modifier, appearance: AppearanceTheme) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(4.dp))
            .background(appearance.mobileSearchBg),
    )
}
