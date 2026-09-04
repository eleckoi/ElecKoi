package com.eleckoi.android.feature.studio.ui.assistant.composer

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.engine.workspace.model.CreatorWorkspaceCharacterRoot
import com.eleckoi.android.engine.workspace.model.CreatorWorkspaceRootAccess
import com.eleckoi.android.feature.characters.model.CharacterSlot
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AvatarCircle
import com.eleckoi.android.foundation.design.components.SquareSelectionCheck
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon

@Composable
internal fun SectionHeading(
    text: String,
    appearance: AppearanceTheme,
    topPadding: Dp = 0.dp,
) {
    Text(
        text = text,
        color = appearance.mobileText,
        fontSize = 14.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(top = topPadding, bottom = 2.dp).semantics { heading() },
    )
}

@Composable
internal fun QuietMessage(text: String, appearance: AppearanceTheme) {
    Text(
        text = text,
        color = appearance.mobileMuted,
        fontSize = 13.sp,
        lineHeight = 19.sp,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 10.dp),
    )
}

@Composable
internal fun CreatorRootRow(
    root: CreatorWorkspaceCharacterRoot,
    character: CharacterSlot?,
    isPrimary: Boolean,
    enabled: Boolean,
    appearance: AppearanceTheme,
    onSetPrimary: () -> Unit,
    onAccessChange: (CreatorWorkspaceRootAccess) -> Unit,
    onDetach: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(appearance.mobileSurface)
            .padding(start = 8.dp, end = 4.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .selectable(
                    selected = isPrimary,
                    enabled = enabled && !isPrimary,
                    role = Role.RadioButton,
                    onClick = onSetPrimary,
                ),
            contentAlignment = Alignment.Center,
        ) {
            SquareSelectionCheck(
                selected = isPrimary,
                appearance = appearance,
                enabled = enabled || isPrimary,
            )
        }
        AvatarCircle(
            name = character?.name ?: root.alias.ifBlank { "?" },
            size = 38,
            fontSize = 14,
            appearance = appearance,
            avatarPath = character?.avatar.orEmpty(),
        )
        Column(modifier = Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text(
                text = character?.name ?: root.alias.ifBlank { "角色不可用" },
                color = appearance.mobileText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = if (isPrimary) {
                    "主角色 · 可写"
                } else if (root.access == CreatorWorkspaceRootAccess.ReadWrite) {
                    "参考角色 · 可写"
                } else {
                    "参考角色 · 只读"
                },
                color = appearance.mobileMuted,
                fontSize = 11.5.sp,
                modifier = Modifier.padding(top = 2.dp),
            )
        }
        if (!isPrimary) {
            TextButton(
                onClick = {
                    onAccessChange(
                        if (root.access == CreatorWorkspaceRootAccess.ReadWrite) {
                            CreatorWorkspaceRootAccess.ReadOnly
                        } else {
                            CreatorWorkspaceRootAccess.ReadWrite
                        },
                    )
                },
                enabled = enabled,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = appearance.mobileMuted,
                    disabledContentColor = appearance.mobileMuted.copy(alpha = 0.3f),
                ),
                modifier = Modifier.height(44.dp),
            ) {
                Text(
                    if (root.access == CreatorWorkspaceRootAccess.ReadWrite) "可写" else "只读",
                    fontSize = 12.sp,
                )
            }
        }
        IconButton(
            onClick = onDetach,
            enabled = enabled,
            modifier = Modifier.size(48.dp).semantics { contentDescription = "移除角色" },
        ) {
            StrokeSvgIcon(
                paths = AppIconPaths.Trash,
                color = if (enabled) appearance.mobileMuted else appearance.mobileMuted.copy(alpha = 0.3f),
                iconSize = 17.dp,
                strokeWidth = 1.65f,
            )
        }
    }
}

@Composable
internal fun CharacterDirectoryRow(
    character: CharacterSlot,
    attachedRoot: CreatorWorkspaceCharacterRoot?,
    enabled: Boolean,
    appearance: AppearanceTheme,
    onAttach: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().height(58.dp).padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarCircle(
            name = character.name,
            size = 36,
            fontSize = 13,
            appearance = appearance,
            avatarPath = character.avatar,
        )
        Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
            Text(
                text = character.name,
                color = appearance.mobileText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (character.group.isNotBlank()) {
                Text(
                    text = character.group,
                    color = appearance.mobileMuted,
                    fontSize = 11.5.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (attachedRoot != null) {
            Text(
                text = "已添加",
                color = appearance.mobileMuted,
                fontSize = 12.5.sp,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        } else {
            TextButton(
                onClick = onAttach,
                enabled = enabled,
                colors = ButtonDefaults.textButtonColors(
                    contentColor = appearance.mobileBlue,
                    disabledContentColor = appearance.mobileMuted.copy(alpha = 0.3f),
                ),
                modifier = Modifier.height(44.dp),
            ) {
                Text("添加", fontSize = 13.sp)
            }
        }
    }
}

@Composable
internal fun NewCharacterRow(
    value: String,
    enabled: Boolean,
    appearance: AppearanceTheme,
    onValueChange: (String) -> Unit,
    onCancel: () -> Unit,
    onCreate: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(appearance.mobileSurface)
            .padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .weight(1f)
                .height(42.dp)
                .clip(RoundedCornerShape(10.dp))
                .border(1.dp, appearance.mobileLine, RoundedCornerShape(10.dp))
                .padding(horizontal = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (value.isBlank()) Text("输入角色名称", color = appearance.mobileMuted, fontSize = 14.sp)
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                enabled = enabled,
                singleLine = true,
                textStyle = TextStyle(color = appearance.mobileText, fontSize = 14.sp),
                cursorBrush = SolidColor(appearance.mobileBlue),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        Spacer(Modifier.width(4.dp))
        TextButton(
            onClick = onCancel,
            enabled = enabled,
            colors = ButtonDefaults.textButtonColors(contentColor = appearance.mobileMuted),
            modifier = Modifier.height(44.dp),
        ) {
            Text("取消", fontSize = 13.sp)
        }
        TextButton(
            onClick = onCreate,
            enabled = enabled && value.isNotBlank(),
            colors = ButtonDefaults.textButtonColors(
                contentColor = appearance.mobileBlue,
                disabledContentColor = appearance.mobileMuted.copy(alpha = 0.3f),
            ),
            modifier = Modifier.height(44.dp),
        ) {
            Text("创建", fontSize = 13.sp, fontWeight = FontWeight.Medium)
        }
    }
}
