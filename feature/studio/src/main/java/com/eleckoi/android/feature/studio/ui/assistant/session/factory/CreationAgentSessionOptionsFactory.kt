package com.eleckoi.android.feature.studio.ui.assistant.session

import com.eleckoi.android.engine.agent.api.AgentHistoryItem
import com.eleckoi.android.engine.agent.api.AgentInputImage
import com.eleckoi.android.engine.agent.api.AgentPermissionMode
import com.eleckoi.android.engine.agent.api.AgentPrompt
import com.eleckoi.android.engine.agent.api.AgentSessionOptions
import com.eleckoi.android.engine.agent.api.AgentThreadStart
import com.eleckoi.android.engine.agent.creator.CreatorMetaTools
import com.eleckoi.android.feature.studio.api.CreatorAssistantService
import com.eleckoi.android.feature.studio.authoring.CreationWorkspaceAgentInstructions
import com.eleckoi.android.feature.studio.authoring.CreatorAuthoringContext
import com.eleckoi.android.feature.studio.authoring.CreatorAuthoringToolCatalog
import com.eleckoi.android.feature.chat.model.ChatUserImageAttachment

/** Builds the authoring-specific runtime contract without leaking tool wiring into lifecycle code. */
internal class CreationAgentSessionOptionsFactory(
    private val creatorService: CreatorAssistantService,
    private val permissionModeProvider: () -> AgentPermissionMode,
) {
    fun create(
        workspaceId: String,
        conversationId: String,
        permissionMode: AgentPermissionMode,
        modelConfigId: String,
        model: String,
        regenerating: Boolean,
        runtimeThreadId: String,
        obsoleteRuntimeThreadIds: Set<String>,
        history: List<AgentHistoryItem>,
    ): AgentSessionOptions {
        val authoringContext = CreatorAuthoringContext(
            workspaceId = workspaceId,
            permissionModeProvider = permissionModeProvider,
            service = creatorService,
        )
        return AgentSessionOptions(
            workspaceId = workspaceId,
            conversationId = conversationId,
            modelConfigId = modelConfigId.ifBlank { null },
            model = model.ifBlank { null },
            developerInstructions = CreationWorkspaceAgentInstructions.Value,
            permissionMode = permissionMode,
            // A regenerated reply must not resume the thread that still owns the deleted answer.
            threadStart = creationAgentThreadStart(
                regenerating = regenerating,
                runtimeThreadId = runtimeThreadId,
            ),
            discardThreadIds = if (regenerating) obsoleteRuntimeThreadIds else emptySet(),
            ephemeral = false,
            initialHistoryItems = history,
            captureModelHistory = true,
            dynamicTools = CreatorMetaTools.create(
                context = authoringContext,
                catalog = CreatorAuthoringToolCatalog.create(),
            ),
        )
    }
}

internal fun creationAgentPrompt(
    text: String,
    inputImages: List<ChatUserImageAttachment>,
): AgentPrompt = AgentPrompt(
    text = text,
    images = inputImages.map { image ->
        AgentInputImage(
            localPath = image.localPath,
            mediaType = image.mediaType,
            name = image.displayName,
        )
    },
)

internal fun creationAgentThreadStart(
    regenerating: Boolean,
    runtimeThreadId: String = "",
): AgentThreadStart = when {
    regenerating -> AgentThreadStart.Fresh
    runtimeThreadId.isNotBlank() -> AgentThreadStart.Resume(runtimeThreadId)
    else -> AgentThreadStart.BoundOrNew
}
