package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import com.eleckoi.android.feature.characters.modes.story.presets.model.StoryPreset
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.foundation.design.AppearanceTheme

/** Adds the read-only active-preset projection below the editable local setting tree. */
internal fun LazyListScope.activePresetTreeRows(
    preset: StoryPreset,
    nodes: List<SettingTreeNode>,
    selectedNodeId: String?,
    search: String,
    horizontalScrollState: ScrollState,
    appearance: AppearanceTheme,
    onSelectNode: (String) -> Unit,
    onOpenPreset: (String) -> Unit,
    onOpenEntry: (presetId: String, entryId: String) -> Unit,
    onUpdatePreset: (StoryPreset) -> Unit,
    onInvalidEnable: (SettingLibraryEntry) -> Unit,
    onConflictingOrder: (SettingLibraryEntry) -> Unit,
) {
    items(nodes, key = { "preset:${preset.id}:${it.id}" }) { node ->
        SettingTreeNodeRow(
            node = node,
            selected = selectedNodeId == node.id,
            dropTarget = false,
            dragging = false,
            expanded = node is SettingTreeNode.Folder &&
                (search.isNotBlank() || node.group.id in preset.expandedGroupIds),
            horizontalScrollState = horizontalScrollState,
            appearance = appearance,
            externalPresetSource = true,
            onSelect = { onSelectNode(node.id) },
            onOpen = {
                when (node) {
                    is SettingTreeNode.File -> onOpenEntry(preset.id, node.entry.id)
                    is SettingTreeNode.Folder -> onOpenPreset(preset.id)
                }
            },
            onFileEnabledChange = { entry, enabled ->
                when {
                    enabled && !entry.hasRequiredActivationFields() -> onInvalidEnable(entry)
                    enabled && entry.hasOrderConflictIn(preset.entries) -> onConflictingOrder(entry)
                    else -> onUpdatePreset(
                        preset.copy(
                            entries = preset.entries.map { current ->
                                if (current.id == entry.id) current.copy(enabled = enabled) else current
                            },
                        ),
                    )
                }
            },
            onToggle = {
                if (node is SettingTreeNode.Folder) {
                    val groupId = node.group.id
                    val expanded = preset.expandedGroupIds.toSet()
                    onUpdatePreset(
                        preset.copy(
                            expandedGroupIds = if (groupId in expanded) {
                                (expanded - groupId).toList()
                            } else {
                                (expanded + groupId).toList()
                            },
                        ),
                    )
                }
            },
        )
    }
}
