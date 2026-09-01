package com.eleckoi.android.feature.studio.ui.assistant.workspace

import com.eleckoi.android.feature.studio.api.CreatorAssistantService
import com.eleckoi.android.engine.workspace.model.CreatorConversation
import com.eleckoi.android.engine.workspace.model.CreatorWorkspace
import com.eleckoi.android.engine.workspace.model.CreatorWorkspaceFile
import com.eleckoi.android.feature.studio.ui.assistant.CreationModelChoice
import com.eleckoi.android.feature.studio.ui.assistant.timeline.toCreationModelChoices
import java.io.File

/**
 * Loads a coherent creator workspace selection from persisted preferences and
 * repositories. It returns data only; the ViewModel reduces it into UI state.
 */
internal class CreationWorkspaceUseCase(
    private val creatorService: CreatorAssistantService,
    private val files: CreationFileEditingController,
) {
    suspend fun load(previousWorkspaceId: String?): CreationWorkspaceLoadResult {
        val workspaces = creatorService.listCreatorWorkspaces().map { workspace ->
            if (workspace.conversations.isEmpty()) {
                creatorService.ensureCreatorConversation(workspace.id)
            } else {
                workspace
            }
        }
        val validIds = workspaces.mapTo(mutableSetOf(), CreatorWorkspace::id)
        val pinnedIds = creatorService.pinnedCreatorWorkspaceIds().filter { it in validIds }
        val expansionOverrides = creatorService.creatorWorkspaceExpansionOverrides()
            .filterKeys { it in validIds }
        val lastId = creatorService.lastCreatorWorkspaceId()
        val workspace = workspaces.firstOrNull { it.id == previousWorkspaceId }
            ?: workspaces.firstOrNull { it.id == lastId }
            ?: workspaces.firstOrNull()
        val conversation = workspace?.conversations
            ?.firstOrNull { it.id == workspace.activeConversationId }
            ?: workspace?.conversations?.firstOrNull()
        val details = workspace?.let { files.loadWorkspaceDetails(it) }
        val model = creatorService.defaultCreatorModelConfig()
        val modelChoices = model.toCreationModelChoices()
        val selectedModelId = model.model.trim()
        val modelLabel = modelChoices.firstOrNull { it.id == selectedModelId }?.label
            ?: selectedModelId.ifBlank { "未配置模型" }
        return CreationWorkspaceLoadResult(
            workspaces = workspaces,
            pinnedWorkspaceIds = pinnedIds,
            workspaceExpansionOverrides = expansionOverrides,
            workspace = workspace,
            conversation = conversation,
            files = details?.files.orEmpty(),
            previewEntryFile = details?.previewEntryFile,
            projectDirectory = details?.projectDirectory,
            modelLabel = modelLabel,
            selectedModelConfigId = model.id,
            selectedModelId = selectedModelId,
            modelChoices = modelChoices,
        )
    }
}

internal data class CreationWorkspaceLoadResult(
    val workspaces: List<CreatorWorkspace>,
    val pinnedWorkspaceIds: List<String>,
    val workspaceExpansionOverrides: Map<String, Boolean>,
    val workspace: CreatorWorkspace?,
    val conversation: CreatorConversation?,
    val files: List<CreatorWorkspaceFile>,
    val previewEntryFile: String?,
    val projectDirectory: File?,
    val modelLabel: String,
    val selectedModelConfigId: String,
    val selectedModelId: String,
    val modelChoices: List<CreationModelChoice>,
)
