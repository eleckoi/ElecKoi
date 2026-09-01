package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import com.eleckoi.android.feature.characters.modes.story.ui.shared.*

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.SvgCircle
import com.eleckoi.android.foundation.design.components.noRippleClickable

internal data class SettingLibraryEntryIconTemplate(
    val id: String,
    val paths: List<String>,
    val circles: List<SvgCircle> = emptyList(),
)

// Paths are based on Lucide icons (ISC License): https://lucide.dev/license
internal val SettingLibraryEntryIconTemplates = listOf(
    SettingLibraryEntryIconTemplate(
        id = "character",
        paths = listOf("M20 21a8 8 0 0 0-16 0"),
        circles = listOf(SvgCircle(12f, 8f, 5f)),
    ),
    SettingLibraryEntryIconTemplate(
        id = "world",
        paths = listOf(
            "M10 2v8l3-3 3 3V2",
            "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20",
        ),
    ),
    SettingLibraryEntryIconTemplate(
        id = "place",
        paths = listOf(
            "M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z",
            "M15 5.764v15",
            "M9 3.236v15",
        ),
    ),
    SettingLibraryEntryIconTemplate(
        id = "rule",
        paths = listOf(
            "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
            "m9 12 2 2 4-4",
        ),
    ),
    SettingLibraryEntryIconTemplate(
        id = "secret",
        paths = listOf("M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"),
        circles = listOf(SvgCircle(16.5f, 7.5f, 0.6f, fill = true)),
    ),
    SettingLibraryEntryIconTemplate(
        id = "faction",
        paths = listOf(
            "M10 18v-7",
            "M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z",
            "M14 18v-7",
            "M18 18v-7",
            "M3 22h18",
            "M6 18v-7",
        ),
    ),
    SettingLibraryEntryIconTemplate(
        id = "item",
        paths = listOf(
            "M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z",
            "m7 16.5-4.74-2.85",
            "m7 16.5 5-3",
            "M7 16.5v5.17",
            "M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z",
            "m17 16.5-5-3",
            "m17 16.5 4.74-2.85",
            "M17 16.5v5.17",
            "M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z",
            "M12 8 7.26 5.15",
            "m12 8 4.74-2.85",
            "M12 13.5V8",
        ),
    ),
    SettingLibraryEntryIconTemplate(
        id = "timeline",
        paths = listOf("M12 6v6h4"),
        circles = listOf(SvgCircle(12f, 12f, 10f)),
    ),
    SettingLibraryEntryIconTemplate(
        id = "relation",
        paths = listOf("M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762"),
    ),
    SettingLibraryEntryIconTemplate(
        id = "power",
        paths = listOf(
            "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
            "M20 2v4",
            "M22 4h-4",
        ),
        circles = listOf(SvgCircle(4f, 20f, 2f)),
    ),
    SettingLibraryEntryIconTemplate(
        id = "danger",
        paths = listOf(
            "m12.5 17-.5-1-.5 1h1z",
            "M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z",
        ),
        circles = listOf(SvgCircle(15f, 12f, 1f, fill = true), SvgCircle(9f, 12f, 1f, fill = true)),
    ),
    SettingLibraryEntryIconTemplate(
        id = "note",
        paths = listOf(
            "M15 12h-5",
            "M15 8h-5",
            "M19 17V5a2 2 0 0 0-2-2H4",
            "M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3",
        ),
    ),
)

internal fun entryIconTemplate(iconId: String): SettingLibraryEntryIconTemplate? {
    return SettingLibraryEntryIconTemplates.firstOrNull { it.id == iconId }
}

@Composable
internal fun EntryIconPreview(iconId: String, appearance: AppearanceTheme, modifier: Modifier = Modifier) {
    EntryIconPreview(iconId = iconId, appearance = appearance, modifier = modifier, framed = true, iconSize = 19)
}

@Composable
internal fun EntryIconPreview(
    iconId: String,
    appearance: AppearanceTheme,
    modifier: Modifier = Modifier,
    framed: Boolean,
    iconSize: Int,
) {
    val template = entryIconTemplate(iconId)
    val boxModifier = if (framed) {
        modifier
            .size(38.dp)
            .clip(StoryEditorShapes.Small)
            .background(appearance.mobileBg)
            .border(1.dp, appearance.mobileMuted.copy(alpha = 0.14f), StoryEditorShapes.Small)
    } else {
        modifier.size(44.dp)
    }
    Box(
        modifier = boxModifier,
        contentAlignment = Alignment.Center,
    ) {
        if (template == null) {
            SettingLibraryPromptGlyph(
                tint = appearance.mobileMuted,
                iconSize = iconSize.dp,
            )
        } else {
            StrokeSvgIcon(template.paths, appearance.mobileMuted, iconSize = iconSize.dp, strokeWidth = 1.65f, circles = template.circles)
        }
    }
}

@Composable
internal fun EntryIconPicker(
    selectedIconId: String,
    appearance: AppearanceTheme,
    onSelect: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(top = StoryEditorCardSpacing)) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(appearance.mobileSurface)
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "条目图标",
                    color = appearance.mobileText,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "（可选）",
                    color = appearance.mobileMuted,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(start = 2.dp),
                )
            }
            val cells: List<SettingLibraryEntryIconTemplate?> = listOf(null) + SettingLibraryEntryIconTemplates
            cells.chunked(5).forEach { row ->
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { template ->
                        val iconId = template?.id.orEmpty()
                        EntryIconOption(
                            template = template,
                            selected = selectedIconId == iconId,
                            appearance = appearance,
                            modifier = Modifier.weight(1f),
                            onClick = { onSelect(iconId) },
                        )
                    }
                    repeat(5 - row.size) {
                        Box(modifier = Modifier.weight(1f))
                    }
                }
            }
        }
    }
}

@Composable
private fun EntryIconOption(
    template: SettingLibraryEntryIconTemplate?,
    selected: Boolean,
    appearance: AppearanceTheme,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    val iconColor = if (selected) appearance.mobileText else appearance.mobileMuted
    Box(
        modifier = modifier
            .height(44.dp)
            .clip(StoryEditorShapes.Small)
            .background(if (selected) appearance.mobilePinnedBg else appearance.mobileSurface)
            .border(
                1.dp,
                if (selected) appearance.mobileText.copy(alpha = 0.22f) else appearance.mobileMuted.copy(alpha = 0.10f),
                StoryEditorShapes.Small,
            )
            .noRippleClickable(onClick = onClick)
            .padding(vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (template == null) {
            SettingLibraryPromptGlyph(
                tint = iconColor,
                iconSize = 18.dp,
            )
        } else {
            StrokeSvgIcon(template.paths, iconColor, iconSize = 18.dp, strokeWidth = 1.65f, circles = template.circles)
        }
    }
}
