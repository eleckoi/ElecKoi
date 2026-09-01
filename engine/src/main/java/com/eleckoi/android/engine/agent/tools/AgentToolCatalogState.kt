package com.eleckoi.android.engine.agent.tools

internal data class AgentToolCatalogState(
    /**
     * Current baseline applied to scopes that do not have an explicit switch set yet.
     */
    val defaultDisabledGroups: Set<String> = AgentToolRequestPolicy.defaultDisabledGroupIds(),
    val scopedDisabledGroups: Map<String, Set<String>> = emptyMap(),
    val scopedEnabledOptInGroups: Map<String, Set<String>> = emptyMap(),
    val scopedSubagentModelConfigIds: Map<String, String> = emptyMap(),
    val scopedSubagentModels: Map<String, String> = emptyMap(),
    val observedGroups: List<AgentToolGroupSnapshot> = emptyList(),
    val contextOrder: List<String> = emptyList(),
) {
    fun disabledIn(scopeId: String): Set<String> =
        disabledToolGroupsIn(scopeId, defaultDisabledGroups, scopedDisabledGroups)

    fun groupEnabled(
        scopeId: String,
        groupId: String,
        disabled: Set<String>,
        knownGroupIds: Set<String>,
    ): Boolean = if (isExplicitOptInGroup(scopeId, groupId)) {
        groupId in enabledOptInGroupsIn(scopeId, scopedEnabledOptInGroups)
    } else {
        toolGroupEnabled(groupId, disabled, knownGroupIds)
    }
}

/** IDs that may be persisted as opt-in; creator is opt-in only for character scopes. */
internal val ExplicitOptInAgentToolGroupIds =
    setOf(
        AgentToolRequestPolicy.BuiltInAutoIllustration,
        AgentToolRequestPolicy.BuiltInCreator,
    )

internal fun isExplicitOptInGroup(scopeId: String, groupId: String): Boolean =
    groupId == AgentToolRequestPolicy.BuiltInAutoIllustration ||
        (groupId == AgentToolRequestPolicy.BuiltInCreator &&
            AgentToolScopes.characterId(scopeId) != null)

/** Any capability without a scope-specific user choice is closed by default. */
internal fun defaultDisabledToolGroups(
    disabled: Set<String>,
    observed: List<AgentToolGroupSnapshot>,
): Set<String> = disabled +
    AgentToolRequestPolicy.defaultDisabledGroupIds() +
    observed.map(AgentToolGroupSnapshot::id)

/** Unknown provider capabilities stay unavailable until catalog discovery and explicit consent. */
internal fun toolGroupEnabled(
    groupId: String,
    disabled: Set<String>,
    knownGroupIds: Set<String>,
): Boolean = groupId in knownGroupIds && groupId !in disabled

/** Built-ins are already known; only a genuinely new provider group needs a new default-off row. */
internal fun newlyObservedCapabilityGroupIds(
    previous: List<AgentToolGroupSnapshot>,
    incoming: List<AgentToolGroupSnapshot>,
): Set<String> {
    val known = AgentToolRequestPolicy.builtInGroups()
        .mapTo(hashSetOf(), AgentToolGroupSnapshot::id)
        .apply { addAll(previous.map(AgentToolGroupSnapshot::id)) }
    return incoming.map(AgentToolGroupSnapshot::id).toSet() - known
}

/**
 * A scope the author has never touched has no stored entry and falls back to the stored baseline
 * rather than to "everything on". Character-scoped creation is handled as an explicit opt-in in
 * [groupEnabled], while the shared scope keeps the creation assistant's default-on baseline.
 */
internal fun disabledToolGroupsIn(
    scopeId: String,
    defaults: Set<String>,
    scoped: Map<String, Set<String>>,
): Set<String> =
    (scoped[AgentToolScopes.normalize(scopeId)] ?: defaults) + AgentToolRequestPolicy.HiddenGroupIds

/** Writes one scope's switch without materializing or disturbing any other scope. */
internal fun toggleScopedToolGroup(
    scopeId: String,
    groupId: String,
    enabled: Boolean,
    defaults: Set<String>,
    scoped: Map<String, Set<String>>,
): Map<String, Set<String>> {
    val scope = AgentToolScopes.normalize(scopeId)
    val disabled = disabledToolGroupsIn(scope, defaults, scoped).toMutableSet()
    if (enabled) disabled.remove(groupId) else disabled.add(groupId)
    return scoped + (scope to disabled)
}

/** Opt-in features are off until this exact scope explicitly enables them. */
internal fun enabledOptInGroupsIn(
    scopeId: String,
    scoped: Map<String, Set<String>>,
): Set<String> = scoped[AgentToolScopes.normalize(scopeId)].orEmpty()

internal fun toggleScopedOptInGroup(
    scopeId: String,
    groupId: String,
    enabled: Boolean,
    scoped: Map<String, Set<String>>,
): Map<String, Set<String>> {
    val scope = AgentToolScopes.normalize(scopeId)
    val enabledGroups = enabledOptInGroupsIn(scope, scoped).toMutableSet()
    if (enabled) enabledGroups.add(groupId) else enabledGroups.remove(groupId)
    return if (enabledGroups.isEmpty()) scoped - scope else scoped + (scope to enabledGroups)
}

/**
 * A non-empty built-in declaration is the product's current protocol and must not be expanded by
 * stale observations. Empty declarations (workspace/workflow/collaboration) are runtime-owned and
 * therefore continue to use the latest Harness observation.
 */
internal fun resolveBuiltInMembers(
    fallback: AgentToolGroupSnapshot,
    observed: AgentToolGroupSnapshot?,
): List<AgentToolMember> = if (fallback.members.isNotEmpty()) {
    fallback.members
} else {
    observed?.members.orEmpty()
}

internal fun mergeObservedToolGroups(
    previous: List<AgentToolGroupSnapshot>,
    incoming: List<AgentToolGroupSnapshot>,
): List<AgentToolGroupSnapshot> {
    val merged = previous.associateBy(AgentToolGroupSnapshot::id).toMutableMap()
    incoming.forEach { current ->
        val older = merged[current.id]
        merged[current.id] = if (current.source == AgentToolGroupSource.BuiltIn) {
            current
        } else {
            current.copy(
                members = (current.members + older?.members.orEmpty())
                    .distinctBy(AgentToolMember::name),
            )
        }
    }
    return merged.values.sortedBy(AgentToolGroupSnapshot::id)
}
