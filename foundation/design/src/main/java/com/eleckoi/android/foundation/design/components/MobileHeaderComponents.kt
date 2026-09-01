package com.eleckoi.android.foundation.design.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.R

data class MobileHeaderMenuAction(
    val label: String,
    val icon: List<String>,
    // Null means the menu's own text colour. Set it only where the action is destructive.
    val tint: Color? = null,
    val dividerBefore: Boolean = false,
    val onClick: () -> Unit,
)

/** A visible but deliberately quiet Up affordance for every full-screen child destination. */
@Composable
fun QuietBackButton(
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    iconSize: Dp = 21.dp,
) {
    Box(
        modifier = modifier
            .semantics {
                contentDescription = "返回"
                role = Role.Button
            }
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        StrokeSvgIcon(
            paths = AppIconPaths.Back,
            color = color,
            iconSize = iconSize,
            strokeWidth = 1.9f,
        )
    }
}

@Composable
fun BubbleActionMenu(
    expanded: Boolean,
    actions: List<MobileHeaderMenuAction>,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
) {
    DropdownMenu(
        expanded = expanded,
        onDismissRequest = onDismiss,
        modifier = Modifier.widthIn(min = 180.dp, max = 260.dp),
        containerColor = appearance.mobileSurface,
        shape = RoundedCornerShape(16.dp),
        shadowElevation = 12.dp,
    ) {
        Spacer(modifier = Modifier.height(6.dp))
        actions.forEachIndexed { index, action ->
            if (action.dividerBefore && index > 0) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 5.dp)
                        .height(1.dp)
                        .background(appearance.mobileLine),
                )
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .noRippleClickable {
                        onDismiss()
                        action.onClick()
                    }
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val tint = action.tint ?: appearance.mobileText
                StrokeSvgIcon(action.icon, tint, iconSize = 21.dp, strokeWidth = 1.85f)
                Text(
                    action.label,
                    modifier = Modifier.padding(start = 12.dp),
                    color = tint,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(modifier = Modifier.height(6.dp))
    }
}

@Composable
fun MobileProfileHeader(
    userName: String,
    userAvatarPath: String,
    title: String,
    subtitle: String,
    appearance: AppearanceTheme,
    onSearch: (() -> Unit)? = null,
    onAdd: () -> Unit,
    onOpenProfile: () -> Unit,
    addMenuActions: List<MobileHeaderMenuAction> = emptyList(),
) {
    var addMenuOpen by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .padding(start = 15.dp, end = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .noRippleClickable(onClick = onOpenProfile),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AvatarCircle(
                name = userName.ifBlank { "用户" },
                avatarPath = userAvatarPath,
                size = 32,
                fontSize = 13,
                appearance = appearance,
                fallbackImage = R.raw.default_user_avatar_circle,
            )
            Column(
                modifier = Modifier
                    .padding(start = 9.dp)
                    .weight(1f),
            ) {
                Text(
                    text = title,
                    color = appearance.mobileText,
                    fontSize = 15.5.sp,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 17.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = subtitle,
                    color = appearance.mobileMuted,
                    fontSize = 11.5.sp,
                    lineHeight = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (onSearch != null) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .semantics {
                        contentDescription = "搜索"
                        role = Role.Button
                    }
                    .noRippleClickable(onClick = onSearch),
                contentAlignment = Alignment.Center,
            ) {
                DshSearchGlyph(tint = appearance.mobileText, iconSize = 21.dp)
            }
        }
        Box(
            modifier = Modifier
                .size(48.dp)
                .noRippleClickable {
                    if (addMenuActions.isEmpty()) onAdd() else addMenuOpen = true
                },
            contentAlignment = Alignment.Center,
        ) {
            StrokeSvgIcon(paths = AppIconPaths.Plus, color = appearance.mobileText, iconSize = 24.dp)
            BubbleActionMenu(
                expanded = addMenuOpen,
                actions = addMenuActions,
                appearance = appearance,
                onDismiss = { addMenuOpen = false },
            )
        }
    }
}
