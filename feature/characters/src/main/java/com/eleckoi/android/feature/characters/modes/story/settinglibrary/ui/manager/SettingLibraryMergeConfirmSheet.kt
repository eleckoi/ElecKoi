package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.DshFolderGlyph
import com.eleckoi.android.foundation.design.components.DshProjectAddGlyph
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.foundation.design.components.themedListRowClickable
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryMergePlan
import com.eleckoi.android.foundation.design.AppearanceTheme
import kotlinx.coroutines.delay

/**
 * What the merge is about to do, shown once, at the point it stops being undoable.
 *
 * The picker deliberately says none of this. Marking every row with "will merge" / "will be
 * renamed" while you are still deciding what to take turns choosing into auditing; the landing
 * report belongs at the end, where three numbers answer it completely.
 */
@Composable
internal fun SettingLibraryMergeConfirmSheet(
    sourceName: String,
    versionName: String,
    plan: SettingLibraryMergePlan,
    appearance: AppearanceTheme,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }
    LaunchedEffect(visible) {
        if (!visible) {
            delay(200)
            onDismiss()
        }
    }

    Dialog(
        onDismissRequest = { visible = false },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.BottomCenter,
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(animationSpec = tween(160)),
                exit = fadeOut(animationSpec = tween(160)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.Black.copy(alpha = 0.42f))
                        .noRippleClickable { visible = false },
                )
            }
            AnimatedVisibility(
                visible = visible,
                enter = slideInVertically(
                    initialOffsetY = { it },
                    animationSpec = spring(dampingRatio = 0.82f, stiffness = 340f),
                ) + fadeIn(animationSpec = tween(140)),
                exit = slideOutVertically(
                    targetOffsetY = { it },
                    animationSpec = tween(180),
                ) + fadeOut(animationSpec = tween(140)),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .navigationBarsPadding()
                        .padding(horizontal = 12.dp, vertical = 12.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(appearance.mobileSurface)
                        .noRippleClickable {}
                        .padding(horizontal = 22.dp, vertical = 22.dp),
                ) {
                    Text(
                        "并入 ${plan.entryCount} 条",
                        color = appearance.mobileText,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        listOf(sourceName.trim(), versionName.trim())
                            .filter { it.isNotBlank() }
                            .joinToString(" · ")
                            .ifBlank { "来自其他角色卡" },
                        modifier = Modifier.padding(top = 6.dp),
                        color = appearance.mobileMuted,
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 18.dp, bottom = 4.dp)
                            .height(1.dp)
                            .background(appearance.mobileLine),
                    )

                    if (plan.mergedFolderCount > 0) {
                        FolderPlanRow("合并进已有文件夹", plan.mergedFolderCount, appearance)
                    }
                    if (plan.newFolderCount > 0) {
                        FolderPlanRow("新建文件夹", plan.newFolderCount, appearance, create = true)
                    }
                    if (plan.renamedEntryCount > 0) {
                        PlanRow(SettingLibraryIcons.Warning, "重名，将加后缀", plan.renamedEntryCount, appearance)
                    }
                    if (plan.reorderedEntryCount > 0) {
                        PlanRow(SettingLibraryIcons.Warning, "排序号占用，将顺延", plan.reorderedEntryCount, appearance)
                    }
                    if (plan.mergedFolderCount == 0 &&
                        plan.newFolderCount == 0 &&
                        plan.renamedEntryCount == 0 &&
                        plan.reorderedEntryCount == 0
                    ) {
                        Text(
                            "直接写入，没有冲突。",
                            modifier = Modifier.padding(top = 12.dp),
                            color = appearance.mobileMuted,
                            fontSize = 14.sp,
                        )
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 18.dp)
                            .height(48.dp)
                            .clip(RoundedCornerShape(13.dp))
                            .background(appearance.mobileBlue)
                            .noRippleClickable {
                                visible = false
                                onConfirm()
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("并入", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 6.dp)
                            .height(44.dp)
                            .clip(RoundedCornerShape(13.dp))
                            .themedListRowClickable(appearance = appearance) { visible = false },
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("取消", color = appearance.mobileMuted, fontSize = 15.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun PlanRow(
    icon: List<String>,
    title: String,
    count: Int,
    appearance: AppearanceTheme,
) {
    Row(
        modifier = Modifier.fillMaxWidth().height(44.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StrokeSvgIcon(icon, appearance.mobileMuted, iconSize = 19.dp, strokeWidth = 1.75f)
        Text(
            title,
            modifier = Modifier.weight(1f).padding(start = 12.dp),
            color = appearance.mobileText,
            fontSize = 15.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(count.toString(), color = appearance.mobileMuted, fontSize = 14.sp)
    }
}

@Composable
private fun FolderPlanRow(
    title: String,
    count: Int,
    appearance: AppearanceTheme,
    create: Boolean = false,
) {
    Row(
        modifier = Modifier.fillMaxWidth().height(44.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (create) {
            DshProjectAddGlyph(tint = appearance.mobileMuted, iconSize = 19.dp)
        } else {
            DshFolderGlyph(expanded = false, tint = appearance.mobileMuted, iconSize = 19.dp)
        }
        Text(
            title,
            modifier = Modifier.weight(1f).padding(start = 12.dp),
            color = appearance.mobileText,
            fontSize = 15.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(count.toString(), color = appearance.mobileMuted, fontSize = 14.sp)
    }
}
