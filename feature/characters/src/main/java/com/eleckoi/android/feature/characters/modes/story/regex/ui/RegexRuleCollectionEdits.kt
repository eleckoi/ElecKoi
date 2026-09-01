package com.eleckoi.android.feature.characters.modes.story.regex.ui

import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRule
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleCollection
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleScope
import com.eleckoi.android.feature.characters.modes.story.regex.model.RegexRuleVersion
import com.eleckoi.android.foundation.storage.newId

internal fun RegexRuleCollection.rulesFor(scope: RegexRuleScope): List<RegexRule> = when (scope) {
    RegexRuleScope.Global -> globalRules
    RegexRuleScope.PromptPreset -> promptPresetRules
    RegexRuleScope.Character -> characterRules
}

internal fun RegexRuleCollection.withRules(scope: RegexRuleScope, rules: List<RegexRule>): RegexRuleCollection =
    when (scope) {
        RegexRuleScope.Global -> copy(globalRules = rules)
        RegexRuleScope.PromptPreset -> copy(promptPresetRules = rules)
        RegexRuleScope.Character -> copy(characterRules = rules)
    }

internal fun RegexRuleCollection.allRules(): List<RegexRule> =
    RegexRuleScope.entries.flatMap { rulesFor(it) }

internal fun RegexRuleCollection.moveRule(scope: RegexRuleScope, ruleId: String, direction: Int): RegexRuleCollection {
    val current = rulesFor(scope)
    val from = current.indexOfFirst { it.id == ruleId }
    if (from < 0) return this
    val to = (from + direction).coerceIn(0, current.lastIndex)
    if (from == to) return this
    val reordered = current.toMutableList()
    reordered.add(to, reordered.removeAt(from))
    return withRules(scope, reordered)
}

internal fun RegexRuleCollection.moveRuleTo(
    scope: RegexRuleScope,
    ruleId: String,
    targetRuleId: String,
): RegexRuleCollection {
    val current = rulesFor(scope)
    val from = current.indexOfFirst { it.id == ruleId }
    val to = current.indexOfFirst { it.id == targetRuleId }
    if (from !in current.indices || to !in current.indices || from == to) return this
    val reordered = current.toMutableList()
    reordered.add(to, reordered.removeAt(from))
    return withRules(scope, reordered)
}

internal fun RegexRuleCollection.upsertRule(scope: RegexRuleScope, rule: RegexRule): RegexRuleCollection {
    val current = rulesFor(scope)
    val next = if (current.any { it.id == rule.id }) {
        current.map { if (it.id == rule.id) rule else it }
    } else {
        listOf(rule) + current
    }.mapIndexed { index, item -> item.copy(order = index) }
    return withRules(scope, next).withVersionEnabled(scope, rule.id, rule.enabled)
}

internal fun RegexRuleCollection.setRuleEnabled(
    scope: RegexRuleScope,
    ruleId: String,
    enabled: Boolean,
): RegexRuleCollection {
    val next = rulesFor(scope).map { if (it.id == ruleId) it.copy(enabled = enabled) else it }
    return withRules(scope, next).withVersionEnabled(scope, ruleId, enabled)
}

internal fun RegexRuleCollection.setEnabledForIds(ids: Set<String>, enabled: Boolean): RegexRuleCollection =
    RegexRuleScope.entries.fold(this) { collection, scope ->
        val changedIds = collection.rulesFor(scope).filter { it.id in ids }.map(RegexRule::id)
        val updated = collection.withRules(
            scope,
            collection.rulesFor(scope).map { if (it.id in ids) it.copy(enabled = enabled) else it },
        )
        changedIds.fold(updated) { result, ruleId -> result.withVersionEnabled(scope, ruleId, enabled) }
    }

internal fun RegexRuleCollection.removeRules(ids: Set<String>): RegexRuleCollection {
    val withoutRules = RegexRuleScope.entries.fold(this) { collection, scope ->
        collection.withRules(scope, collection.rulesFor(scope).filterNot { it.id in ids })
    }
    return withoutRules.copy(
        versions = withoutRules.versions.map { version ->
            version.copy(
                globalEnabledIds = version.globalEnabledIds - ids,
                promptPresetEnabledIds = version.promptPresetEnabledIds - ids,
                characterEnabledIds = version.characterEnabledIds - ids,
            )
        },
    )
}

internal fun RegexRuleCollection.duplicateRules(ids: Set<String>): RegexRuleCollection {
    if (ids.isEmpty()) return this
    var updated = this
    RegexRuleScope.entries.forEach { scope ->
        val copies = mutableListOf<RegexRule>()
        val duplicated = mutableListOf<RegexRule>()
        updated.rulesFor(scope).forEach { rule ->
            copies += rule
            if (rule.id in ids) {
                val copy = rule.copy(
                    id = "regex-${newId(10)}",
                    name = "${rule.name.trim().ifBlank { "未命名规则" }} 副本",
                )
                copies += copy
                duplicated += copy
            }
        }
        updated = updated.withRules(scope, copies.mapIndexed { index, rule -> rule.copy(order = index) })
        duplicated.filter(RegexRule::enabled).forEach { copy ->
            updated = updated.withVersionEnabled(scope, copy.id, true)
        }
    }
    return updated
}

internal fun RegexRuleCollection.activeVersion(): RegexRuleVersion? = versions.firstOrNull { it.id == activeVersionId }

internal fun RegexRuleCollection.withVersionEnabled(
    scope: RegexRuleScope,
    ruleId: String,
    enabled: Boolean,
): RegexRuleCollection {
    val current = activeVersion() ?: return this
    val changed = when (scope) {
        RegexRuleScope.Global -> current.copy(globalEnabledIds = current.globalEnabledIds.withMembership(ruleId, enabled))
        RegexRuleScope.PromptPreset ->
            current.copy(promptPresetEnabledIds = current.promptPresetEnabledIds.withMembership(ruleId, enabled))
        RegexRuleScope.Character ->
            current.copy(characterEnabledIds = current.characterEnabledIds.withMembership(ruleId, enabled))
    }
    return copy(versions = versions.map { if (it.id == changed.id) changed else it })
}

internal fun RegexRuleCollection.captureVersion(name: String): RegexRuleVersion = RegexRuleVersion(
    id = "regex-version-${newId(10)}",
    name = name.trim().ifBlank { "未命名版本" },
    globalEnabledIds = globalRules.filter(RegexRule::enabled).map(RegexRule::id).toSet(),
    promptPresetEnabledIds = promptPresetRules.filter(RegexRule::enabled).map(RegexRule::id).toSet(),
    characterEnabledIds = characterRules.filter(RegexRule::enabled).map(RegexRule::id).toSet(),
)

internal fun RegexRuleCollection.applyVersion(version: RegexRuleVersion): RegexRuleCollection = copy(
    globalRules = globalRules.applyEnabled(version.globalEnabledIds),
    promptPresetRules = promptPresetRules.applyEnabled(version.promptPresetEnabledIds),
    characterRules = characterRules.applyEnabled(version.characterEnabledIds),
    activeVersionId = version.id,
)

internal fun RegexRuleCollection.deleteVersion(version: RegexRuleVersion): RegexRuleCollection = copy(
    versions = versions.filterNot { it.id == version.id },
    activeVersionId = if (activeVersionId == version.id) "" else activeVersionId,
)

private fun List<RegexRule>.applyEnabled(enabledIds: Set<String>): List<RegexRule> =
    map { it.copy(enabled = it.id in enabledIds) }

private fun Set<String>.withMembership(id: String, included: Boolean): Set<String> =
    if (included) this + id else this - id
