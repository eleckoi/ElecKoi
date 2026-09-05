package com.eleckoi.android.foundation.storage.room

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingLibraryWritePlanTest {
    @Test
    fun `editing one of one hundred entries writes only that entry and its active version copy`() {
        val current = record(entryCount = 100)
        val edited = current.copy(
            library = current.library.copy(updatedAt = "later"),
            entries = current.entries.map { row ->
                if (row.entryId == "entry-3") row.copy(payloadJson = "edited") else row
            },
            versions = current.versions.map { it.copy(updatedAt = "later") },
            versionEntries = current.versionEntries.map { row ->
                if (row.entryId == "entry-3") row.copy(payloadJson = "edited") else row
            },
        )

        val plan = settingLibraryWritePlan(current, edited)

        assertEquals(listOf("entry-3"), plan.upsertEntries.map { it.entryId })
        assertEquals(listOf("entry-3"), plan.upsertVersionEntries.map { it.entryId })
        assertEquals(listOf("active"), plan.upsertVersions.map { it.versionId })
        assertEquals("later", plan.metadata?.updatedAt)
        assertTrue(plan.upsertGroups.isEmpty())
        assertTrue(plan.upsertVersionGroups.isEmpty())
        assertTrue(plan.deleteEntryIds.isEmpty())
        assertTrue(plan.deleteVersionIds.isEmpty())
    }

    @Test
    fun `unchanged save produces no child writes`() {
        val current = record(entryCount = 5)
        val plan = settingLibraryWritePlan(current, current)

        assertNull(plan.metadata)
        assertTrue(plan.upsertEntries.isEmpty())
        assertTrue(plan.upsertGroups.isEmpty())
        assertTrue(plan.upsertVersions.isEmpty())
        assertTrue(plan.upsertVersionEntries.isEmpty())
        assertTrue(plan.upsertVersionGroups.isEmpty())
        assertTrue(plan.deleteEntryIds.isEmpty())
        assertTrue(plan.deleteGroupIds.isEmpty())
        assertTrue(plan.deleteVersionIds.isEmpty())
        assertTrue(plan.deleteVersionEntries.isEmpty())
        assertTrue(plan.deleteVersionGroups.isEmpty())
    }

    @Test
    fun `removing one entry and one retained-version group deletes exact keys`() {
        val current = record(entryCount = 5, groupCount = 3)
        val incoming = current.copy(
            entries = current.entries.filterNot { it.entryId == "entry-2" },
            versionEntries = current.versionEntries.filterNot { it.entryId == "entry-2" },
            groups = current.groups.filterNot { it.groupId == "group-1" },
            versionGroups = current.versionGroups.filterNot { it.groupId == "group-1" },
        )

        val plan = settingLibraryWritePlan(current, incoming)

        assertEquals(listOf("entry-2"), plan.deleteEntryIds)
        assertEquals(listOf("group-1"), plan.deleteGroupIds)
        assertEquals(mapOf("active" to listOf("entry-2")), plan.deleteVersionEntries)
        assertEquals(mapOf("active" to listOf("group-1")), plan.deleteVersionGroups)
    }

    private fun record(entryCount: Int, groupCount: Int = 0): SettingLibraryRecord {
        val characterId = "character"
        val versionId = "active"
        val entries = (0 until entryCount).map { index ->
            SettingLibraryEntryEntity(characterId, "entry-$index", index, "entry-$index")
        }
        val groups = (0 until groupCount).map { index ->
            SettingLibraryGroupEntity(characterId, "group-$index", index, "group-$index")
        }
        return SettingLibraryRecord(
            library = SettingLibraryEntity(characterId, "library", versionId, true, "[]", "[]", "now"),
            entries = entries,
            groups = groups,
            versions = listOf(
                SettingLibraryVersionEntity(characterId, versionId, 0, "library", true, "[]", "[]", "now", "now"),
            ),
            versionEntries = entries.map {
                SettingLibraryVersionEntryEntity(characterId, versionId, it.entryId, it.sortIndex, it.payloadJson)
            },
            versionGroups = groups.map {
                SettingLibraryVersionGroupEntity(characterId, versionId, it.groupId, it.sortIndex, it.payloadJson)
            },
        )
    }
}
