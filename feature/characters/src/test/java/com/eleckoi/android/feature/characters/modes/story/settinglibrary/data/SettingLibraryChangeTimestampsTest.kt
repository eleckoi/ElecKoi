package com.eleckoi.android.feature.characters.modes.story.settinglibrary.data

import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibrary
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryEntry
import com.eleckoi.android.feature.characters.modes.story.settinglibrary.model.SettingLibraryVersion
import org.junit.Assert.assertEquals
import org.junit.Test

class SettingLibraryChangeTimestampsTest {
    @Test
    fun `one edited entry does not touch unchanged entries`() {
        val oldEntries = (0 until 100).map { index ->
            SettingLibraryEntry(id = "entry-$index", content = "old-$index", updatedAt = "old-time")
        }
        val previousVersion = SettingLibraryVersion(
            id = "active", name = "library", entries = oldEntries,
            createdAt = "created", updatedAt = "old-time",
        )
        val previous = SettingLibrary(
            characterId = "character", name = "library", entries = oldEntries,
            activeVersionId = "active", versions = listOf(previousVersion),
        )
        val normalizedEntries = oldEntries.map { entry ->
            entry.copy(
                content = if (entry.id == "entry-3") "edited" else entry.content,
                updatedAt = "normalizer-time",
            )
        }
        val normalized = previous.copy(
            entries = normalizedEntries,
            versions = listOf(previousVersion.copy(entries = normalizedEntries, updatedAt = "normalizer-time")),
        )

        val result = settleSettingLibraryChangeTimestamps(previous, normalized, "save-time")

        assertEquals("save-time", result.entries.single { it.id == "entry-3" }.updatedAt)
        assertEquals(
            99,
            result.entries.count { it.id != "entry-3" && it.updatedAt == "old-time" },
        )
        assertEquals("save-time", result.versions.single().updatedAt)
    }

    @Test
    fun `repeated unchanged save keeps all timestamps stable`() {
        val entry = SettingLibraryEntry(id = "entry", content = "same", updatedAt = "old-time")
        val version = SettingLibraryVersion(id = "active", entries = listOf(entry), updatedAt = "old-time")
        val previous = SettingLibrary(
            characterId = "character", entries = listOf(entry),
            activeVersionId = "active", versions = listOf(version),
        )
        val normalized = previous.copy(
            entries = listOf(entry.copy(updatedAt = "normalizer-time")),
            versions = listOf(version.copy(
                entries = listOf(entry.copy(updatedAt = "normalizer-time")),
                updatedAt = "normalizer-time",
            )),
        )

        val result = settleSettingLibraryChangeTimestamps(previous, normalized, "save-time")

        assertEquals("old-time", result.entries.single().updatedAt)
        assertEquals("old-time", result.versions.single().updatedAt)
    }
}
