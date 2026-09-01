package com.eleckoi.android.feature.characters.modes.story.regex.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import com.eleckoi.android.feature.characters.modes.story.regex.ui.components.RegexRuleSection
import com.eleckoi.android.feature.characters.modes.story.regex.ui.components.RegexRulesBottomBar
import com.eleckoi.android.feature.characters.modes.story.regex.ui.dialogs.RegexScopePickerDialog
import com.eleckoi.android.feature.characters.modes.story.regex.ui.policy.hasSameRuleOrder
import com.eleckoi.android.foundation.design.components.AppIconPaths
import com.eleckoi.android.foundation.design.components.PinnedStatusScaffold
import com.eleckoi.android.foundation.design.components.StrokeSvgIcon
import com.eleckoi.android.foundation.design.components.noRippleClickable
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRule
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleCollection
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorCardSpacing
import com.eleckoi.android.feature.characters.modes.story.ui.shared.StoryEditorHeader
import com.eleckoi.android.feature.characters.modes.story.ui.shared.storyEditorPalette
import com.eleckoi.android.foundation.design.AppearanceTheme
import com.eleckoi.android.foundation.design.ElecKoiDanger

private data class RuleEdit(
    val scope: RegexRuleScope,
    val rule: RegexRule,
    val isNew: Boolean,
)

@Composable
fun RegexRulesPage(
    rules: RegexRuleCollection?,
    appearance: AppearanceTheme,
    errorMessage: String,
    onBack: () -> Unit,
    onSave: (RegexRuleCollection) -> Unit,
    onImportRules: (RegexRuleScope) -> Unit,
    onExportRules: (Set<String>) -> Unit,
) {
    val collection = rules ?: RegexRuleCollection()
    val palette = appearance.storyEditorPalette()
    var editing by remember { mutableStateOf<RuleEdit?>(null) }
    var managerOpen by remember { mutableStateOf(false) }
    var batchEditing by remember { mutableStateOf(false) }
    var selectedIds by remember { mutableStateOf(emptySet<String>()) }
    var importScopePickerOpen by remember { mutableStateOf(false) }
    var pendingDeleteIds by remember { mutableStateOf(emptySet<String>()) }
    var reorderDraft by remember { mutableStateOf<RegexRuleCollection?>(null) }
    val expanded = remember {
        mutableStateMapOf(
            RegexRuleScope.Global to true,
            RegexRuleScope.PromptPreset to true,
            RegexRuleScope.Character to true,
        )
    }
    val displayedCollection = reorderDraft ?: collection
    val latestDisplayedCollection by rememberUpdatedState(displayedCollection)
    val allRules = displayedCollection.allRules()
    val allIds = remember(allRules) { allRules.map(RegexRule::id).toSet() }
    val enabledCount = allRules.count(RegexRule::enabled)
    val versionName = displayedCollection.activeVersion()?.name ?: "默认"
    val pageBackground = palette.pageBg

    LaunchedEffect(allIds) {
        selectedIds = selectedIds.intersect(allIds)
        if (allIds.isEmpty()) batchEditing = false
    }
    LaunchedEffect(collection) {
        val draft = reorderDraft
        if (draft != null && collection.hasSameRuleOrder(draft)) reorderDraft = null
    }

    fun saveAndExitBatch(next: RegexRuleCollection) {
        onSave(next)
        selectedIds = emptySet()
        batchEditing = false
    }

    fun commitReorder() {
        val draft = reorderDraft
        if (draft != null && !collection.hasSameRuleOrder(draft)) onSave(draft)
    }

    PinnedStatusScaffold(appearance = appearance, imeAware = true, backgroundColor = pageBackground) {
        Column(modifier = Modifier.fillMaxSize().background(pageBackground)) {
            StoryEditorHeader(
                title = "正则规则",
                subtitle = if (batchEditing) "已选择 ${selectedIds.size} 项" else "$enabledCount/${allRules.size} 生效 · $versionName",
                appearance = appearance,
                backgroundColor = pageBackground,
                backButtonElevation = 4.dp,
                onBack = onBack,
                actionWidth = 48.dp,
                action = {
                    HeaderIconButton(
                        icon = AppIconPaths.Filter,
                        contentDescription = "正则管理",
                        appearance = appearance,
                        onClick = { managerOpen = true },
                    )
                },
            )

            Box(modifier = Modifier.weight(1f)) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 100.dp),
                    verticalArrangement = Arrangement.spacedBy(StoryEditorCardSpacing),
                ) {
                    items(RegexRuleScope.entries, key = { it.name }) { scope ->
                        RegexRuleSection(
                            scope = scope,
                            rules = displayedCollection.rulesFor(scope),
                            expanded = expanded[scope] == true,
                            batchEditing = batchEditing,
                            selectedIds = selectedIds,
                            appearance = appearance,
                            onToggleExpanded = { expanded[scope] = expanded[scope] != true },
                            onAdd = { editing = RuleEdit(scope, RegexRule(), isNew = true) },
                            onSelect = { ruleId ->
                                selectedIds = if (ruleId in selectedIds) selectedIds - ruleId else selectedIds + ruleId
                            },
                            onToggle = { rule ->
                                onSave(latestDisplayedCollection.setRuleEnabled(scope, rule.id, !rule.enabled))
                            },
                            onEdit = { rule -> editing = RuleEdit(scope, rule, isNew = false) },
                            onMove = { rule, direction ->
                                onSave(latestDisplayedCollection.moveRule(scope, rule.id, direction))
                            },
                            onDelete = { rule -> pendingDeleteIds = setOf(rule.id) },
                            onDragStart = {
                                reorderDraft = latestDisplayedCollection
                            },
                            onDragMove = { ruleId, targetRuleId ->
                                val current = reorderDraft ?: collection
                                val next = current.moveRuleTo(scope, ruleId, targetRuleId)
                                if (next != current) {
                                    reorderDraft = next
                                    true
                                } else {
                                    false
                                }
                            },
                            onDragStop = {
                                commitReorder()
                            },
                        )
                    }
                }

                if (errorMessage.isNotBlank()) {
                    Text(
                        text = errorMessage,
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .zIndex(4f)
                            .padding(horizontal = 22.dp, vertical = 6.dp)
                            .shadow(4.dp, RoundedCornerShape(10.dp))
                            .background(appearance.mobileSurface, RoundedCornerShape(10.dp))
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        color = ElecKoiDanger,
                        fontSize = 11.5.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }

                RegexRulesBottomBar(
                    batchEditing = batchEditing,
                    selectedIds = selectedIds,
                    hasRules = allRules.isNotEmpty(),
                    appearance = appearance,
                    modifier = Modifier.align(Alignment.BottomCenter),
                    onToggleBatch = {
                        batchEditing = !batchEditing
                        selectedIds = emptySet()
                    },
                    onCopy = { onSave(displayedCollection.duplicateRules(selectedIds)) },
                    onDelete = { pendingDeleteIds = selectedIds },
                    onImport = { importScopePickerOpen = true },
                    onExport = { onExportRules(selectedIds) },
                )
            }
        }
    }

    editing?.let { target ->
        RegexRuleEditorSheet(
            rule = target.rule,
            appearance = appearance,
            onDismiss = { editing = null },
            onSave = { updated ->
                onSave(displayedCollection.upsertRule(target.scope, updated))
                editing = null
            },
            onDelete = if (target.isNew) null else {
                {
                    pendingDeleteIds = setOf(target.rule.id)
                    editing = null
                }
            },
        )
    }

    if (managerOpen) {
        RegexVersionManagerSheet(
            collection = displayedCollection,
            appearance = appearance,
            onDismiss = { managerOpen = false },
            onSave = onSave,
        )
    }

    if (importScopePickerOpen) {
        RegexScopePickerDialog(
            appearance = appearance,
            onDismiss = { importScopePickerOpen = false },
            onPick = { scope ->
                importScopePickerOpen = false
                onImportRules(scope)
            },
        )
    }

    if (pendingDeleteIds.isNotEmpty()) {
        AlertDialog(
            onDismissRequest = { pendingDeleteIds = emptySet() },
            title = { Text(if (pendingDeleteIds.size == 1) "删除这条规则？" else "删除 ${pendingDeleteIds.size} 条规则？") },
            text = { Text("删除后无法恢复。") },
            confirmButton = {
                TextButton(
                    onClick = {
                        saveAndExitBatch(displayedCollection.removeRules(pendingDeleteIds))
                        pendingDeleteIds = emptySet()
                    },
                ) { Text("删除", color = ElecKoiDanger) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteIds = emptySet() }) { Text("取消") }
            },
            containerColor = appearance.mobileSurface,
            titleContentColor = appearance.mobileText,
            textContentColor = appearance.mobileMuted,
        )
    }
}

@Composable
private fun HeaderIconButton(
    icon: List<String>,
    contentDescription: String,
    appearance: AppearanceTheme,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier.size(48.dp).semantics { this.contentDescription = contentDescription }
            .noRippleClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        StrokeSvgIcon(icon, appearance.mobileText, iconSize = 25.dp, strokeWidth = 1.75f)
    }
}
