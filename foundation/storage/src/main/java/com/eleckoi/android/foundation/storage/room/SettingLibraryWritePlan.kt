package com.eleckoi.android.foundation.storage.room

internal data class SettingLibraryWritePlan(
    val metadata: SettingLibraryEntity?,
    val upsertEntries: List<SettingLibraryEntryEntity>,
    val deleteEntryIds: List<String>,
    val upsertGroups: List<SettingLibraryGroupEntity>,
    val deleteGroupIds: List<String>,
    val upsertVersions: List<SettingLibraryVersionEntity>,
    val deleteVersionIds: List<String>,
    val upsertVersionEntries: List<SettingLibraryVersionEntryEntity>,
    val deleteVersionEntries: Map<String, List<String>>,
    val upsertVersionGroups: List<SettingLibraryVersionGroupEntity>,
    val deleteVersionGroups: Map<String, List<String>>,
)

internal fun settingLibraryWritePlan(
    current: SettingLibraryRecord?,
    incoming: SettingLibraryRecord,
): SettingLibraryWritePlan {
    val currentEntries = current?.entries.orEmpty().associateBy(SettingLibraryEntryEntity::entryId)
    val incomingEntries = incoming.entries.associateBy(SettingLibraryEntryEntity::entryId)
    val currentGroups = current?.groups.orEmpty().associateBy(SettingLibraryGroupEntity::groupId)
    val incomingGroups = incoming.groups.associateBy(SettingLibraryGroupEntity::groupId)
    val currentVersions = current?.versions.orEmpty().associateBy(SettingLibraryVersionEntity::versionId)
    val incomingVersions = incoming.versions.associateBy(SettingLibraryVersionEntity::versionId)
    val retainedVersionIds = incomingVersions.keys

    return SettingLibraryWritePlan(
        metadata = incoming.library.takeIf { it != current?.library },
        upsertEntries = incoming.entries.filter { it != currentEntries[it.entryId] },
        deleteEntryIds = currentEntries.keys.filterNot(incomingEntries::containsKey),
        upsertGroups = incoming.groups.filter { it != currentGroups[it.groupId] },
        deleteGroupIds = currentGroups.keys.filterNot(incomingGroups::containsKey),
        upsertVersions = incoming.versions.filter { it != currentVersions[it.versionId] },
        deleteVersionIds = currentVersions.keys.filterNot(incomingVersions::containsKey),
        upsertVersionEntries = changedVersionEntries(current?.versionEntries.orEmpty(), incoming.versionEntries),
        deleteVersionEntries = removedVersionEntries(
            current?.versionEntries.orEmpty(), incoming.versionEntries, retainedVersionIds,
        ),
        upsertVersionGroups = changedVersionGroups(current?.versionGroups.orEmpty(), incoming.versionGroups),
        deleteVersionGroups = removedVersionGroups(
            current?.versionGroups.orEmpty(), incoming.versionGroups, retainedVersionIds,
        ),
    )
}

private fun changedVersionEntries(
    current: List<SettingLibraryVersionEntryEntity>,
    incoming: List<SettingLibraryVersionEntryEntity>,
): List<SettingLibraryVersionEntryEntity> {
    val existing = current.associateBy { it.versionId to it.entryId }
    return incoming.filter { it != existing[it.versionId to it.entryId] }
}

private fun removedVersionEntries(
    current: List<SettingLibraryVersionEntryEntity>,
    incoming: List<SettingLibraryVersionEntryEntity>,
    retainedVersionIds: Set<String>,
): Map<String, List<String>> {
    val retained = incoming.mapTo(hashSetOf()) { it.versionId to it.entryId }
    return current.asSequence()
        .filter { it.versionId in retainedVersionIds && (it.versionId to it.entryId) !in retained }
        .groupBy(SettingLibraryVersionEntryEntity::versionId, SettingLibraryVersionEntryEntity::entryId)
}

private fun changedVersionGroups(
    current: List<SettingLibraryVersionGroupEntity>,
    incoming: List<SettingLibraryVersionGroupEntity>,
): List<SettingLibraryVersionGroupEntity> {
    val existing = current.associateBy { it.versionId to it.groupId }
    return incoming.filter { it != existing[it.versionId to it.groupId] }
}

private fun removedVersionGroups(
    current: List<SettingLibraryVersionGroupEntity>,
    incoming: List<SettingLibraryVersionGroupEntity>,
    retainedVersionIds: Set<String>,
): Map<String, List<String>> {
    val retained = incoming.mapTo(hashSetOf()) { it.versionId to it.groupId }
    return current.asSequence()
        .filter { it.versionId in retainedVersionIds && (it.versionId to it.groupId) !in retained }
        .groupBy(SettingLibraryVersionGroupEntity::versionId, SettingLibraryVersionGroupEntity::groupId)
}
