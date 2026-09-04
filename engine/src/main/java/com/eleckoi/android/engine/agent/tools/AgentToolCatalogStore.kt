package com.eleckoi.android.engine.agent.tools

import java.io.File
import kotlinx.serialization.json.JsonObject

/**
 * Persistent tool visibility, keyed by [AgentToolScopes]. Which Harness tools exist is a property of
 * the installed runtime and stays shared; which of them a turn may call belongs to one character.
 */
class AgentToolCatalogStore(private val file: File) {
    private val lock = Any()
    private var state = readAgentToolCatalogState(file)

    fun filterRequest(scopeId: String, request: JsonObject): JsonObject {
        val result = synchronized(lock) {
            val disabled = state.disabledIn(scopeId)
            val knownGroupIds = AgentToolRequestPolicy.builtInGroups()
                .mapTo(hashSetOf(), AgentToolGroupSnapshot::id)
                .apply { addAll(state.observedGroups.map(AgentToolGroupSnapshot::id)) }
            AgentToolRequestPolicy.filter(request) { groupId ->
                state.groupEnabled(scopeId, groupId, disabled, knownGroupIds)
            }
        }
        recordObservedGroups(result.observedGroups)
        return result.request
    }

    fun groups(scopeId: String): List<AgentToolGroupSnapshot> = synchronized(lock) {
        val disabled = state.disabledIn(scopeId)
        val observedById = state.observedGroups.associateBy(AgentToolGroupSnapshot::id)
        val builtInGroups = AgentToolRequestPolicy.builtInGroups()
        val knownGroupIds = builtInGroups
            .mapTo(hashSetOf(), AgentToolGroupSnapshot::id)
            .apply { addAll(observedById.keys) }
        val builtIns = builtInGroups.map { fallback ->
            val observed = observedById[fallback.id]
            fallback.copy(
                members = resolveBuiltInMembers(fallback, observed),
                enabled = state.groupEnabled(scopeId, fallback.id, disabled, knownGroupIds),
            )
        }
        val additional = state.observedGroups
            .filterNot { observed -> builtIns.any { it.id == observed.id } }
            .map { it.copy(enabled = it.id !in disabled) }
        (builtIns + additional)
            .filterNot { it.id in AgentToolRequestPolicy.HiddenGroupIds }
            .sortedWith(
                compareBy<AgentToolGroupSnapshot> { it.source.ordinal }.thenBy { it.name.lowercase() },
            )
    }

    fun setEnabled(scopeId: String, groupId: String, enabled: Boolean) = synchronized(lock) {
        updateState(if (isExplicitOptInGroup(scopeId, groupId)) {
            state.copy(
                scopedEnabledOptInGroups = toggleScopedOptInGroup(
                    scopeId = scopeId,
                    groupId = groupId,
                    enabled = enabled,
                    scoped = state.scopedEnabledOptInGroups,
                ),
            )
        } else {
            state.copy(
                scopedDisabledGroups = toggleScopedToolGroup(
                    scopeId = scopeId,
                    groupId = groupId,
                    enabled = enabled,
                    defaults = state.defaultDisabledGroups,
                    scoped = state.scopedDisabledGroups,
                ),
            )
        })
    }

    fun isEnabled(scopeId: String, groupId: String): Boolean = synchronized(lock) {
        val knownGroupIds = AgentToolRequestPolicy.builtInGroups()
            .mapTo(hashSetOf(), AgentToolGroupSnapshot::id)
            .apply { addAll(state.observedGroups.map(AgentToolGroupSnapshot::id)) }
        state.groupEnabled(scopeId, groupId, state.disabledIn(scopeId), knownGroupIds)
    }

    fun subagentModelConfigId(scopeId: String): String = synchronized(lock) {
        state.scopedSubagentModelConfigIds[AgentToolScopes.normalize(scopeId)].orEmpty()
    }

    fun subagentModel(scopeId: String): String = synchronized(lock) {
        state.scopedSubagentModels[AgentToolScopes.normalize(scopeId)].orEmpty()
    }

    fun setSubagentModelConfigId(scopeId: String, configId: String) = synchronized(lock) {
        val scope = AgentToolScopes.normalize(scopeId)
        val normalized = configId.trim()
        val next = state.scopedSubagentModelConfigIds.toMutableMap().apply {
            if (normalized.isBlank()) remove(scope) else put(scope, normalized)
        }
        updateState(
            state.copy(
                scopedSubagentModelConfigIds = next,
                scopedSubagentModels = if (normalized.isBlank()) {
                    state.scopedSubagentModels - scope
                } else {
                    state.scopedSubagentModels
                },
            ),
        )
    }

    fun setSubagentModel(scopeId: String, configId: String, model: String) = synchronized(lock) {
        val scope = AgentToolScopes.normalize(scopeId)
        val normalizedConfig = configId.trim()
        val normalizedModel = model.trim()
        val nextConfigs = state.scopedSubagentModelConfigIds.toMutableMap().apply {
            if (normalizedConfig.isBlank()) remove(scope) else put(scope, normalizedConfig)
        }
        val nextModels = state.scopedSubagentModels.toMutableMap().apply {
            if (normalizedConfig.isBlank() || normalizedModel.isBlank()) remove(scope)
            else put(scope, normalizedModel)
        }
        updateState(
            state.copy(
                scopedSubagentModelConfigIds = nextConfigs,
                scopedSubagentModels = nextModels,
            ),
        )
    }

    fun toolModelConfigId(scopeId: String, groupId: String): String = synchronized(lock) {
        scopedToolModelConfigId(scopeId, groupId, state.scopedToolModelConfigIds)
    }

    fun setToolModelConfigId(scopeId: String, groupId: String, configId: String) = synchronized(lock) {
        updateState(
            state.copy(
                scopedToolModelConfigIds = selectScopedToolModelConfig(
                    scopeId = scopeId,
                    groupId = groupId,
                    configId = configId,
                    scoped = state.scopedToolModelConfigIds,
                ),
            ),
        )
    }

    /**
     * One shared order drives both the insertion preview and the model-visible context bucket.
     * Keeping it independently persisted allows a later reorder UI without a protocol redesign.
     */
    fun toolContextSnapshot(scopeId: String): AgentToolContextSnapshot = synchronized(lock) {
        buildAgentToolContextSnapshot(
            allGroups = groups(scopeId),
            contextOrder = state.contextOrder,
        )
    }

    fun setToolContextOrder(groupIds: List<String>) = synchronized(lock) {
        updateState(state.copy(contextOrder = groupIds.filter(String::isNotBlank).distinct()))
    }

    fun recordMcpServer(
        serverId: String,
        displayName: String,
        description: String,
        tools: List<AgentToolMember>,
    ) {
        val normalizedId = serverId.trim()
        if (normalizedId.isBlank()) return
        val group = AgentToolGroupSnapshot(
            id = AgentToolRequestPolicy.mcpGroupId(normalizedId),
            name = if (normalizedId == "exa") "联网（Exa）" else displayName.ifBlank { normalizedId },
            description = description.ifBlank {
                if (normalizedId == "exa") "搜索网页并抓取完整页面内容" else "来自 ${displayName.ifBlank { normalizedId }} MCP 服务器"
            },
            source = AgentToolGroupSource.Mcp,
            sourceId = normalizedId,
            members = tools.distinctBy(AgentToolMember::name),
        )
        recordObservedGroups(listOf(group))
    }

    fun forgetMcpServer(serverId: String) = synchronized(lock) {
        val groupId = AgentToolRequestPolicy.mcpGroupId(serverId)
        updateState(
            state.copy(
                defaultDisabledGroups = state.defaultDisabledGroups - groupId,
                scopedDisabledGroups = state.scopedDisabledGroups.mapValues { (_, ids) -> ids - groupId },
                observedGroups = state.observedGroups.filterNot { it.id == groupId },
            ),
        )
    }

    private fun recordObservedGroups(groups: List<AgentToolGroupSnapshot>) {
        if (groups.isEmpty()) return
        synchronized(lock) {
            val newlyObservedIds = newlyObservedCapabilityGroupIds(
                previous = state.observedGroups,
                incoming = groups,
            )
            val next = state.copy(
                // A provider/MCP group that appears for the first time is a new capability, not
                // implicit consent. Add it to every baseline; the user can then enable it in the
                // intended scope.
                defaultDisabledGroups = state.defaultDisabledGroups + newlyObservedIds,
                scopedDisabledGroups = state.scopedDisabledGroups.mapValues { (_, ids) ->
                    ids + newlyObservedIds
                },
                observedGroups = mergeObservedToolGroups(state.observedGroups, groups),
            )
            if (next != state) updateState(next)
        }
    }

    private fun updateState(next: AgentToolCatalogState) {
        writeAgentToolCatalogState(file, next)
        state = next
    }

}
