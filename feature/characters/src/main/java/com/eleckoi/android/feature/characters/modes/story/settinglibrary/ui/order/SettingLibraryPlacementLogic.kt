package com.eleckoi.android.feature.characters.modes.story.settinglibrary.ui

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryInsertRole
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryPosition
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryTriggerMode
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isFixedEntry

internal fun positionOrderScope(
    entries: List<SettingLibraryEntry>,
    position: SettingLibraryPosition,
    promptPositionId: String = "",
): List<SettingLibraryEntry> {
    val targetScope = promptPositionId.ifBlank { position.storageValue }
    return entries
        .filter { entry ->
            entry.promptPositionId.ifBlank { entry.position?.storageValue.orEmpty() } == targetScope
        }
        .sortedWith(
            compareBy<SettingLibraryEntry> { it.order }
                .thenBy { it.title }
                .thenBy { it.id },
        )
}

internal fun nextPositionOrder(
    entries: List<SettingLibraryEntry>,
    position: SettingLibraryPosition,
    excludingEntryId: String,
    promptPositionId: String = "",
): Int {
    return positionOrderScope(entries, position, promptPositionId)
        .asSequence()
        .filterNot { it.id == excludingEntryId || it.isFixedEntry() }
        .maxOfOrNull { it.order }
        ?.plus(1)
        ?: 1
}

internal fun movePositionEntry(
    entries: List<SettingLibraryEntry>,
    entryId: String,
    targetPosition: SettingLibraryPosition,
    targetPromptPositionId: String = "",
    relativeEntryId: String? = null,
    insertAfterRelative: Boolean = false,
): List<SettingLibraryEntry> {
    val moving = entries.firstOrNull { it.id == entryId }
        ?.takeIf { !it.isFixedEntry() && it.triggerMode == SettingLibraryTriggerMode.Always }
        ?: return entries
    val sourcePosition = moving.position
    val sourcePromptPositionId = moving.promptPositionId
    val targetScope = positionOrderScope(entries, targetPosition, targetPromptPositionId)
        .filter { entry ->
            entry.id != entryId &&
                !entry.isFixedEntry() &&
                entry.triggerMode == SettingLibraryTriggerMode.Always
        }
        .toMutableList()
    val relativeIndex = targetScope.indexOfFirst { it.id == relativeEntryId }
    val insertionIndex = when {
        relativeIndex < 0 -> targetScope.size
        insertAfterRelative -> relativeIndex + 1
        else -> relativeIndex
    }
    targetScope.add(
        insertionIndex.coerceIn(0, targetScope.size),
        moving.copy(
            position = targetPosition,
            promptPositionId = targetPromptPositionId,
            insertRole = if (targetPosition == SettingLibraryPosition.Instructions) {
                SettingLibraryInsertRole.System
            } else {
                moving.insertRole.takeUnless { it == SettingLibraryInsertRole.System }
                    ?: SettingLibraryInsertRole.User
            },
        ),
    )
    val targetOrders = targetScope.mapIndexed { index, entry -> entry.id to (index + 1) }.toMap()

    val sourceOrders = if (
        sourcePosition != null &&
        sourcePromptPositionId.ifBlank { sourcePosition.storageValue } !=
            targetPromptPositionId.ifBlank { targetPosition.storageValue }
    ) {
        positionOrderScope(entries, sourcePosition, sourcePromptPositionId)
            .filter { entry ->
                entry.id != entryId &&
                    !entry.isFixedEntry() &&
                    entry.triggerMode == SettingLibraryTriggerMode.Always
            }
            .mapIndexed { index, entry -> entry.id to (index + 1) }
            .toMap()
    } else {
        emptyMap()
    }

    return entries.map { entry ->
        when {
            entry.id in targetOrders -> entry.copy(
                position = if (entry.id == entryId) targetPosition else entry.position,
                promptPositionId = if (entry.id == entryId) targetPromptPositionId else entry.promptPositionId,
                insertRole = if (entry.id == entryId) {
                    if (targetPosition == SettingLibraryPosition.Instructions) {
                        SettingLibraryInsertRole.System
                    } else {
                        entry.insertRole.takeUnless { it == SettingLibraryInsertRole.System }
                            ?: SettingLibraryInsertRole.User
                    }
                } else {
                    entry.insertRole
                },
                order = targetOrders.getValue(entry.id),
            )
            entry.id in sourceOrders -> entry.copy(order = sourceOrders.getValue(entry.id))
            else -> entry
        }
    }
}
