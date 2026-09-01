package com.eleckoi.android.feature.studio.ui.assistant.workspace

import com.eleckoi.android.feature.studio.api.CreatorAssistantService
import com.eleckoi.android.engine.workspace.model.CreatorWorkspace
import com.eleckoi.android.engine.workspace.model.CreatorWorkspaceFile
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import com.eleckoi.android.feature.studio.ui.assistant.session.creationAssistantMessage
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Coordinates file-editor I/O while the ViewModel remains the sole UI-state owner.
 */
internal class CreationFileEditingController(
    private val scope: CoroutineScope,
    private val creatorService: CreatorAssistantService,
    private val state: () -> AiCreationAssistantUiState,
    private val updateState: ((AiCreationAssistantUiState) -> AiCreationAssistantUiState) -> Unit,
) {
    fun open(path: String) {
        val snapshot = state()
        val workspace = snapshot.workspace ?: return
        if (snapshot.isRunning) return
        scope.launch {
            runCatching { creatorService.readCreatorWorkspaceText(workspace.id, path) }
                .onSuccess { content ->
                    updateState {
                        it.copy(
                            selectedFilePath = path,
                            fileDraft = content,
                            fileDraftDirty = false,
                            errorMessage = "",
                        )
                    }
                }
                .onFailure { error ->
                    updateState {
                        it.copy(errorMessage = error.creationAssistantMessage("读取文件失败"))
                    }
                }
        }
    }

    fun close() {
        updateState {
            it.copy(selectedFilePath = null, fileDraft = "", fileDraftDirty = false)
        }
    }

    fun changeDraft(value: String) {
        updateState { it.copy(fileDraft = value, fileDraftDirty = true) }
    }

    fun save() {
        val snapshot = state()
        val workspace = snapshot.workspace ?: return
        val path = snapshot.selectedFilePath ?: return
        if (!snapshot.fileDraftDirty) return
        scope.launch {
            runCatching {
                creatorService.writeCreatorWorkspaceText(workspace.id, path, snapshot.fileDraft)
                refreshWorkspaceFiles(workspace.id)
            }.onSuccess {
                updateState {
                    it.copy(
                        fileDraftDirty = false,
                        // A later manual write must not be silently discarded by an older AI undo.
                        undoCheckpoint = null,
                        notice = "已保存 $path",
                    )
                }
            }.onFailure { error ->
                updateState {
                    it.copy(errorMessage = error.creationAssistantMessage("保存文件失败"))
                }
            }
        }
    }

    fun undoLastAiChanges() {
        val snapshot = state()
        val workspace = snapshot.workspace ?: return
        val checkpoint = snapshot.undoCheckpoint ?: return
        when {
            snapshot.isRunning -> {
                updateState { it.copy(errorMessage = "请先停止当前创作任务，再撤销文件修改") }
                return
            }
            snapshot.isPublishing || snapshot.isRestoringCheckpoint -> return
            snapshot.fileDraftDirty -> {
                updateState { it.copy(errorMessage = "请先保存或放弃当前文件编辑，再撤销 AI 修改") }
                return
            }
            checkpoint.workspaceId != workspace.id -> return
        }

        scope.launch {
            updateState {
                it.copy(isRestoringCheckpoint = true, notice = "", errorMessage = "")
            }
            runCatching {
                val restored = creatorService.restoreCreatorWorkspaceCheckpoint(
                    workspaceId = workspace.id,
                    checkpointId = checkpoint.id,
                )
                val files = creatorService.listCreatorWorkspaceFiles(workspace.id)
                restored to files
            }.onSuccess { (restored, files) ->
                updateState { current ->
                    if (current.workspace?.id != workspace.id) {
                        current
                    } else {
                        current.copy(
                            workspace = restored,
                            files = files,
                            previewEntryFile = detectFrontendEntry(files),
                            selectedFilePath = null,
                            fileDraft = "",
                            fileDraftDirty = false,
                            isRestoringCheckpoint = false,
                            undoCheckpoint = null,
                            reloadRevision = current.reloadRevision + 1,
                            notice = "已撤销本轮 AI 文件修改",
                        )
                    }
                }
            }.onFailure { error ->
                updateState { current ->
                    if (current.workspace?.id == workspace.id) {
                        current.copy(
                            isRestoringCheckpoint = false,
                            errorMessage = error.creationAssistantMessage("撤销 AI 修改失败"),
                        )
                    } else {
                        current
                    }
                }
            }
        }
    }

    suspend fun refreshWorkspaceFiles(workspaceId: String) {
        val files = creatorService.listCreatorWorkspaceFiles(workspaceId)
        if (state().workspace?.id != workspaceId) return
        updateState {
            it.copy(
                files = files,
                previewEntryFile = detectFrontendEntry(files),
                reloadRevision = it.reloadRevision + 1,
            )
        }
    }

    suspend fun loadWorkspaceDetails(workspace: CreatorWorkspace): CreationWorkspaceDetails {
        val files = creatorService.listCreatorWorkspaceFiles(workspace.id)
        return CreationWorkspaceDetails(
            files = files,
            previewEntryFile = detectFrontendEntry(files),
            projectDirectory = creatorService.creatorWorkspaceProjectDirectory(workspace.id),
        )
    }
}

internal data class CreationWorkspaceDetails(
    val files: List<CreatorWorkspaceFile>,
    val previewEntryFile: String?,
    val projectDirectory: File?,
)

internal fun detectFrontendEntry(files: List<CreatorWorkspaceFile>): String? {
    return files
        .map(CreatorWorkspaceFile::path)
        .filter { it.substringAfterLast('/').equals("index.html", ignoreCase = true) }
        .minByOrNull { path -> path.count { it == '/' } }
}
