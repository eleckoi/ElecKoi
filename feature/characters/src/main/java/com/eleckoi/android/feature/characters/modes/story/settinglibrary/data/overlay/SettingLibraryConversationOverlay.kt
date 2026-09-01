package com.eleckoi.android.feature.characters.modes.story.settinglibrary.data

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryGroup
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.isFixedEntry
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import com.eleckoi.android.foundation.storage.room.ConversationSettingChangeEntity
import org.json.JSONObject

internal object SettingLibraryConversationOverlay {
    fun merge(
        base: SettingLibrary,
        changes: List<ConversationSettingChangeEntity>,
    ): SettingLibrary {
        val groupChanges = changes.filter { it.targetType == GroupTarget }
            .associateBy(ConversationSettingChangeEntity::targetId)
        val groupsById = base.groups.associateByTo(linkedMapOf(), SettingLibraryGroup::id)
        groupChanges.values.forEach { change ->
            when (change.operation) {
                UpsertOperation -> {
                    val group = parseConversationGroup(change)
                    groupsById[change.targetId] = group.copy(id = change.targetId)
                }
                DeleteOperation -> Unit
            }
        }
        val removedGroupIds = groupChanges.values
            .filter { it.operation == DeleteOperation }
            .mapTo(mutableSetOf(), ConversationSettingChangeEntity::targetId)
        var expanded = true
        while (expanded) {
            val before = removedGroupIds.size
            groupsById.values.forEach { group ->
                if (group.parentId in removedGroupIds) removedGroupIds += group.id
            }
            expanded = removedGroupIds.size != before
        }
        removedGroupIds.forEach(groupsById::remove)

        val entriesById = base.entries.associateByTo(linkedMapOf(), SettingLibraryEntry::id)
        changes.asSequence()
            .filter { it.targetType == EntryTarget }
            .filterNot { change -> entriesById[change.targetId]?.isFixedEntry() == true }
            .forEach { change ->
                when (change.operation) {
                    UpsertOperation -> {
                        val entry = parseConversationEntry(change)
                        if (!entry.isFixedEntry()) entriesById[change.targetId] = entry.copy(id = change.targetId)
                    }
                    DeleteOperation -> entriesById.remove(change.targetId)
                }
            }
        val entries = entriesById.values.filter { entry ->
            entry.groupId.isBlank() || entry.groupId in groupsById
        }
        return base.copy(
            entries = entries,
            groups = groupsById.values.toList(),
            expandedGroupIds = base.expandedGroupIds.filter(groupsById::containsKey),
        )
    }

    private fun parseConversationEntry(change: ConversationSettingChangeEntity): SettingLibraryEntry {
        return runCatching { SettingLibraryJsonCodec.entryFromJson(JSONObject(change.payloadJson)) }
            .getOrElse { error ->
                throw ElecKoiDataException("当前对话的动态设定条目已损坏：${change.targetId}", error)
            }
    }

    private fun parseConversationGroup(change: ConversationSettingChangeEntity): SettingLibraryGroup {
        return runCatching { SettingLibraryJsonCodec.groupFromJson(0, JSONObject(change.payloadJson)) }
            .getOrElse { error ->
                throw ElecKoiDataException("当前对话的动态设定分组已损坏：${change.targetId}", error)
            }
    }

    private const val EntryTarget = "entry"
    private const val GroupTarget = "group"
    private const val UpsertOperation = "upsert"
    private const val DeleteOperation = "delete"
}
