package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryAgentReadStrategy
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryDynamicMode
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryTriggerMode

internal enum class SettingLibraryEntryDraftKind {
    Standard,
    EjsReference,
}

internal fun createSettingLibraryEntryDraft(
    id: String,
    groupId: String,
    triggerMode: SettingLibraryTriggerMode,
    existingEntries: List<SettingLibraryEntry>,
    treeViewOrder: Int,
    kind: SettingLibraryEntryDraftKind = SettingLibraryEntryDraftKind.Standard,
): SettingLibraryEntry {
    val base = SettingLibraryEntry(
        id = id,
        title = "",
        enabled = false,
        order = 1,
        viewOrder = (existingEntries.maxOfOrNull { it.viewOrder } ?: 0) + 1,
        groupId = groupId,
        triggerMode = triggerMode,
        groupViewOrder = if (groupId.isBlank()) {
            0
        } else {
            (existingEntries.filter { it.groupId == groupId }.maxOfOrNull { it.groupViewOrder } ?: 0) + 1
        },
        treeViewOrder = treeViewOrder,
    )
    return if (kind == SettingLibraryEntryDraftKind.EjsReference) {
        base.copy(
            enabled = true,
            triggerMode = SettingLibraryTriggerMode.AgentTool,
            agentReadStrategy = SettingLibraryAgentReadStrategy.VariableCondition,
            dynamicMode = SettingLibraryDynamicMode.EjsReference,
        )
    } else {
        base
    }
}
