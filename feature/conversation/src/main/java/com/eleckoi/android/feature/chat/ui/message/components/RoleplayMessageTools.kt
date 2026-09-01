package com.eleckoi.android.feature.chat.ui.message

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.chat.model.ChatMessage
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.FilledSvgIcon
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.SvgCircle
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun RoleplayTools(
    modifier: Modifier = Modifier,
    controller: RoleplayToolbarController,
    message: ChatMessage,
    appearance: AppearanceTheme,
    isUser: Boolean,
    visible: Boolean,
    regenerateEnabled: Boolean,
    onRegenerate: (ChatMessage) -> Unit,
    onCopy: () -> Unit,
    onEdit: () -> Unit,
) {
    val expanded = controller.expandedMessageId == message.id
    var showingActions by remember(message.id) { mutableStateOf(false) }
    val swappedContentAlpha = remember(message.id) { Animatable(if (visible) 1f else 0f) }
    var processSheetOpen by remember(message.id) { mutableStateOf(false) }
    LaunchedEffect(expanded, visible) {
        if (!visible) {
            if (expanded) controller.dismiss()
            controller.finishCollapsePresentation(message.id)
            showingActions = false
            processSheetOpen = false
            swappedContentAlpha.snapTo(0f)
            return@LaunchedEffect
        }
        if (showingActions != expanded) {
            swappedContentAlpha.animateTo(
                targetValue = 0f,
                animationSpec = tween(
                    durationMillis = RoleplayToolFadeDurationMillis,
                    easing = RoleplayToolFadeEasing,
                ),
            )
            if (!expanded) {
                // Let the header reclaim its width only once the old action strip is invisible.
                controller.finishCollapsePresentation(message.id)
            }
            showingActions = expanded
            swappedContentAlpha.snapTo(0f)
        }
        swappedContentAlpha.animateTo(
            targetValue = 1f,
            animationSpec = tween(
                durationMillis = RoleplayToolFadeDurationMillis,
                easing = RoleplayToolFadeEasing,
            ),
        )
    }
    BackHandler(enabled = visible && expanded) { controller.dismiss() }
    if (visible && processSheetOpen) {
        ChatAgentProcessSheet(
            message = message,
            appearance = appearance,
            onDismiss = { processSheetOpen = false },
        )
    }
    Box(
        modifier = modifier
            .width(RoleplayToolbarExpandedWidth)
            .height(RoleplayToolSlotSize),
        contentAlignment = Alignment.TopEnd,
    ) {
        if (visible) {
            Row(
                modifier = Modifier.roleplayToolbarRegion(controller, message.id),
                horizontalArrangement = Arrangement.spacedBy(RoleplayToolGap),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    modifier = Modifier.graphicsLayer { alpha = swappedContentAlpha.value },
                ) {
                    if (!showingActions) {
                        OverflowDotsButton(
                            appearance = appearance,
                            enabled = !expanded,
                            onClick = { controller.expand(message.id) },
                        )
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(RoleplayToolGap)) {
                            if (!isUser) {
                                if (message.hasAgentProcessRecord()) {
                                    RoleplayToolIconButton(
                                        paths = AppIconPaths.History,
                                        contentDescription = "查看过程",
                                        appearance = appearance,
                                        onClick = {
                                            processSheetOpen = true
                                        },
                                    )
                                }
                                RoleplayToolIconButton(
                                    paths = AppIconPaths.Translate,
                                    contentDescription = "翻译",
                                    appearance = appearance,
                                    onClick = {},
                                )
                                RoleplayToolIconButton(
                                    paths = AppIconPaths.Speaker,
                                    contentDescription = "朗读",
                                    appearance = appearance,
                                    onClick = {},
                                )
                                RoleplayToolIconButton(
                                    paths = AppIconPaths.Refresh,
                                    contentDescription = "重新生成",
                                    appearance = appearance,
                                    enabled = regenerateEnabled,
                                    onClick = {
                                        onRegenerate(message)
                                    },
                                )
                            }
                            RoleplayToolIconButton(
                                paths = AppIconPaths.Copy,
                                contentDescription = "复制",
                                appearance = appearance,
                                onClick = onCopy,
                            )
                        }
                    }
                }
                EditPencilButton(
                    appearance = appearance,
                    onClick = onEdit,
                )
            }
        }
    }
}

@Composable
private fun EditPencilButton(appearance: AppearanceTheme, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(RoleplayToolSlotSize)
            .semantics {
                contentDescription = "编辑消息"
                role = Role.Button
            }
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.TopCenter,
    ) {
        FilledSvgIcon(
            paths = AppIconPaths.MessageEditPencil,
            color = appearance.mobileMuted,
            iconSize = 18.dp,
            viewportSize = 512f,
        )
    }
}

@Composable
private fun OverflowDotsButton(
    appearance: AppearanceTheme,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(RoleplayToolSlotSize)
            .semantics {
                contentDescription = "展开消息工具栏"
                role = Role.Button
            }
            .noRippleClickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.TopCenter,
    ) {
        StrokeSvgIcon(
            paths = emptyList(),
            circles = listOf(
                SvgCircle(5f, 12f, 2.25f, fill = true),
                SvgCircle(12f, 12f, 2.25f, fill = true),
                SvgCircle(19f, 12f, 2.25f, fill = true),
            ),
            color = appearance.mobileMuted,
            iconSize = 22.dp,
        )
    }
}

internal val RoleplayToolSlotSize = 26.dp
internal val RoleplayOpeningPagerMinWidth = 58.dp
internal val RoleplayToolGap = 2.dp
internal val RoleplayToolbarReservedWidth = (RoleplayToolSlotSize * 2) + RoleplayToolGap
internal val RoleplayToolbarExpandedWidth = (RoleplayToolSlotSize * 6) + (RoleplayToolGap * 5)
internal val RoleplayHeaderToolbarGap = 6.dp
internal const val OpeningPageTransitionDurationMillis = 180
internal val OpeningPageTransitionEasing = CubicBezierEasing(0.2f, 0f, 0f, 1f)
private const val RoleplayToolFadeDurationMillis = 125
private val RoleplayToolFadeEasing = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

@Composable
private fun RoleplayToolIconButton(
    paths: List<String>,
    contentDescription: String,
    appearance: AppearanceTheme,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(RoleplayToolSlotSize)
            .semantics {
                this.contentDescription = contentDescription
                role = Role.Button
            }
            .noRippleClickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.TopCenter,
    ) {
        StrokeSvgIcon(
            paths = paths,
            color = if (enabled) {
                appearance.mobileMuted
            } else {
                appearance.mobileSoft.copy(alpha = 0.58f)
            },
            iconSize = 19.dp,
            strokeWidth = 1.85f,
        )
    }
}

@Composable
internal fun ToolIconButton(
    paths: List<String>,
    appearance: AppearanceTheme,
    enabled: Boolean = true,
    onClick: () -> Unit = {},
) {
    Box(
        modifier = Modifier
            .size(24.dp)
            .then(if (enabled) Modifier.noRippleClickable(onClick = onClick) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        StrokeSvgIcon(
            paths = paths,
            color = if (enabled) appearance.mobileMuted else appearance.mobileSoft.copy(alpha = 0.58f),
            iconSize = 19.dp,
            strokeWidth = 1.85f,
        )
    }
}
