package com.eleckoi.android.feature.characters.modes.story.frontendbeauty.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AppSwitch
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun MessageFrontendRendererControl(
    enabled: Boolean,
    appearance: AppearanceTheme,
    onEnabledChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
        color = appearance.mobileSurface,
        border = BorderStroke(1.dp, appearance.mobileLine.copy(alpha = 0.74f)),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = "消息前端渲染",
                    color = appearance.mobileText,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = "运行完整 HTML 代码块；关闭后按代码显示",
                    color = appearance.mobileMuted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                )
            }
            AppSwitch(
                checked = enabled,
                onCheckedChange = onEnabledChange,
                appearance = appearance,
            )
        }
    }
}

@Composable
internal fun FrontendWorkspaceHeader(
    title: String,
    appearance: AppearanceTheme,
    onBack: () -> Unit,
    onOpenFiles: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .background(appearance.mobileBg)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        WorkspaceHeaderIcon(
            icon = AppIconPaths.Back,
            appearance = appearance,
            onClick = onBack,
        )
        Text(
            text = title,
            modifier = Modifier
                .weight(1f)
                .padding(start = 5.dp),
            color = appearance.mobileText,
            fontSize = 19.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        FileTreeButton(
            appearance = appearance,
            onClick = onOpenFiles,
        )
    }
}

@Composable
private fun WorkspaceHeaderIcon(
    icon: List<String>,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(46.dp)
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        StrokeSvgIcon(icon, appearance.mobileText, iconSize = 25.dp)
    }
}

@Composable
private fun FileTreeButton(
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
        color = appearance.mobileSurface,
        border = BorderStroke(1.dp, appearance.mobileLine),
    ) {
        Box(
            modifier = Modifier.size(42.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Rounded.FolderOpen,
                contentDescription = "前端文件",
                tint = appearance.mobileText,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}
