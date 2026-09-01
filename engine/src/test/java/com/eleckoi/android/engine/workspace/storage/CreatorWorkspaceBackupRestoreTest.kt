package com.eleckoi.android.engine.workspace.storage

import java.io.File
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class CreatorWorkspaceBackupRestoreTest {
    @get:Rule
    val temporaryFolder = TemporaryFolder()

    @Test
    fun `restore recreates a missing project directory only when manifest is empty`() = runBlocking {
        val root = temporaryFolder.newFolder("empty-project-backup")
        val created = repository(root).create("空项目")
        val project = File(root, "workspaces/${created.id}/project")
        assertTrue(project.delete())

        val restoredRepository = repository(root)
        val restored = restoredRepository.reloadAfterBackupRestore()

        assertEquals(listOf(created.id), restored.map { it.id })
        assertTrue(project.isDirectory)
        assertTrue(restoredRepository.listFiles(created.id).isEmpty())
    }

    @Test
    fun `restore fails when manifest names files but project directory is missing`() {
        val root = temporaryFolder.newFolder("missing-project-files")
        val created = runBlocking {
            repository(root).create("有文件的项目").also { workspace ->
                repository(root).writeText(workspace.id, "index.html", "hello")
            }
        }
        File(root, "workspaces/${created.id}/project").deleteRecursively()

        val error = assertThrows(IllegalArgumentException::class.java) {
            runBlocking { repository(root).reloadAfterBackupRestore() }
        }

        assertTrue(error.message.orEmpty().contains("仍记录了项目文件"))
    }

    private fun repository(root: File) = CreatorWorkspaceRepository(
        root = root,
        now = Instant::now,
        newId = { UUID.randomUUID().toString() },
    )
}
