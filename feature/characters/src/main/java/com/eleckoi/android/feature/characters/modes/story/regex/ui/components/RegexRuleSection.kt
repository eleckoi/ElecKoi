package com.eleckoi.android.feature.characters.modes.story.regex.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRule
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import com.eleckoi.android.feature.characters.modes.story.regex.ui.presentation.sectionTitle
import com.eleckoi.android.feature.characters.modes.story.ui.shared.storyEditorPalette
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState

private val RegexRuleListShape = RoundedCornerShape(12.dp)
private val RegexSectionShape = RoundedCornerShape(22.dp)
private val RegexRowHeight = 56.dp
private val RegexRuleItemHeight = 57.dp

@Composable
internal fun RegexRuleSection(
    scope: RegexRuleScope,
    rules: List<RegexRule>,
    expanded: Boolean,
    batchEditing: Boolean,
    selectedIds: Set<String>,
    appearance: AppearanceTheme,
    onToggleExpanded: () -> Unit,
    onAdd: () -> Unit,
    onSelect: (String) -> Unit,
    onToggle: (RegexRule) -> Unit,
    onEdit: (RegexRule) -> Unit,
    onMove: (RegexRule, Int) -> Unit,
    onDelete: (RegexRule) -> Unit,
    onDragStart: () -> Unit,
    onDragMove: (String, String) -> Boolean,
    onDragStop: () -> Unit,
) {
    val palette = appearance.storyEditorPalette()
    val listState = rememberLazyListState()
    val haptic = LocalHapticFeedback.current
    val reorderableState = rememberReorderableLazyListState(listState) { from, to ->
        val fromId = from.key as? String ?: return@rememberReorderableLazyListState
        val toId = to.key as? String ?: return@rememberReorderableLazyListState
        if (onDragMove(fromId, toId)) {
            haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(
                elevation = 5.dp,
                shape = RegexSectionShape,
                ambientColor = appearance.mobileText.copy(alpha = 0.10f),
                spotColor = appearance.mobileText.copy(alpha = 0.08f),
            )
            .background(palette.cardFace, RegexSectionShape)
            .padding(start = 16.dp, top = 8.dp, end = 16.dp, bottom = 14.dp),
    ) {
        RegexSectionHeader(
            scope = scope,
            enabledCount = rules.count(RegexRule::enabled),
            totalCount = rules.size,
            expanded = expanded,
            appearance = appearance,
            onToggle = onToggleExpanded,
        )
        if (expanded) {
            RegexAddRuleRow(appearance, onAdd)
            if (rules.isNotEmpty()) {
                LazyColumn(
                    state = listState,
                    userScrollEnabled = false,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(RegexRuleItemHeight * rules.size)
                        .background(palette.cardFace, RegexRuleListShape)
                        .border(
                            width = 1.dp,
                            color = palette.bodyText.copy(alpha = 0.18f),
                            shape = RegexRuleListShape,
                        ),
                ) {
                    itemsIndexed(rules, key = { _, rule -> rule.id }) { index, rule ->
                        ReorderableItem(reorderableState, key = rule.id) { isDragging ->
                            Column {
                                RegexRuleRow(
                                    rule = rule,
                                    batchEditing = batchEditing,
                                    selected = rule.id in selectedIds,
                                    isDragging = isDragging,
                                    appearance = appearance,
                                    reorderModifier = if (batchEditing) {
                                        Modifier
                                    } else {
                                        Modifier.draggableHandle(
                                            onDragStarted = {
                                                onDragStart()
                                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                            },
                                            onDragStopped = {
                                                onDragStop()
                                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                            },
                                        )
                                    },
                                    onSelect = { onSelect(rule.id) },
                                    onToggle = { onToggle(rule) },
                                    onEdit = { onEdit(rule) },
                                    onMove = { direction -> onMove(rule, direction) },
                                    onDelete = { onDelete(rule) },
                                )
                                if (index < rules.lastIndex) RegexDivider(appearance, 52.dp)
                                else Spacer(Modifier.height(1.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RegexSectionHeader(
    scope: RegexRuleScope,
    enabledCount: Int,
    totalCount: Int,
    expanded: Boolean,
    appearance: AppearanceTheme,
    onToggle: () -> Unit,
) {
    val palette = appearance.storyEditorPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
            .noRippleClickable(onClick = onToggle)
            .padding(start = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            scope.sectionTitle(),
            color = palette.bodyText,
            fontSize = 15.5.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            "$enabledCount/$totalCount",
            modifier = Modifier.padding(start = 10.dp),
            color = palette.meta,
            fontSize = 13.sp,
        )
        Spacer(Modifier.weight(1f))
        Box(modifier = Modifier.size(36.dp), contentAlignment = Alignment.Center) {
            StrokeSvgIcon(
                AppIconPaths.ChevronDown,
                palette.meta,
                modifier = Modifier.graphicsLayer { rotationZ = if (expanded) 0f else -90f },
                iconSize = 17.dp,
                strokeWidth = 1.8f,
            )
        }
    }
}

@Composable
private fun RegexRuleRow(
    rule: RegexRule,
    batchEditing: Boolean,
    selected: Boolean,
    isDragging: Boolean,
    appearance: AppearanceTheme,
    reorderModifier: Modifier,
    onSelect: () -> Unit,
    onToggle: () -> Unit,
    onEdit: () -> Unit,
    onMove: (Int) -> Unit,
    onDelete: () -> Unit,
) {
    val palette = appearance.storyEditorPalette()
    var menuOpen by remember { mutableStateOf(false) }
    val dragLift by animateFloatAsState(
        targetValue = if (isDragging) 1f else 0f,
        animationSpec = tween(durationMillis = 100),
        label = "regex_drag_lift",
    )
    val dragShape = RoundedCornerShape(10.dp)
    val handleModifier = if (batchEditing) {
        Modifier
            .semantics {
                contentDescription = "选择 ${rule.name.ifBlank { "未命名规则" }}"
                this.selected = selected
            }
            .noRippleClickable(onClick = onSelect)
    } else {
        reorderModifier
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(RegexRowHeight)
            .zIndex(if (isDragging) 2f else 0f)
            .graphicsLayer {
                scaleX = 1f + 0.012f * dragLift
                scaleY = 1f + 0.012f * dragLift
                shadowElevation = 14f * dragLift
                shape = dragShape
                clip = false
            }
            .background(if (isDragging) palette.cardFace else Color.Transparent, dragShape),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.size(width = 52.dp, height = RegexRowHeight).then(handleModifier),
            contentAlignment = Alignment.Center,
        ) {
            if (batchEditing) SelectionMark(selected, appearance)
            else StrokeSvgIcon(
                AppIconPaths.Menu,
                if (isDragging) appearance.mobileBlue else palette.meta,
                iconSize = 20.dp,
                strokeWidth = 1.9f,
            )
        }
        Text(
            rule.name.ifBlank { "未命名规则" },
            modifier = Modifier
                .weight(1f)
                .height(RegexRowHeight)
                .noRippleClickable { if (batchEditing) onSelect() else onEdit() }
                .padding(horizontal = 6.dp, vertical = 17.dp),
            color = palette.bodyText.copy(alpha = if (rule.enabled) 1f else 0.48f),
            fontSize = 14.5.sp,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        CompactSwitch(rule.enabled, appearance, onToggle)
        Box {
            Box(
                modifier = Modifier
                    .size(50.dp)
                    .semantics {
                        contentDescription = "${rule.name.ifBlank { "未命名规则" }}更多操作"
                    }
                    .noRippleClickable { menuOpen = true },
                contentAlignment = Alignment.Center,
            ) {
                StrokeSvgIcon(AppIconPaths.MoreDots, palette.meta, iconSize = 23.dp, strokeWidth = 2.3f)
            }
            DropdownMenu(
                expanded = menuOpen,
                onDismissRequest = { menuOpen = false },
                modifier = Modifier
                    .clip(RoundedCornerShape(14.dp))
                    .background(appearance.mobileSurface)
                    .border(
                        width = 1.dp,
                        color = appearance.mobileText.copy(alpha = 0.10f),
                        shape = RoundedCornerShape(14.dp),
                    ),
            ) {
                RegexMenuItem("上移", appearance) { menuOpen = false; onMove(-1) }
                RegexMenuItem("下移", appearance) { menuOpen = false; onMove(1) }
                RegexMenuItem("编辑", appearance) { menuOpen = false; onEdit() }
                RegexMenuItem("删除", appearance, ElecKoiDanger) { menuOpen = false; onDelete() }
            }
        }
    }
}

@Composable
private fun RegexAddRuleRow(appearance: AppearanceTheme, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .noRippleClickable(onClick = onClick)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StrokeSvgIcon(AppIconPaths.Plus, appearance.mobileBlue, iconSize = 18.dp, strokeWidth = 1.9f)
        Text(
            "添加规则",
            modifier = Modifier.padding(start = 9.dp),
            color = appearance.mobileBlue,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun RegexMenuItem(
    label: String,
    appearance: AppearanceTheme,
    color: Color? = null,
    onClick: () -> Unit,
) {
    DropdownMenuItem(
        text = { Text(label, color = color ?: appearance.mobileText, fontSize = 13.5.sp) },
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 16.dp),
    )
}

@Composable
private fun RegexDivider(appearance: AppearanceTheme, startPadding: Dp) {
    val line = appearance.storyEditorPalette().bodyText.copy(alpha = 0.15f)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = startPadding)
            .height(1.dp)
            .background(line),
    )
}

@Composable
private fun SelectionMark(selected: Boolean, appearance: AppearanceTheme) {
    Box(
        modifier = Modifier
            .size(22.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(if (selected) appearance.mobileBlue else appearance.mobileMuted.copy(alpha = 0.22f))
            .padding(if (selected) 0.dp else 1.5.dp)
            .background(
                if (selected) Color.Transparent else appearance.mobileSurface,
                RoundedCornerShape(5.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (selected) {
            StrokeSvgIcon(
                AppIconPaths.Check,
                appearance.mobileAccentFg,
                iconSize = 14.dp,
                strokeWidth = 2.8f,
            )
        }
    }
}

@Composable
internal fun CompactSwitch(
    checked: Boolean,
    appearance: AppearanceTheme,
    onCheckedChange: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(width = 48.dp, height = 48.dp)
            .noRippleClickable(onClick = onCheckedChange),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(width = 36.dp, height = 21.dp)
                .clip(CircleShape)
                .background(if (checked) appearance.mobileBlue else appearance.mobileMuted.copy(alpha = 0.25f)),
        ) {
            Box(
                modifier = Modifier
                    .padding(2.dp)
                    .offset(x = if (checked) 15.dp else 0.dp)
                    .size(17.dp)
                    .clip(CircleShape)
                    .background(appearance.mobileSurface),
            )
        }
    }
}
