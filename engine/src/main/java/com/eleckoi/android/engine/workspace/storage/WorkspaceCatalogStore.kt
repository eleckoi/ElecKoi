package com.eleckoi.android.engine.workspace.storage

import com.eleckoi.android.engine.workspace.model.CreatorWorkspace
import com.eleckoi.android.engine.workspace.model.withNormalizedCharacterRoots
import com.eleckoi.android.foundation.serialization.ElecKoiJson
import com.eleckoi.android.foundation.serialization.ElecKoiPrettyJson
import com.eleckoi.android.foundation.storage.ElecKoiDataException
import java.io.File
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

/**
 * Non-thread-safe manifest/catalog store. The repository owns the transaction lock.
 */
internal class WorkspaceCatalogStore(
    private val paths: WorkspacePathGuard,
    private val atomicFiles: AtomicWorkspaceFileStore,
    private val persistCatalog: (File, String) -> Unit = atomicFiles::writeJson,
) {
    private var cachedCatalog: CreatorWorkspaceCatalog? = null

    fun catalog(): CreatorWorkspaceCatalog {
        return cachedCatalog ?: loadCatalog().also { cachedCatalog = it }
    }

    fun find(workspaceId: String): CreatorWorkspace? {
        if (workspaceId.isBlank()) return null
        return catalog().workspaces.firstOrNull { it.id == workspaceId }
    }

    fun requireWorkspace(workspaceId: String): CreatorWorkspace {
        val workspace = find(workspaceId) ?: error("创作工作区不存在")
        require(paths.isSafeWorkspaceDirectory(workspace)) { "创作工作区目录无效" }
        paths.ensureEmptyProjectDirectory(workspace)
        return workspace
    }

    fun invalidate() {
        cachedCatalog = null
    }

    fun commitWorkspace(workspace: CreatorWorkspace) {
        atomicFiles.writeJson(
            File(paths.workspaceDirectory(workspace), WorkspacePathGuard.ManifestFileName),
            ElecKoiPrettyJson.encodeToString(workspace.withoutEmbeddedRuntimeData()),
        )
        val current = catalog()
        commitCatalog(
            current.copy(
                workspaces = current.workspaces.map { existing ->
                    if (existing.id == workspace.id) workspace else existing
                },
            ),
        )
    }

    fun commitCatalog(next: CreatorWorkspaceCatalog) {
        paths.root.mkdirs()
        atomicFiles.writeJson(
            paths.catalogFile,
            ElecKoiPrettyJson.encodeToString(next.withoutEmbeddedRuntimeData()),
        )
        cachedCatalog = next
    }

    private fun loadCatalog(): CreatorWorkspaceCatalog {
        val decoded = runCatching {
            if (!paths.catalogFile.isFile) null
            else ElecKoiJson.decodeFromString<CreatorWorkspaceCatalog>(
                paths.catalogFile.readText(Charsets.UTF_8),
            )
        }.getOrNull()
        // Per-workspace manifests are the source of truth. This recovers a write that reached
        // manifest.json but was interrupted before catalog.json was replaced.
        val manifestsById = paths.workspaceDirectoriesForDiscovery()
            .asSequence()
            .mapNotNull { directory ->
                runCatching {
                    val workspace = ElecKoiJson.decodeFromString<CreatorWorkspace>(
                        File(directory, WorkspacePathGuard.ManifestFileName).readText(Charsets.UTF_8),
                    )
                    workspace.withNormalizedCharacterRoots().takeIf {
                        paths.isSafeStorageId(it.id) &&
                            paths.isSafeWorkspaceDirectory(it) &&
                            paths.workspaceDirectory(it).canonicalFile == directory.canonicalFile
                    }
                }.getOrNull()
            }
            .associateBy(CreatorWorkspace::id)
        val fromCatalog = decoded?.workspaces.orEmpty().mapNotNull { indexed ->
            manifestsById[indexed.id]
                ?: indexed.takeIf {
                    paths.isSafeStorageId(it.id) && paths.isSafeWorkspaceDirectory(it)
                }?.withNormalizedCharacterRoots()
        }
        val knownIds = fromCatalog.mapTo(mutableSetOf(), CreatorWorkspace::id)
        val recovered = manifestsById.values.filter { it.id !in knownIds }
        val loaded = CreatorWorkspaceCatalog(
            workspaces = (fromCatalog + recovered).distinctBy(CreatorWorkspace::id),
        )
        val persistedLoaded = loaded.withoutEmbeddedRuntimeData()
        val persistedDecoded = decoded?.withoutEmbeddedRuntimeData()
        if (persistedDecoded?.workspaces != persistedLoaded.workspaces) {
            try {
                persistCatalog(
                    paths.catalogFile,
                    ElecKoiPrettyJson.encodeToString(persistedLoaded),
                )
            } catch (error: Exception) {
                throw ElecKoiDataException(
                    "工作区目录恢复后无法写回索引：${paths.catalogFile.absolutePath}",
                    error,
                )
            }
        }
        return loaded
    }

    private fun CreatorWorkspaceCatalog.withoutEmbeddedRuntimeData(): CreatorWorkspaceCatalog = copy(
        workspaces = workspaces.map { it.withoutEmbeddedRuntimeData() },
    )

    private fun CreatorWorkspace.withoutEmbeddedRuntimeData(): CreatorWorkspace = copy(
        conversations = conversations.map { conversation ->
            conversation.copy(timeline = emptyList())
        },
    )
}

@Serializable
internal data class CreatorWorkspaceCatalog(
    val schemaVersion: Int = 1,
    val workspaces: List<CreatorWorkspace> = emptyList(),
)
