package com.eleckoi.android.feature.studio.ui.assistant.session

import com.eleckoi.android.engine.agent.api.AgentContextActivation
import com.eleckoi.android.engine.agent.api.AgentContextAnchor
import com.eleckoi.android.engine.agent.api.AgentContextInjection
import com.eleckoi.android.engine.agent.api.AgentContextRole
import com.eleckoi.android.feature.studio.api.CreatorAssistantService
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Builds the bounded creator-root context injected into the first model request. */
internal class CreationRootsContextBuilder(
    private val creatorService: CreatorAssistantService,
) {
    suspend fun build(workspaceId: String): AgentContextInjection {
        val workspace = creatorService.creatorWorkspace(workspaceId)
            ?: error("创作工作区不存在")
        val primary = workspace.characterRoots.firstOrNull { it.id == workspace.primaryCharacterRootId }
        val injectedRoots = buildList {
            primary?.let(::add)
            workspace.characterRoots
                .asSequence()
                .filterNot { it.id == primary?.id }
                .take(MaxInjectedReferenceRoots)
                .forEach(::add)
        }
        val roots = injectedRoots.map { root ->
            val character = creatorService.creatorCharacter(root.characterId)
            buildJsonObject {
                put("rootId", root.id)
                put("characterId", root.characterId)
                put("name", character?.name ?: root.alias)
                put("primary", root.id == workspace.primaryCharacterRootId)
                put("access", root.access.name)
                put("available", character != null)
            }
        }
        val payload = buildJsonObject {
            put("workspaceId", workspace.id)
            put("primaryRootId", workspace.primaryCharacterRootId.orEmpty())
            put("rootCount", workspace.characterRoots.size)
            put("rootsTruncated", injectedRoots.size < workspace.characterRoots.size)
            put("roots", buildJsonArray { roots.forEach(::add) })
        }
        return AgentContextInjection(
            id = "eleckoi.creator.roots",
            anchor = AgentContextAnchor.BeforeToolContext,
            role = AgentContextRole.System,
            activation = AgentContextActivation.FirstModelRequest,
            order = 10,
            content = """
                当前 ElecKoi 创作根如下：$payload
                主角色是默认写入目标，参考角色可按 rootId 查看；只有 access=ReadWrite 的根可提交修改。
                若 rootsTruncated=true，必须通过 workspace.get_roots 分页查看其余角色根，不能当作不存在。
                需要角色或设定库能力时，先列出/描述对应 toolset，再调用具体 capability。不要猜测角色配置。
            """.trimIndent(),
        )
    }

    private companion object {
        const val MaxInjectedReferenceRoots = 12
    }
}
