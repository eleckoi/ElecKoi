package com.eleckoi.android.feature.characters.modes.story.presets.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.eleckoi.android.feature.characters.modes.story.presets.model.ExportedStoryPresetCard
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable

@Composable
fun StoryPresetImportSourceDialog(
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onImportElecKoi: () -> Unit,
    onImportSillyTavern: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("选择导入来源", color = appearance.mobileText) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                StoryPresetImportSourceRow(
                    title = "本项目预设",
                    description = "导入 ElecKoi 导出的 PNG 预设卡",
                    appearance = appearance,
                    onClick = onImportElecKoi,
                )
                StoryPresetImportSourceRow(
                    title = "酒馆预设",
                    description = "导入 SillyTavern 预设并转换",
                    appearance = appearance,
                    onClick = onImportSillyTavern,
                )
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("取消", color = appearance.mobileMuted)
            }
        },
        containerColor = appearance.mobileSurface,
    )
}

@Composable
fun StoryPresetExportDialog(
    card: ExportedStoryPresetCard,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onShareOriginal: () -> Unit,
    onSave: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("导出预设卡", color = appearance.mobileText) },
        text = {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    AsyncImage(
                        model = card.imageBytes,
                        contentDescription = "${card.name} 预设卡预览",
                        modifier = Modifier
                            .size(width = 78.dp, height = 104.dp)
                            .clip(RoundedCornerShape(14.dp))
                            .background(appearance.mobileBg),
                        contentScale = ContentScale.Crop,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            card.name,
                            color = appearance.mobileText,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Spacer(Modifier.height(4.dp))
                        Text("PNG 预设分享卡", color = appearance.mobileMuted, fontSize = 13.sp)
                    }
                }
                Spacer(Modifier.height(14.dp))
                StoryPresetTransferActionRow(
                    label = "分享原文件",
                    icon = AppIconPaths.Export,
                    appearance = appearance,
                    onClick = onShareOriginal,
                )
                StoryPresetTransferActionRow(
                    label = "保存图片",
                    icon = AppIconPaths.Import,
                    appearance = appearance,
                    onClick = onSave,
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("完成") } },
        containerColor = appearance.mobileSurface,
    )
}

@Composable
fun StoryPresetBatchExportDialog(
    cards: List<ExportedStoryPresetCard>,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onShareOriginal: () -> Unit,
    onSave: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("导出预设卡", color = appearance.mobileText) },
        text = {
            Column {
                Text("${cards.size} 张预设卡", color = appearance.mobileMuted, fontSize = 13.sp)
                Spacer(Modifier.height(12.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(cards, key = ExportedStoryPresetCard::presetId) { card ->
                        Column(modifier = Modifier.width(82.dp)) {
                            AsyncImage(
                                model = card.imageBytes,
                                contentDescription = "${card.name} 预设卡预览",
                                modifier = Modifier
                                    .size(width = 82.dp, height = 110.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(appearance.mobileBg),
                                contentScale = ContentScale.Crop,
                            )
                            Spacer(Modifier.height(5.dp))
                            Text(
                                card.name,
                                color = appearance.mobileText,
                                fontSize = 13.sp,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                StoryPresetTransferActionRow(
                    label = "保存到本地",
                    icon = AppIconPaths.Import,
                    appearance = appearance,
                    onClick = onSave,
                )
                StoryPresetTransferActionRow(
                    label = "分享原文件",
                    icon = AppIconPaths.Export,
                    appearance = appearance,
                    onClick = onShareOriginal,
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("完成") } },
        containerColor = appearance.mobileSurface,
    )
}

@Composable
private fun StoryPresetTransferActionRow(
    label: String,
    icon: List<String>,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        StrokeSvgIcon(
            paths = icon,
            color = appearance.mobileText,
            iconSize = 22.dp,
            strokeWidth = 1.8f,
        )
        Text(label, color = appearance.mobileText, fontSize = 16.sp)
    }
}

@Composable
private fun StoryPresetImportSourceRow(
    title: String,
    description: String,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .clip(RoundedCornerShape(12.dp))
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        StrokeSvgIcon(
            paths = AppIconPaths.Import,
            color = appearance.mobileText,
            iconSize = 23.dp,
            strokeWidth = 1.8f,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                color = appearance.mobileText,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = description,
                color = appearance.mobileMuted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
