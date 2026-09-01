package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.AvatarCircle
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.themedListRowClickable
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrarySource

@Composable
internal fun SourceList(
    selfSource: SettingLibrarySource,
    sources: List<SettingLibrarySource>,
    loading: Boolean,
    appearance: AppearanceTheme,
    onPickFile: () -> Unit,
    onPick: (SettingLibrarySource) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp)) {
        // The reassurance comes first. Taking entries out of someone else's card is the moment a
        // user wonders whether they are about to damage it, and an answer placed after the list is
        // an answer given after the decision.
        Text(
            "只读取来源的设定库，不会改动它。",
            modifier = Modifier.padding(top = 4.dp, start = 14.dp, bottom = 14.dp),
            color = appearance.mobileMuted,
            fontSize = 13.sp,
        )
        // Cards group by kind, not by importance: every character in one, the file on its own.
        // Putting the file row up with this character because it felt primary made the list run
        // character, file, character — a sequence with no rule behind it.
        ManagerCard(appearance) {
            SourceRow(selfSource, appearance, self = true, onPick = onPick)
            sources.forEach { item ->
                ManagerRowDivider(appearance)
                SourceRow(item, appearance, self = false, onPick = onPick)
            }
            if (loading && sources.isEmpty()) {
                ManagerRowDivider(appearance)
                Box(
                    modifier = Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 16.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    Text("正在读取其他角色卡", color = appearance.mobileMuted, fontSize = 14.sp)
                }
            }
        }
        Box(modifier = Modifier.padding(top = 16.dp)) {
            ManagerCard(appearance) {
                ManagerRow(
                    icon = SettingLibraryIcons.File,
                    title = "从本地文件",
                    appearance = appearance,
                    onClick = onPickFile,
                )
            }
        }
        Box(modifier = Modifier.height(28.dp))
    }
}

@Composable
private fun SourceRow(
    item: SettingLibrarySource,
    appearance: AppearanceTheme,
    self: Boolean,
    onPick: (SettingLibrarySource) -> Unit,
) {
    val empty = item.versions.isEmpty() || item.entryCount == 0
    val name = item.characterName.trim().ifBlank { "未命名角色" }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .then(
                if (empty) {
                    Modifier.alpha(0.4f)
                } else {
                    Modifier.themedListRowClickable(appearance = appearance) { onPick(item) }
                },
            )
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarCircle(
            name = name,
            size = 38,
            fontSize = 15,
            appearance = appearance,
            avatarPath = item.avatar,
        )
        Text(
            if (self) "$name · 其他版本" else name,
            modifier = Modifier.weight(1f).padding(start = 13.dp, end = 10.dp),
            color = appearance.mobileText,
            fontSize = 16.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (!empty) {
            StrokeSvgIcon(
                AppIconPaths.ChevronRight,
                appearance.mobileSoft,
                modifier = Modifier.padding(start = 10.dp),
                iconSize = 18.dp,
                strokeWidth = 1.7f,
            )
        }
    }
}
