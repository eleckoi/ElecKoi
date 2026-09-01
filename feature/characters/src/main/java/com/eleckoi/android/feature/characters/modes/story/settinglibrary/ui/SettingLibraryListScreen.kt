package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import com.eleckoi.android.feature.characters.modes.story.ui.shared.*

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isFixedEntry
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.components.themedListRowClickable

@Composable
internal fun EntryGroupHeader(
    title: String,
    count: Int,
    expanded: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    trailingText: String? = null,
    onToggle: () -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(44.dp)
            .background(appearance.mobileBg)
            .themedListRowClickable(appearance = appearance, onClick = onToggle)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StrokeSvgIcon(
            if (expanded) AppIconPaths.ChevronDown else AppIconPaths.ChevronRight,
            appearance.mobileMuted,
            iconSize = 17.dp,
            strokeWidth = 1.8f,
        )
        Text(
            "$title（$count）",
            modifier = Modifier.weight(1f).padding(start = 8.dp),
            color = appearance.mobileMuted,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (trailingText != null) {
            Text(trailingText, color = appearance.mobileMuted, fontSize = 11.sp, maxLines = 1)
        }
    }
}

@Composable
internal fun EmptySettingLibrary(appearance: AppearanceTheme) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(420.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("还没有设定条目", color = appearance.mobileText, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Text("先在底部新建文件夹或设定", color = appearance.mobileMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
internal fun EmptySearchResult(appearance: AppearanceTheme) {
    Box(modifier = Modifier.fillMaxWidth().height(260.dp), contentAlignment = Alignment.Center) {
        Text("没有找到匹配的设定", color = appearance.mobileMuted, fontSize = 14.sp)
    }
}

@Composable
internal fun LoadMoreSettingEntriesRow(
    visibleCount: Int,
    totalCount: Int,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .background(appearance.mobileBg)
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(44.dp), contentAlignment = Alignment.Center) {
            StrokeSvgIcon(AppIconPaths.ChevronDown, appearance.mobileMuted, iconSize = 18.dp, strokeWidth = 1.8f)
        }
        Text(
            "继续显示更多（$visibleCount / $totalCount）",
            modifier = Modifier.padding(start = 8.dp),
            color = appearance.mobileMuted,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 78.dp)
            .height(1.dp)
            .background(appearance.mobileMuted.copy(alpha = 0.08f)),
    )
}

@Composable
internal fun EntryCard(
    entry: SettingLibraryEntry,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit,
    onEntryChange: ((SettingLibraryEntry) -> SettingLibraryEntry) -> Unit,
) {
    var requiredPrompt by remember(entry.id) { mutableStateOf(false) }
    val canEnable = entry.hasRequiredActivationFields()
    val effectiveEnabled = entry.enabled && canEnable
    val fixedEntry = entry.isFixedEntry()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(80.dp)
            .background(appearance.mobileBg)
            .themedListRowClickable(appearance = appearance, onClick = onOpen)
            .padding(horizontal = 18.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EntryIconPreview(entry.iconId, appearance, framed = false, iconSize = 29)
        val title = entry.title.trim()
        Text(
            title.ifBlank { "条目标题/待命名" },
            modifier = Modifier.weight(1f).padding(start = 8.dp, end = 8.dp),
            color = if (title.isBlank()) appearance.mobileMuted else appearance.mobileText,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        StoryToolSwitch(
            checked = if (fixedEntry) entry.enabled else effectiveEnabled,
            appearance = appearance,
            onCheckedChange = { checked ->
                if (!fixedEntry && checked && !canEnable) {
                    requiredPrompt = true
                } else {
                    onEntryChange { it.copy(enabled = checked) }
                }
            },
            modifier = Modifier.padding(start = 8.dp),
        )
        Box(
            modifier = Modifier.size(30.dp).padding(start = 6.dp),
            contentAlignment = Alignment.Center,
        ) {
            StrokeSvgIcon(AppIconPaths.ChevronRight, appearance.mobileMuted, iconSize = 17.dp, strokeWidth = 1.8f)
        }
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 78.dp)
            .height(1.dp)
            .background(appearance.mobileMuted.copy(alpha = 0.08f)),
    )

    if (requiredPrompt) {
        SettingLibraryRequiredFieldsDialog(
            triggerSelected = entry.triggerMode != null,
            positionSelected = entry.position != null,
            appearance = appearance,
            onDismiss = { requiredPrompt = false },
        )
    }
}
