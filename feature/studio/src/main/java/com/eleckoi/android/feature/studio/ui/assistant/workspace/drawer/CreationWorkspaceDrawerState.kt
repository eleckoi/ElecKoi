package com.eleckoi.android.feature.studio.ui.assistant.workspace.drawer

import com.eleckoi.android.engine.workspace.model.CreatorConversation
import com.eleckoi.android.engine.workspace.model.CreatorWorkspace

internal data class CreationWorkspaceDrawerSections(
    val pinned: List<CreatorWorkspace>,
    val projects: List<CreatorWorkspace>,
)

internal fun creatorWorkspaceDrawerSections(
    workspaces: List<CreatorWorkspace>,
    pinnedWorkspaceIds: List<String>,
    query: String,
): CreationWorkspaceDrawerSections {
    val normalizedQuery = query.trim()
    val matching = if (normalizedQuery.isBlank()) {
        workspaces
    } else {
        workspaces.filter { workspace ->
            workspace.name.contains(normalizedQuery, ignoreCase = true) ||
                workspace.conversations.any { conversation ->
                    conversation.title.contains(normalizedQuery, ignoreCase = true)
                }
        }
    }
    val pinnedIds = pinnedWorkspaceIds.toSet()
    return CreationWorkspaceDrawerSections(
        pinned = matching.filter { it.id in pinnedIds },
        projects = matching.filterNot { it.id in pinnedIds },
    )
}

internal fun CreatorWorkspace.drawerConversations(query: String): List<CreatorConversation> =
    if (query.isBlank() || name.contains(query, ignoreCase = true)) {
        conversations
    } else {
        conversations.filter { it.title.contains(query, ignoreCase = true) }
    }

internal fun isCreatorWorkspaceExpanded(
    workspaceId: String,
    activeWorkspaceId: String?,
    overrides: Map<String, Boolean>,
): Boolean = overrides[workspaceId] ?: (workspaceId == activeWorkspaceId)

internal fun List<String>.toggleDrawerEntry(value: String): List<String> =
    if (value in this) this - value else this + value

internal fun String.parseConversationTarget(): Pair<String, String>? {
    val separator = indexOf(':')
    if (separator <= 0 || separator >= lastIndex) return null
    return substring(0, separator) to substring(separator + 1)
}

internal fun List<CreatorWorkspace>.findConversation(
    workspaceId: String,
    conversationId: String,
): CreatorConversation? = firstOrNull { it.id == workspaceId }
    ?.conversations
    ?.firstOrNull { it.id == conversationId }
