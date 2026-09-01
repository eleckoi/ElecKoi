package com.eleckoi.android.feature.characters.modes.story.variables.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DataObject
import androidx.compose.material.icons.rounded.Schema
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import androidx.compose.ui.zIndex
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.themedListRowClickable
import com.eleckoi.android.foundation.design.ElecKoiDanger

private enum class VariableCreateIcon {
    Object,
    Variable,
}

private val BottomToolbarOuterPadding = 14.dp
private val BottomToolbarInnerPadding = 8.dp
private val BottomToolbarHeight = 70.dp
private val BottomActionMenuOffset = 66.dp
private val CreateMenuWidth = 112.dp
private val MoreMenuWidth = 96.dp

@Composable
internal fun VariableTreeBottomPanel(
    hasSelection: Boolean,
    canEdit: Boolean,
    canCopy: Boolean,
    canDelete: Boolean,
    hasClipboard: Boolean,
    createMenuOpen: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onCreate: () -> Unit,
    onDismissCreateMenu: () -> Unit,
    onCreateObject: () -> Unit,
    onCreateVariable: () -> Unit,
    onEdit: () -> Unit,
    onCopyOrPaste: () -> Unit,
    onCutOrCancel: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    var moreMenuOpen by remember { mutableStateOf(false) }
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = BottomToolbarOuterPadding, vertical = 8.dp),
    ) {
        val createMenuX = 0.dp
        val moreMenuX = maxWidth - MoreMenuWidth
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(BottomToolbarHeight)
                .clip(RoundedCornerShape(18.dp))
                .background(appearance.mobileSurface)
                .border(1.dp, appearance.mobileMuted.copy(alpha = 0.12f), RoundedCornerShape(18.dp))
                .padding(horizontal = BottomToolbarInnerPadding, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            VariableToolbarAction("新建", AppIconPaths.Plus, appearance, Modifier.weight(1f), enabled = true, onCreate)
            VariableToolbarAction(
                if (hasClipboard) "粘贴" else "编辑",
                if (hasClipboard) AppIconPaths.Paste else AppIconPaths.EditSquare,
                appearance,
                Modifier.weight(1f),
                enabled = hasClipboard || canEdit,
                onClick = { if (hasClipboard) onCopyOrPaste() else onEdit() },
            )
            VariableToolbarAction(if (hasClipboard) "取消" else "移动", if (hasClipboard) AppIconPaths.X else AppIconPaths.Move, appearance, Modifier.weight(1f), enabled = hasClipboard || canDelete, onCutOrCancel)
            VariableToolbarAction("删除", AppIconPaths.Trash, appearance, Modifier.weight(1f), enabled = canDelete, onDelete)
            VariableToolbarAction("更多", AppIconPaths.Menu, appearance, Modifier.weight(1f), enabled = hasSelection && !hasClipboard, onClick = { moreMenuOpen = true })
        }
        if (createMenuOpen) {
            VariableCreateMenuPopup(
                appearance = appearance,
                xOffset = createMenuX,
                onCreateObject = onCreateObject,
                onCreateVariable = onCreateVariable,
                onDismiss = onDismissCreateMenu,
            )
        }
        if (moreMenuOpen) {
            VariableMoreMenuPopup(
                appearance = appearance,
                xOffset = moreMenuX,
                canCopy = canCopy,
                onCopy = onCopyOrPaste,
                onRename = onRename,
                onDismiss = { moreMenuOpen = false },
            )
        }
    }
}

@Composable
private fun VariableToolbarAction(
    text: String,
    icon: List<String>,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .height(58.dp)
            .clip(RoundedCornerShape(13.dp))
            .themedListRowClickable(appearance = appearance, enabled = enabled, onClick = onClick)
            .padding(top = 7.dp, bottom = 5.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        val color = if (enabled) appearance.mobileText else appearance.mobileMuted.copy(alpha = 0.48f)
        val iconColor = if (icon == AppIconPaths.Trash) ElecKoiDanger.copy(alpha = if (enabled) 1f else 0.42f) else color
        StrokeSvgIcon(icon, iconColor, iconSize = 23.dp, strokeWidth = 1.9f)
        Text(text, color = color, fontSize = 10.5.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 3.dp), maxLines = 1)
    }
}

@Composable
private fun VariableCreateMenuPopup(
    appearance: AppearanceTheme,
    xOffset: Dp,
    onCreateObject: () -> Unit,
    onCreateVariable: () -> Unit,
    onDismiss: () -> Unit,
) {
    val density = LocalDensity.current
    Popup(
        alignment = Alignment.BottomStart,
        offset = with(density) { IntOffset(xOffset.roundToPx(), -BottomActionMenuOffset.roundToPx()) },
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        Column(
            modifier = Modifier
                .width(CreateMenuWidth)
                .zIndex(4f)
                .clip(RoundedCornerShape(12.dp))
                .background(appearance.mobileSurface)
                .border(1.dp, appearance.mobileMuted.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
                .padding(vertical = 3.dp),
        ) {
            VariableCreateButton("变量组", VariableCreateIcon.Object, appearance) {
                onDismiss()
                onCreateObject()
            }
            VariableCreateButton("变量", VariableCreateIcon.Variable, appearance) {
                onDismiss()
                onCreateVariable()
            }
        }
    }
}

@Composable
private fun VariableMoreMenuPopup(
    appearance: AppearanceTheme,
    xOffset: Dp,
    canCopy: Boolean,
    onCopy: () -> Unit,
    onRename: () -> Unit,
    onDismiss: () -> Unit,
) {
    val density = LocalDensity.current
    Popup(
        alignment = Alignment.BottomStart,
        offset = with(density) { IntOffset(xOffset.roundToPx(), -BottomActionMenuOffset.roundToPx()) },
        onDismissRequest = onDismiss,
        properties = PopupProperties(focusable = true),
    ) {
        Column(
            modifier = Modifier
                .width(MoreMenuWidth)
                .zIndex(4f)
                .clip(RoundedCornerShape(12.dp))
                .background(appearance.mobileSurface)
                .border(1.dp, appearance.mobileMuted.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
                .padding(vertical = 3.dp),
        ) {
            if (canCopy) {
                VariableActionMenuButton("复制", appearance) {
                    onDismiss()
                    onCopy()
                }
            }
            VariableActionMenuButton("重命名", appearance) {
                onDismiss()
                onRename()
            }
        }
    }
}

@Composable
private fun VariableCreateButton(
    text: String,
    iconKind: VariableCreateIcon,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(32.dp)
            .clip(RoundedCornerShape(8.dp))
            .themedListRowClickable(appearance = appearance, onClick = onClick)
            .padding(start = 8.dp, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val icon = when (iconKind) {
            VariableCreateIcon.Object -> Icons.Rounded.Schema
            VariableCreateIcon.Variable -> Icons.Rounded.DataObject
        }
        Box(modifier = Modifier.size(20.dp), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = appearance.mobileText, modifier = Modifier.size(17.dp))
        }
        Text(text, color = appearance.mobileText, fontSize = 11.5.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(start = 6.dp), maxLines = 1)
    }
}

@Composable
private fun VariableActionMenuButton(
    text: String,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(32.dp)
            .clip(RoundedCornerShape(8.dp))
            .themedListRowClickable(appearance = appearance, onClick = onClick)
            .padding(horizontal = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, color = appearance.mobileText, fontSize = 11.5.sp, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}
