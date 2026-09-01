package com.eleckoi.android.engine.immersive.project

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import com.eleckoi.android.engine.immersive.model.FrontendProject
import com.eleckoi.android.engine.immersive.model.FrontendWorkspace
import java.io.File
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

class FrontendProjectRepository(
    private val context: Context,
) {
    private val root = File(context.filesDir, "author_frontends")
    private val projectsRoot = File(root, "projects")
    private val catalogFile = File(root, "catalog.json")
    private val lock = Any()
    private val catalog = MutableStateFlow(loadCatalog())

    fun workspaceFlow(characterId: String): Flow<FrontendWorkspace> = catalog.map { state ->
        val projects = state.projects.filter { it.characterId == characterId }
        FrontendWorkspace(
            characterId = characterId,
            projects = projects,
            selectedProjectId = state.selectedProjectIds[characterId]
                ?.takeIf { id -> projects.any { it.id == id } },
            messageRendererEnabled = state.messageRendererEnabledByCharacter[characterId] ?: true,
        )
    }

    suspend fun importProject(characterId: String, uri: Uri): FrontendProject = withContext(Dispatchers.IO) {
        require(characterId.isNotBlank()) { "没有可关联的角色" }
        val originalName = displayName(uri).ifBlank { "frontend.html" }
        val id = UUID.randomUUID().toString()
        val staging = File(root, ".staging/$id")
        val source = File(staging, "source")
        val unpacked = File(staging, "project")
        val destination = File(projectsRoot, id)
        try {
            staging.mkdirs()
            context.contentResolver.openInputStream(uri)?.use { input ->
                source.outputStream().buffered().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var copied = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read <= 0) break
                        copied += read
                        require(copied <= FrontendProjectImporter.MaxExpandedBytes) {
                            "导入文件不能超过 ${FrontendProjectImporter.MaxExpandedBytes / Megabyte} MB"
                        }
                        output.write(buffer, 0, read)
                    }
                }
            } ?: error("无法读取所选文件")
            val imported = FrontendProjectImporter.import(source, originalName, unpacked)
            destination.parentFile?.mkdirs()
            require(unpacked.renameTo(destination)) { "无法保存前端项目" }
            val project = FrontendProject(
                id = id,
                characterId = characterId,
                name = originalName.substringBeforeLast('.').ifBlank { "沉浸前端" },
                entryFile = imported.entryFile,
                files = imported.files,
                importedAt = Instant.now().toString(),
            )
            synchronized(lock) {
                commit(
                    catalog.value.copy(
                        projects = catalog.value.projects + project,
                        selectedProjectIds = catalog.value.selectedProjectIds + (characterId to id),
                    ),
                )
            }
            project
        } catch (error: Throwable) {
            destination.deleteRecursively()
            throw error
        } finally {
            staging.deleteRecursively()
        }
    }

    suspend fun publishProject(
        characterId: String,
        sourceDirectory: File,
        name: String,
        entryFile: String = "index.html",
        select: Boolean = true,
    ): FrontendProject = withContext(Dispatchers.IO) {
        require(characterId.isNotBlank()) { "没有可关联的角色" }
        val id = UUID.randomUUID().toString()
        val staging = File(root, ".staging/$id/project")
        val destination = File(projectsRoot, id)
        try {
            val imported = FrontendProjectImporter.importDirectory(
                source = sourceDirectory,
                destination = staging,
                requestedEntryFile = entryFile,
            )
            destination.parentFile?.mkdirs()
            require(staging.renameTo(destination)) { "无法保存前端项目" }
            val project = FrontendProject(
                id = id,
                characterId = characterId,
                name = name.trim().take(80).ifBlank { "AI 创作前端" },
                entryFile = imported.entryFile,
                files = imported.files,
                importedAt = Instant.now().toString(),
            )
            synchronized(lock) {
                val selected = if (select) {
                    catalog.value.selectedProjectIds + (characterId to id)
                } else {
                    catalog.value.selectedProjectIds
                }
                commit(catalog.value.copy(projects = catalog.value.projects + project, selectedProjectIds = selected))
            }
            project
        } catch (error: Throwable) {
            destination.deleteRecursively()
            throw error
        } finally {
            File(root, ".staging/$id").deleteRecursively()
        }
    }

    suspend fun selectProject(characterId: String, projectId: String?) = withContext(Dispatchers.IO) {
        synchronized(lock) {
            if (projectId != null) {
                require(catalog.value.projects.any { it.id == projectId && it.characterId == characterId }) {
                    "前端项目不存在"
                }
            }
            commit(
                catalog.value.copy(
                    selectedProjectIds = if (projectId == null) {
                        catalog.value.selectedProjectIds - characterId
                    } else {
                        catalog.value.selectedProjectIds + (characterId to projectId)
                    },
                ),
            )
        }
    }

    suspend fun setMessageRendererEnabled(characterId: String, enabled: Boolean) = withContext(Dispatchers.IO) {
        require(characterId.isNotBlank()) { "没有可关联的角色" }
        synchronized(lock) {
            commit(
                catalog.value.copy(
                    messageRendererEnabledByCharacter =
                        catalog.value.messageRendererEnabledByCharacter + (characterId to enabled),
                ),
            )
        }
    }

    suspend fun deleteProject(characterId: String, projectId: String) = withContext(Dispatchers.IO) {
        synchronized(lock) {
            val project = catalog.value.projects.firstOrNull {
                it.id == projectId && it.characterId == characterId
            } ?: return@synchronized
            File(projectsRoot, project.id).deleteRecursively()
            val selections = if (catalog.value.selectedProjectIds[characterId] == projectId) {
                catalog.value.selectedProjectIds - characterId
            } else {
                catalog.value.selectedProjectIds
            }
            commit(
                catalog.value.copy(
                    projects = catalog.value.projects - project,
                    selectedProjectIds = selections,
                ),
            )
        }
    }

    fun projectDirectory(projectId: String): File? {
        val exists = catalog.value.projects.any { it.id == projectId }
        return File(projectsRoot, projectId).takeIf { exists && it.isDirectory }
    }

    fun deleteForCharacters(characterIds: List<String>) {
        synchronized(lock) {
            val removing = catalog.value.projects.filter { it.characterId in characterIds }
            removing.forEach { File(projectsRoot, it.id).deleteRecursively() }
            commit(
                catalog.value.copy(
                    projects = catalog.value.projects - removing.toSet(),
                    selectedProjectIds = catalog.value.selectedProjectIds - characterIds.toSet(),
                    messageRendererEnabledByCharacter =
                        catalog.value.messageRendererEnabledByCharacter - characterIds.toSet(),
                ),
            )
        }
    }

    fun deleteExceptCharacters(characterIds: List<String>) {
        val removingCharacterIds = buildSet {
            addAll(catalog.value.projects.map(FrontendProject::characterId))
            addAll(catalog.value.selectedProjectIds.keys)
            addAll(catalog.value.messageRendererEnabledByCharacter.keys)
        }
            .filterNot { it in characterIds }
        if (removingCharacterIds.isNotEmpty()) deleteForCharacters(removingCharacterIds)
    }

    private fun displayName(uri: Uri): String {
        return context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0).orEmpty() else ""
            }.orEmpty()
    }

    private fun loadCatalog(): FrontendCatalog {
        return runCatching {
            if (!catalogFile.isFile) FrontendCatalog()
            else ElecKoiJson.decodeFromString<FrontendCatalog>(catalogFile.readText())
        }.getOrDefault(FrontendCatalog())
    }

    private fun commit(next: FrontendCatalog) {
        root.mkdirs()
        val temporary = File(root, "catalog.json.tmp")
        temporary.writeText(ElecKoiJson.encodeToString(next))
        if (catalogFile.exists()) catalogFile.delete()
        require(temporary.renameTo(catalogFile)) { "无法保存前端项目索引" }
        catalog.value = next
    }

    private companion object {
        const val Megabyte = 1024L * 1024L
    }
}

@Serializable
private data class FrontendCatalog(
    val projects: List<FrontendProject> = emptyList(),
    val selectedProjectIds: Map<String, String> = emptyMap(),
    val messageRendererEnabledByCharacter: Map<String, Boolean> = emptyMap(),
)
