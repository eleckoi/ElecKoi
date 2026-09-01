package com.eleckoi.android.feature.chat.ui.screen

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.AppearanceTheme

internal val ChatJumpToBottomButtonSize = 34.dp
val ChatJumpToBottomButtonGap = 8.dp

/** Shared jump control for every normally ordered conversation list. */
@Composable
fun ChatJumpToBottomButton(
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(ChatJumpToBottomButtonSize)
            .shadow(
                elevation = 4.dp,
                shape = CircleShape,
                clip = false,
                ambientColor = appearance.mobileText.copy(alpha = 0.06f),
                spotColor = appearance.mobileText.copy(alpha = 0.08f),
            )
            .clip(CircleShape)
            .background(appearance.mobileSurface.copy(alpha = 0.96f))
            .noRippleClickable(onClick = onClick)
            .semantics { contentDescription = "回到最新消息" },
        contentAlignment = Alignment.Center,
    ) {
        StrokeSvgIcon(
            paths = AppIconPaths.ChevronDown,
            color = appearance.mobileText,
            iconSize = 16.dp,
            strokeWidth = 1.7f,
        )
    }
}
