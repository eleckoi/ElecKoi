package com.eleckoi.android.app.service.backup

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class BackupArchiveTreeTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun `empty creator project directories survive backup tree restoration`() {
        val source = temporaryFolder.newFolder("source")
        val workspace = File(source, "creator_workspaces/workspaces/workspace-1")
        File(workspace, "manifest.json").apply {
            parentFile?.mkdirs()
            writeText("{}")
        }
        File(workspace, "project/empty-folder").mkdirs()

        val tree = collectBackupArchiveTree(
            root = source,
            includedRoots = listOf("creator_workspaces/workspaces"),
        )

        assertTrue("files/creator_workspaces/workspaces/workspace-1/project" in tree.directories)
        assertTrue("files/creator_workspaces/workspaces/workspace-1/project/empty-folder" in tree.directories)
        assertEquals(
            listOf("files/creator_workspaces/workspaces/workspace-1/manifest.json"),
            tree.files.map(BackupArchiveFile::entryName),
        )

        val restored = temporaryFolder.newFolder("restored")
        restoreBackupDirectories(restored, tree.directories)
        assertTrue(File(restored, "creator_workspaces/workspaces/workspace-1/project").isDirectory)
        assertTrue(File(restored, "creator_workspaces/workspaces/workspace-1/project/empty-folder").isDirectory)
    }

    @Test
    fun `backup directory restoration rejects traversal`() {
        val root = temporaryFolder.newFolder("safe-root")

        assertThrows(IllegalArgumentException::class.java) {
            restoreBackupDirectories(root, listOf("files/../escape"))
        }
    }
}
