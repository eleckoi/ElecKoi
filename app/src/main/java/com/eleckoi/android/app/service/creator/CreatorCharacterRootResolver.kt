package com.eleckoi.android.app.service

import com.eleckoi.android.engine.workspace.model.CreatorWorkspaceCharacterRoot
import com.eleckoi.android.engine.workspace.storage.CreatorWorkspaceRepository
import com.eleckoi.android.feature.characters.data.CharacterRepository
import com.eleckoi.android.feature.characters.model.CharacterSlot

internal class CreatorCharacterRootResolver(
    private val creatorWorkspaces: CreatorWorkspaceRepository,
    private val characters: CharacterRepository,
) {
    suspend fun requireRoot(
        workspaceId: String,
        requestedRootId: String,
    ): Pair<CreatorWorkspaceCharacterRoot, CharacterSlot> {
        val workspace = creatorWorkspaces.get(workspaceId) ?: error("创作工作区不存在")
        val rootId = requestedRootId.trim().ifBlank { workspace.primaryCharacterRootId.orEmpty() }
        val root = workspace.characterRoots.firstOrNull { it.id == rootId }
            ?: error("创作工作区没有可用的目标角色")
        val character = characters.characterById(root.characterId) ?: error("挂载的角色已经不存在")
        return root to character
    }
}
