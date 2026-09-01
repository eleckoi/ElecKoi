package com.eleckoi.android.feature.studio.ui.assistant.workspace

import com.eleckoi.android.feature.studio.api.CreatorAssistantService
import com.eleckoi.android.engine.immersive.api.FrontendProjectService
import com.eleckoi.android.feature.studio.ui.assistant.AiCreationAssistantUiState
import com.eleckoi.android.feature.studio.ui.assistant.session.creationAssistantMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

internal class CreationPublicationController(
    private val scope: CoroutineScope,
    private val creatorService: CreatorAssistantService,
    private val frontendProjectService: FrontendProjectService,
    private val state: () -> AiCreationAssistantUiState,
    private val updateState: ((AiCreationAssistantUiState) -> AiCreationAssistantUiState) -> Unit,
) {
    fun publish() {
        val snapshot = state()
        val workspace = snapshot.workspace ?: return
        val previewEntryFile = snapshot.previewEntryFile
        if (previewEntryFile == null) {
            updateState { it.copy(errorMessage = "当前工作区还没有可发布的 index.html 前端项目") }
            return
        }
        if (snapshot.characterId.isBlank()) {
            updateState { it.copy(errorMessage = "当前项目尚未选择发布目标；可以先使用网页预览") }
            return
        }
        if (snapshot.isPublishing || snapshot.isRunning) return
        val directory = creatorService.creatorWorkspaceProjectDirectory(workspace.id)
        if (directory == null) {
            updateState { it.copy(errorMessage = "工作区目录不存在") }
            return
        }
        scope.launch {
            updateState { it.copy(isPublishing = true, errorMessage = "", notice = "") }
            runCatching {
                creatorService.checkpointCreatorWorkspace(workspace.id, "发布版本")
                frontendProjectService.publishFrontendProject(
                    characterId = snapshot.characterId,
                    sourceDirectory = directory,
                    name = workspace.name,
                    entryFile = previewEntryFile,
                    select = true,
                )
            }.onSuccess {
                updateState { it.copy(isPublishing = false, notice = "已发布并启用沉浸前端") }
            }.onFailure { error ->
                updateState {
                    it.copy(
                        isPublishing = false,
                        errorMessage = error.creationAssistantMessage("发布失败"),
                    )
                }
            }
        }
    }
}
