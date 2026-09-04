package com.eleckoi.android.feature.settings.ui.personalization.common

import com.eleckoi.android.feature.settings.ui.personalization.components.*

import com.eleckoi.android.foundation.design.components.BottomTab
import com.eleckoi.android.foundation.design.components.NavIcon
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.DragHandle
import androidx.compose.material.icons.rounded.RemoveCircleOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.eleckoi.android.foundation.design.AppearanceTheme
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

@Composable
fun CommonPagesSettingsPage(
    appearance: AppearanceTheme,
    presetPagePinned: Boolean,
    pluginPagePinned: Boolean,
    commonPageOrder: List<BottomTab>,
    onOptionalPageChange: (BottomTab?) -> Unit,
    onOrderChange: (List<BottomTab>) -> Unit,
    onBack: () -> Unit,
) {
    val visibleTabs = BottomTab.visibleTabs(
        presetsPinned = presetPagePinned,
        pluginsPinned = pluginPagePinned,
        order = commonPageOrder,
    )
    val optionalPage = BottomTab.optionalPage(
        presetsPinned = presetPagePinned,
        pluginsPinned = pluginPagePinned,
        order = commonPageOrder,
    )
    var reorderDraft by remember { mutableStateOf<List<BottomTab>?>(null) }
    val displayedTabs = reorderDraft ?: visibleTabs
    val latestDisplayedTabs by rememberUpdatedState(displayedTabs)
    val latestVisibleTabs by rememberUpdatedState(visibleTabs)
    val latestOnOrderChange by rememberUpdatedState(onOrderChange)
    val listState = rememberLazyListState()
    val haptic = LocalHapticFeedback.current
    val reorderableState = rememberReorderableLazyListState(listState) { from, to ->
        val current = latestDisplayedTabs
        val fromIndex = current.indexOfFirst { it.storageKey == from.key }
        val toIndex = current.indexOfFirst { it.storageKey == to.key }
        if (fromIndex !in current.indices || toIndex !in current.indices || fromIndex == toIndex) {
            return@rememberReorderableLazyListState
        }
        reorderDraft = current.toMutableList().apply {
            add(toIndex, removeAt(fromIndex))
        }
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }
    val moveAndSave: (Int, Int) -> Unit = { fromIndex, toIndex ->
        val current = latestDisplayedTabs
        if (fromIndex in current.indices && toIndex in current.indices && fromIndex != toIndex) {
            latestOnOrderChange(
                current.toMutableList().apply { add(toIndex, removeAt(fromIndex)) },
            )
        }
    }
    CompactSettingsScaffold(
        title = "常用页面",
        appearance = appearance,
        onBack = onBack,
    ) {
        SettingsSection(label = "当前显示", appearance = appearance) {
            LazyColumn(
                state = listState,
                userScrollEnabled = false,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp * displayedTabs.size),
            ) {
                itemsIndexed(
                    items = displayedTabs,
                    key = { _, tab -> tab.storageKey },
                ) { index, tab ->
                    ReorderableItem(reorderableState, key = tab.storageKey) { _ ->
                        Column {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(53.dp)
                                    .padding(start = SettingsRowPadding, end = 4.dp)
                                    .semantics {
                                        customActions = buildList {
                                            if (index > 0) {
                                                add(
                                                    CustomAccessibilityAction("上移") {
                                                        moveAndSave(index, index - 1)
                                                        true
                                                    },
                                                )
                                            }
                                            if (index < displayedTabs.lastIndex) {
                                                add(
                                                    CustomAccessibilityAction("下移") {
                                                        moveAndSave(index, index + 1)
                                                        true
                                                    },
                                                )
                                            }
                                        }
                                    },
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                NavIcon(
                                    tab = tab.icon,
                                    color = appearance.mobileMuted,
                                    filled = false,
                                    modifier = Modifier.size(SettingsRowIconSize),
                                )
                                Text(
                                    text = tab.label,
                                    color = appearance.mobileText,
                                    fontSize = 15.sp,
                                    lineHeight = 20.sp,
                                    modifier = Modifier
                                        .weight(1f)
                                        .padding(start = SettingsRowIconGap),
                                )
                                Box(
                                    modifier = Modifier
                                        .size(48.dp)
                                        .draggableHandle(
                                            onDragStarted = {
                                                reorderDraft = latestDisplayedTabs
                                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                            },
                                            onDragStopped = {
                                                reorderDraft
                                                    ?.takeIf { it != latestVisibleTabs }
                                                    ?.let(latestOnOrderChange)
                                                reorderDraft = null
                                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                            },
                                        ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.DragHandle,
                                        contentDescription = "拖动${tab.label}",
                                        tint = appearance.mobileMuted,
                                        modifier = Modifier.size(22.dp),
                                    )
                                }
                            }
                            if (index < displayedTabs.lastIndex) {
                                SettingsDivider(appearance, startIndent = SettingsRowTextStart)
                            }
                        }
                    }
                }
            }
        }
        SettingsSection(label = "附加页面", appearance = appearance) {
            CommonPageChoiceRow(
                tab = null,
                selected = optionalPage == null,
                appearance = appearance,
                onClick = { onOptionalPageChange(null) },
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            CommonPageChoiceRow(
                tab = BottomTab.Presets,
                selected = optionalPage == BottomTab.Presets,
                appearance = appearance,
                onClick = { onOptionalPageChange(BottomTab.Presets) },
            )
            SettingsDivider(appearance, startIndent = SettingsRowTextStart)
            CommonPageChoiceRow(
                tab = BottomTab.Plugins,
                selected = optionalPage == BottomTab.Plugins,
                appearance = appearance,
                onClick = { onOptionalPageChange(BottomTab.Plugins) },
            )
        }
    }
}

@Composable
private fun CommonPageChoiceRow(
    tab: BottomTab?,
    selected: Boolean,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(54.dp)
            .selectable(
                selected = selected,
                interactionSource = interactionSource,
                indication = null,
                role = Role.RadioButton,
                onClick = onClick,
            )
            .padding(start = SettingsRowPadding, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (tab == null) {
            Icon(
                imageVector = Icons.Rounded.RemoveCircleOutline,
                contentDescription = null,
                tint = appearance.mobileMuted,
                modifier = Modifier.size(SettingsRowIconSize),
            )
        } else {
            NavIcon(
                tab = tab.icon,
                color = appearance.mobileMuted,
                filled = false,
                modifier = Modifier.size(SettingsRowIconSize),
            )
        }
        Text(
            text = tab?.label ?: "不添加",
            color = appearance.mobileText,
            fontSize = 15.sp,
            lineHeight = 20.sp,
            modifier = Modifier
                .weight(1f)
                .padding(start = SettingsRowIconGap, end = 12.dp),
        )
        SettingsSelectionCheck(
            selected = selected,
            appearance = appearance,
        )
    }
}
