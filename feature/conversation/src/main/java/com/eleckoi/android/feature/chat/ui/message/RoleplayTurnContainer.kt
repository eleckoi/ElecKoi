package com.eleckoi.android.feature.chat.ui.message

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.AppearanceTheme

/** 正式消息和等待动画共用这一层，切换时头像、正文和卡片不会换坐标。 */
@Composable
internal fun RoleplayTurnContainer(
    cardPanel: Boolean,
    chatAreaInset: Dp,
    appearance: AppearanceTheme,
    content: @Composable () -> Unit,
) {
    if (cardPanel) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .layout { measurable, constraints ->
                    val bleed = chatAreaInset.roundToPx() * 2
                    val placeable = measurable.measure(
                        constraints.copy(
                            minWidth = constraints.maxWidth + bleed,
                            maxWidth = constraints.maxWidth + bleed,
                        ),
                    )
                    layout(constraints.maxWidth, placeable.height) {
                        placeable.place(-chatAreaInset.roundToPx(), 0)
                    }
                },
            color = appearance.mobileChatMessageBg.copy(alpha = RoleplayPanelAlpha),
            shape = RoundedCornerShape(RoleplayPanelCorner),
            border = BorderStroke(Dp.Hairline, appearance.mobileLine),
        ) {
            // The panel bleeds outward by [chatAreaInset] on both sides. Padding inward by that
            // exact same amount keeps the transcript's usable width identical to seamless mode.
            // A fixed 8dp padding changed every Markdown width key whenever the user's configured
            // chat inset was not exactly 8dp, so switching to cards briefly showed height-only
            // placeholders while every visible paragraph was laid out again.
            Box(
                modifier = Modifier.padding(
                    horizontal = chatAreaInset,
                    vertical = RoleplayPanelVerticalPadding,
                ),
            ) {
                content()
            }
        }
    } else {
        Box(modifier = Modifier.padding(top = RoleplaySeamlessTopPadding)) {
            content()
        }
    }
}

internal const val RoleplayPanelAlpha = 0.55f
private val RoleplayPanelCorner = 10.dp
private val RoleplayPanelVerticalPadding = 8.dp
private val RoleplaySeamlessTopPadding = 8.dp
