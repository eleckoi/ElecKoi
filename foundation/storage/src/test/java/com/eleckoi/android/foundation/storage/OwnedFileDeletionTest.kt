package com.eleckoi.android.foundation.storage

import java.io.File
import java.nio.file.Files
import org.junit.Assume.assumeNoException
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class OwnedFileDeletionTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test fun `deletes a complete owned tree and tolerates repeated deletion`() {
        val root = temporary.newFolder("characters")
        val target = File(root, "deleted")
        File(target, "nested").mkdirs()
        File(target, "nested/avatar.png").writeText("image")
        val retained = File(root, "retained").apply { mkdirs() }
        repeat(2) { deleteOwnedDirectory(root, target) }
        assertFalse(target.exists())
        assertTrue(retained.exists())
    }

    @Test fun `rejects root sibling prefix and traversal paths`() {
        val root = temporary.newFolder("characters")
        val sibling = temporary.newFolder("characters-other")
        listOf(root, sibling, File(root, "../characters-other")).forEach { target ->
            assertThrows(IllegalArgumentException::class.java) { deleteOwnedDirectory(root, target) }
        }
        assertTrue(root.exists())
        assertTrue(sibling.exists())
    }

    @Test fun `file deletion fails instead of silently accepting a directory`() {
        val root = temporary.newFolder("regex")
        val target = File(root, "broken.json").apply { mkdirs() }
        File(target, "retained").writeText("keep")
        assertThrows(IllegalArgumentException::class.java) { deleteOwnedFile(root, target) }
        assertTrue(target.exists())
    }

    @Test fun `deleting owned links never follows them into another store`() {
        val root = temporary.newFolder("owned")
        val outside = temporary.newFolder("outside")
        val marker = File(outside, "keep.txt").apply { writeText("keep") }
        val target = File(root, "character").apply { mkdirs() }
        try {
            Files.createSymbolicLink(File(target, "external").toPath(), outside.toPath())
        } catch (error: Exception) {
            assumeNoException("This host cannot create symlinks", error)
            return
        }
        deleteOwnedDirectory(root, target)
        assertFalse(target.exists())
        assertEquals("keep", marker.readText())
    }
}
