package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryPromptPosition
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.DshTrashGlyph
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
internal fun PlacementPageTopBar(appearance: AppearanceTheme, onBack: () -> Unit) {
    Box(
        Modifier.fillMaxWidth().height(60.dp).background(appearance.mobileBg).padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.align(Alignment.CenterStart).size(44.dp).clip(CircleShape)
                .background(appearance.mobileSurface).semantics { contentDescription = "返回" }
                .noRippleClickable(onClick = onBack),
            contentAlignment = Alignment.Center,
        ) {
            StrokeSvgIcon(AppIconPaths.Back, appearance.mobileText, iconSize = 23.dp, strokeWidth = 1.9f)
        }
        Text("插入位置", color = appearance.mobileText, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
internal fun PlacementPromptToolbar(
    positions: List<SettingLibraryPromptPosition>,
    selectedId: String,
    sortMode: Boolean,
    appearance: AppearanceTheme,
    canDelete: Boolean,
    onSelect: (String) -> Unit,
    onCreate: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
    onToggleSort: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selected = positions.firstOrNull { it.id == selectedId }
    Column(Modifier.fillMaxWidth().padding(start = 20.dp, top = 8.dp, end = 14.dp, bottom = 10.dp)) {
        Text("位置列表", color = appearance.mobileText, fontSize = 12.sp, fontWeight = FontWeight.Medium)
        Row(
            Modifier.fillMaxWidth().padding(top = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Box(Modifier.weight(1f)) {
                Row(
                    Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(10.dp))
                        .background(appearance.mobileSurface)
                        .border(1.dp, appearance.mobileLine, RoundedCornerShape(10.dp))
                        .noRippleClickable(enabled = positions.isNotEmpty()) { expanded = true }
                        .padding(horizontal = 11.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        selected?.name?.ifBlank { "未命名位置" } ?: "暂无自定义位置",
                        color = if (selected == null) appearance.mobileMuted else appearance.mobileText,
                        fontSize = 12.5.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    StrokeSvgIcon(AppIconPaths.ChevronDown, appearance.mobileMuted, iconSize = 13.dp, strokeWidth = 1.8f)
                }
                DropdownMenu(expanded, { expanded = false }, containerColor = appearance.mobileSurface) {
                    positions.forEach { position ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    position.name.ifBlank { "未命名位置" },
                                    color = if (position.id == selectedId) appearance.mobileBlue else appearance.mobileText,
                                    fontSize = 13.sp,
                                )
                            },
                            onClick = {
                                onSelect(position.id)
                                expanded = false
                            },
                        )
                    }
                }
            }
            ToolbarIconAction("新建", AppIconPaths.Plus, appearance, onClick = onCreate)
            ToolbarIconAction("重命名", AppIconPaths.EditSquare, appearance, enabled = selected != null, onClick = onRename)
            ToolbarTrashAction(appearance, enabled = selected != null && canDelete, onClick = onDelete)
            ToolbarIconAction(
                if (sortMode) "完成" else "排序",
                AppIconPaths.Sort,
                appearance,
                selected = sortMode,
                enabled = positions.isNotEmpty(),
                onClick = onToggleSort,
            )
        }
    }
}


@Composable
private fun ToolbarIconAction(
    label: String,
    icon: List<String>,
    appearance: AppearanceTheme,
    selected: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Column(
        Modifier.width(44.dp).height(48.dp).clip(RoundedCornerShape(9.dp))
            .background(if (selected) appearance.mobilePinnedBg else appearance.mobileBg)
            .noRippleClickable(enabled = enabled, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        StrokeSvgIcon(
            icon,
            if (!enabled) appearance.mobileSoft else if (selected) appearance.mobileBlue else appearance.mobileText,
            iconSize = 17.dp,
            strokeWidth = 1.75f,
        )
        Text(
            label,
            color = if (!enabled) appearance.mobileSoft else if (selected) appearance.mobileBlue else appearance.mobileText,
            fontSize = 9.5.sp,
            maxLines = 1,
        )
    }
}

@Composable
private fun ToolbarTrashAction(appearance: AppearanceTheme, enabled: Boolean, onClick: () -> Unit) {
    Column(
        Modifier.width(44.dp).height(48.dp).clip(RoundedCornerShape(9.dp))
            .noRippleClickable(enabled = enabled, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        DshTrashGlyph(if (enabled) ElecKoiDanger else appearance.mobileSoft, iconSize = 17.dp)
        Text("删除", color = if (enabled) ElecKoiDanger else appearance.mobileSoft, fontSize = 9.5.sp)
    }
}

