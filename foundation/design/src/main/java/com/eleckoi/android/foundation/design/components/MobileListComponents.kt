package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.selectionPalette

@Composable
fun MobileConversationRow(
    title: String,
    subtitle: String,
    avatarName: String,
    avatarPath: String = "",
    sideText: String,
    appearance: AppearanceTheme,
    selected: Boolean = false,
    pinned: Boolean = false,
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(62.dp)
            .themedListRowClickable(
                appearance = appearance,
                selected = selected,
                selectedBackground = appearance.mobileMuted.copy(alpha = 0.10f),
                onLongClick = onLongClick,
                onClick = onClick,
            ),
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 16.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AvatarCircle(avatarName, 45, 16, appearance, avatarPath)
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 9.dp),
            ) {
                Text(
                    text = title,
                    color = appearance.mobileText,
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 19.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = subtitle,
                    color = appearance.mobileMuted.copy(alpha = 0.72f),
                    fontSize = 12.5.sp,
                    lineHeight = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (sideText.isNotBlank()) {
                if (pinned) {
                    Icon(
                        imageVector = Icons.Outlined.PushPin,
                        contentDescription = "已置顶",
                        tint = appearance.mobileSoft,
                        modifier = Modifier
                            .padding(end = 7.dp)
                            .size(16.dp),
                    )
                }
                Text(
                    text = sideText,
                    color = appearance.mobileSoft,
                    fontSize = 13.sp,
                    lineHeight = 13.sp,
                )
            }
        }
    }
}

@Composable
fun SectionGap(appearance: AppearanceTheme) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(9.dp)
            .background(appearance.mobileSearchBg),
    )
}

@Composable
fun GroupRow(
    title: String,
    count: Int,
    appearance: AppearanceTheme,
    placeholder: String = count.toString(),
    collapsed: Boolean = false,
    onClick: () -> Unit = {},
) {
    val selection = appearance.selectionPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(46.dp)
            .noRippleClickable(onClick = onClick)
            .padding(start = 17.dp, end = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StrokeSvgIcon(
            paths = AppIconPaths.ChevronRight,
            color = appearance.mobileSoft,
            iconSize = 17.dp,
            strokeWidth = 1.9f,
            modifier = Modifier.graphicsLayer(rotationZ = if (collapsed) 0f else 90f),
        )
        Text(
            text = title,
            modifier = Modifier
                .weight(1f)
                .padding(start = 7.dp),
            color = selection.mutedText,
            fontSize = 16.sp,
            fontWeight = FontWeight.Normal,
        )
        Text(placeholder, color = selection.mutedText, fontSize = 12.5.sp)
    }
}

@Composable
fun MobileEmptyState(text: String, appearance: AppearanceTheme) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(180.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = appearance.mobileMuted, fontSize = 15.sp)
    }
}
