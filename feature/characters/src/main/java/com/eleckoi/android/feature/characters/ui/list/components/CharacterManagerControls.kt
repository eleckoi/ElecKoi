package com.eleckoi.android.feature.characters.ui.list.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.model.CharactersPayload
import com.eleckoi.android.foundation.design.components.BubbleActionMenu
import com.eleckoi.android.foundation.design.components.MobileHeaderMenuAction
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AppSearchField
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.SvgCircle
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.feature.characters.ui.list.*

import com.eleckoi.android.feature.characters.ui.list.CharacterBatchAction

@Composable
internal fun CharacterManagerHeader(
    appearance: AppearanceTheme,
    onDelete: () -> Unit,
    onOpenGroups: () -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    onClose: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .padding(start = 14.dp, end = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Not "角色卡管理器" — you arrived here by pressing a button with that name on it.
        Text(
            "角色卡",
            modifier = Modifier.weight(1f),
            color = appearance.mobileText,
            fontSize = 19.sp,
            fontWeight = FontWeight.Medium,
        )
        Box(modifier = Modifier.padding(end = 6.dp)) {
            ManagerIconAction(
                icon = emptyList(),
                circles = ManagerMoreDotCircles,
                appearance = appearance,
            ) { menuOpen = true }
            BubbleActionMenu(
                expanded = menuOpen,
                actions = listOf(
                    MobileHeaderMenuAction("分组管理", AppIconPaths.Gear, onClick = onOpenGroups),
                    MobileHeaderMenuAction("导入角色卡", AppIconPaths.Import, onClick = onImport),
                    MobileHeaderMenuAction("导出角色卡", AppIconPaths.Export, onClick = onExport),
                    // "选择" named the mode rather than the errand. Nobody opens this looking to
                    // select; they open it looking to delete, and selection is how deleting works.
                    MobileHeaderMenuAction(
                        "删除角色卡",
                        AppIconPaths.Trash,
                        ElecKoiDanger,
                        dividerBefore = true,
                        onClick = onDelete,
                    ),
                ),
                appearance = appearance,
                onDismiss = { menuOpen = false },
            )
        }
        ManagerIconAction(AppIconPaths.X, appearance = appearance, iconSize = 19.dp, onClick = onClose)
    }
}

// AppIconPaths.MoreDots draws zero-length strokes, so each dot ends up as wide as the stroke —
// about 1.5dp, which is neither visible nor findable. Filled circles instead.
private val ManagerMoreDotCircles = listOf(
    SvgCircle(12f, 5.4f, 1.75f, fill = true),
    SvgCircle(12f, 12f, 1.75f, fill = true),
    SvgCircle(12f, 18.6f, 1.75f, fill = true),
)

@Composable
internal fun CharacterManagerSelectionBar(
    selectedCount: Int,
    allSelected: Boolean,
    action: CharacterBatchAction,
    appearance: AppearanceTheme,
    onToggleSelectAll: () -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(42.dp)
            .padding(start = 12.dp, end = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            if (selectedCount == 0) "选择角色" else "已选 $selectedCount",
            modifier = Modifier.weight(1f),
            color = appearance.mobileText,
            fontSize = 19.sp,
            fontWeight = FontWeight.Medium,
        )
        ManagerTextAction(if (allSelected) "取消全选" else "全选", appearance, onClick = onToggleSelectAll)
        if (selectedCount > 0) {
            val label = if (action == CharacterBatchAction.Export) "导出" else "删除"
            val color = if (action == CharacterBatchAction.Export) appearance.mobileBlue else ElecKoiDanger
            ManagerTextAction(label, appearance, color = color, onClick = onConfirm)
        }
        ManagerTextAction("取消", appearance, color = appearance.mobileMuted, onClick = onCancel)
    }
}

@Composable
private fun ManagerTextAction(
    text: String,
    appearance: AppearanceTheme,
    color: Color = appearance.mobileText,
    onClick: () -> Unit,
) {
    Text(
        text,
        color = color,
        fontSize = 13.sp,
        modifier = Modifier
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
    )
}

// A bare glyph on a page this empty has no target and no presence — you have to hunt for it. The
// tinted container gives it both, and stays quiet enough not to compete with the title.
@Composable
private fun ManagerIconAction(
    icon: List<String>,
    appearance: AppearanceTheme,
    circles: List<SvgCircle> = emptyList(),
    iconSize: Dp = 18.dp,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(appearance.mobileText.copy(alpha = 0.055f))
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        StrokeSvgIcon(
            paths = icon,
            color = appearance.mobileText,
            iconSize = iconSize,
            strokeWidth = 1.9f,
            circles = circles,
        )
    }
}

@Composable
internal fun CharacterManagerGroupChips(
    groups: List<String>,
    characters: CharactersPayload,
    selectedGroup: String,
    appearance: AppearanceTheme,
    onSelectGroup: (String) -> Unit,
) {
    LazyRow(
        modifier = Modifier.fillMaxWidth().padding(top = 2.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        contentPadding = PaddingValues(horizontal = 8.dp),
    ) {
        item("chip-$ALL_CHARACTERS") {
            CharacterManagerGroupChip(
                text = "全部",
                count = characters.items.size,
                active = selectedGroup == ALL_CHARACTERS,
                appearance = appearance,
                onClick = { onSelectGroup(ALL_CHARACTERS) },
            )
        }
        items(groups, key = { "chip-$it" }) { group ->
            CharacterManagerGroupChip(
                text = group,
                count = characters.items.count { characterGroup(it) == group },
                active = selectedGroup == group,
                appearance = appearance,
                onClick = { onSelectGroup(group) },
            )
        }
    }
}

// The filter button that used to sit beside this had an empty onClick — it looked like a control
// and did nothing, so the search takes the full width it was borrowing.
@Composable
internal fun ManagerSearchBar(
    keyword: String,
    appearance: AppearanceTheme,
    onKeywordChange: (String) -> Unit,
) {
    AppSearchField(
        keyword = keyword,
        placeholder = "搜索角色",
        appearance = appearance,
        modifier = Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, bottom = 10.dp),
        // The sheet's own colour, not mobileSurface: the well is derived from whatever it sits on.
        surface = appearance.mobileBg,
        height = 36.dp,
        cornerRadius = 11.dp,
        fontSize = 13.5.sp,
        iconSize = 15.dp,
        onKeywordChange = onKeywordChange,
    )
}


// No shell. Two bordered 34dp pills spent a whole band of the screen on what is a filter, and the
// count on an inactive group mostly announced that it is empty — it shows on the active one, where
// it describes what you are looking at.
@Composable
private fun CharacterManagerGroupChip(
    text: String,
    count: Int,
    active: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .height(28.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (active) appearance.mobileText.copy(alpha = 0.07f) else Color.Transparent)
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text,
            color = if (active) appearance.mobileText else appearance.mobileMuted,
            fontSize = 12.5.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (active) {
            Text(
                count.toString(),
                color = appearance.mobileSoft,
                fontSize = 12.5.sp,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
    }
}
