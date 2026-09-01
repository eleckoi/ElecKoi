package com.eleckoi.android.engine.workspace.storage.conversation

import com.eleckoi.android.engine.workspace.model.CreatorConversation
import com.eleckoi.android.engine.workspace.model.CreatorConversationTimelineItem
import com.eleckoi.android.engine.workspace.model.CreatorWorkspace
import com.eleckoi.android.engine.workspace.storage.WorkspaceCatalogStore
import com.eleckoi.android.engine.workspace.storage.WorkspacePathGuard
import java.time.Instant

/**
 * Non-thread-safe conversation metadata store. The repository owns the transaction lock and I/O
 * dispatcher for every operation.
 */
internal class WorkspaceConversationStore(
    private val catalog: WorkspaceCatalogStore,
    private val paths: WorkspacePathGuard,
    private val now: () -> Instant,
    private val newId: () -> String,
    private val schemaVersion: Int,
) {
    fun ensure(workspaceId: String, defaultTitle: String): CreatorWorkspace {
        val workspace = catalog.requireWorkspace(workspaceId)
        if (workspace.conversations.isNotEmpty()) return workspace
        val timestamp = now().toString()
        val conversation = CreatorConversation(
            id = createUniqueId(workspace),
            title = defaultTitle,
            createdAt = timestamp,
            updatedAt = timestamp,
        )
        return commit(
            workspace.copy(
                schemaVersion = schemaVersion,
                conversations = listOf(conversation),
                activeConversationId = conversation.id,
            ),
        )
    }

    fun create(
        workspaceId: String,
        title: String,
    ): CreatorWorkspace {
        val workspace = catalog.requireWorkspace(workspaceId)
        val timestamp = now().toString()
        val conversation = CreatorConversation(
            id = createUniqueId(workspace),
            title = paths.validateName(title),
            createdAt = timestamp,
            updatedAt = timestamp,
        )
        return commit(
            workspace.copy(
                schemaVersion = schemaVersion,
                updatedAt = timestamp,
                conversations = listOf(conversation) + workspace.conversations,
                activeConversationId = conversation.id,
            ),
        )
    }

    fun select(
        workspaceId: String,
        conversationId: String,
    ): CreatorWorkspace {
        val workspace = catalog.requireWorkspace(workspaceId)
        require(workspace.conversations.any { it.id == conversationId }) { "创作对话不存在" }
        if (workspace.activeConversationId == conversationId) return workspace
        return commit(
            workspace.copy(
                schemaVersion = schemaVersion,
                activeConversationId = conversationId,
            ),
        )
    }

    fun rename(
        workspaceId: String,
        conversationId: String,
        title: String,
    ): CreatorWorkspace {
        val workspace = catalog.requireWorkspace(workspaceId)
        require(workspace.conversations.any { it.id == conversationId }) { "创作对话不存在" }
        val timestamp = now().toString()
        return commit(
            workspace.copy(
                schemaVersion = schemaVersion,
                updatedAt = timestamp,
                conversations = workspace.conversations.map { conversation ->
                    if (conversation.id == conversationId) {
                        conversation.copy(title = paths.validateName(title), updatedAt = timestamp)
                    } else {
                        conversation
                    }
                },
            ),
        )
    }

    fun saveTimeline(
        workspaceId: String,
        conversationId: String,
        timeline: List<CreatorConversationTimelineItem>,
    ): CreatorWorkspace {
        val workspace = catalog.requireWorkspace(workspaceId)
        require(workspace.conversations.any { it.id == conversationId }) { "创作对话不存在" }
        val timestamp = now().toString()
        return commit(
            workspace.copy(
                schemaVersion = schemaVersion,
                updatedAt = timestamp,
                conversations = workspace.conversations.map { conversation ->
                    if (conversation.id == conversationId) {
                        conversation.copy(updatedAt = timestamp, timeline = timeline)
                    } else {
                        conversation
                    }
                },
            ),
        )
    }

    fun delete(
        workspaceId: String,
        conversationId: String,
    ): CreatorWorkspace {
        val workspace = catalog.requireWorkspace(workspaceId)
        require(workspace.conversations.any { it.id == conversationId }) { "创作对话不存在" }
        val remaining = workspace.conversations.filterNot { it.id == conversationId }
        return commit(
            workspace.copy(
                schemaVersion = schemaVersion,
                updatedAt = now().toString(),
                conversations = remaining,
                activeConversationId = when {
                    workspace.activeConversationId != conversationId -> workspace.activeConversationId
                    else -> remaining.firstOrNull()?.id
                },
            ),
        )
    }

    private fun commit(workspace: CreatorWorkspace): CreatorWorkspace {
        catalog.commitWorkspace(workspace)
        return workspace
    }

    private fun createUniqueId(workspace: CreatorWorkspace): String {
        repeat(10) {
            val candidate = newId().filter { it.isLetterOrDigit() || it == '-' || it == '_' }.take(64)
            if (paths.isSafeStorageId(candidate) && workspace.conversations.none { it.id == candidate }) {
                return candidate
            }
        }
        error("无法生成创作对话编号")
    }
}
