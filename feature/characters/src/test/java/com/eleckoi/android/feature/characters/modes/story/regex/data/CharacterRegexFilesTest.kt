package com.eleckoi.android.feature.characters.modes.story.regex.data

import java.io.File
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CharacterRegexFilesTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test fun `deleting characters removes their rules and preserves shared and retained rules`() {
        val root = temporary.newFolder("regex")
        val shared = File(root, "shared-rules.json").apply { writeText("shared") }
        val directory = File(root, "characters").apply { mkdirs() }
        val removed = File(directory, "character-a.json").apply { writeText("private") }
        val retained = File(directory, "character-b.json").apply { writeText("retained") }
        val files = CharacterRegexFiles(directory)
        repeat(2) { files.delete(listOf("character-a", "character-a", " ")) }
        assertFalse(removed.exists())
        assertEquals("retained", retained.readText())
        assertEquals("shared", shared.readText())
    }

    @Test fun `collection replacement also removes previously orphaned rules`() {
        val directory = temporary.newFolder("characters")
        (0..100).forEach { File(directory, "character-$it.json").writeText("rule") }
        val files = CharacterRegexFiles(directory)
        repeat(2) { files.retain(listOf("character-4")) }
        assertEquals(listOf("character-4.json"), directory.list()!!.toList())
        files.retain(emptyList())
        assertTrue(directory.list()!!.isEmpty())
    }
}
