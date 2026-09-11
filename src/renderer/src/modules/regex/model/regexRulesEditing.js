export const REGEX_SCOPES = [
  { id: "Global", label: "全局正则", key: "globalRules" },
  { id: "AgentPreset", label: "预设正则", key: "agentPresetRules" },
  { id: "Character", label: "角色正则", key: "characterRules" },
];

export const REGEX_TARGETS = [
  { id: "UserInput", label: "用户发送" },
  { id: "AiOutput", label: "AI 回复" },
  { id: "SlashCommand", label: "快捷命令" },
  { id: "SettingContent", label: "设定内容" },
  { id: "Reasoning", label: "推理内容" },
];

export function newRegexId(prefix = "regex") {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function rulesForScope(collection, scope) {
  const key = REGEX_SCOPES.find((item) => item.id === scope)?.key;
  return key ? collection?.[key] || [] : [];
}

export function withScopeRules(collection, scope, rules) {
  const key = REGEX_SCOPES.find((item) => item.id === scope)?.key;
  if (!key) return collection;
  return { ...collection, [key]: rules.map((rule, order) => ({ ...rule, order })) };
}

export function findRegexRule(collection, ruleId) {
  for (const scope of REGEX_SCOPES) {
    const rule = rulesForScope(collection, scope.id).find((candidate) => candidate.id === ruleId);
    if (rule) return { scope: scope.id, rule };
  }
  return null;
}

export function createRegexRule(collection, scope) {
  const rule = {
    id: newRegexId(),
    name: "未命名规则",
    pattern: "",
    replacement: "",
    targets: ["AiOutput"],
    enabled: true,
    displayOnly: false,
    promptOnly: false,
    runOnEdit: false,
    order: 0,
  };
  const withRule = withScopeRules(collection, scope, [rule, ...rulesForScope(collection, scope)]);
  return { collection: withVersionMembership(withRule, scope, rule.id, true), rule };
}

function withVersionMembership(collection, scope, ruleId, enabled) {
  if (!collection.activeVersionId) return collection;
  const key = scope === "Global"
    ? "globalEnabledIds"
    : scope === "AgentPreset"
      ? "agentPresetEnabledIds"
      : "characterEnabledIds";
  return {
    ...collection,
    versions: collection.versions.map((version) => {
      if (version.id !== collection.activeVersionId) return version;
      const ids = new Set(version[key]);
      if (enabled) ids.add(ruleId);
      else ids.delete(ruleId);
      return { ...version, [key]: [...ids] };
    }),
  };
}

export function updateRegexRule(collection, scope, ruleId, patch) {
  const rules = rulesForScope(collection, scope).map((rule) => rule.id === ruleId ? { ...rule, ...patch } : rule);
  const next = withScopeRules(collection, scope, rules);
  return "enabled" in patch ? withVersionMembership(next, scope, ruleId, patch.enabled) : next;
}

export function moveRegexRule(collection, scope, ruleId, targetIndex) {
  const rules = [...rulesForScope(collection, scope)];
  const from = rules.findIndex((rule) => rule.id === ruleId);
  const to = Math.max(0, Math.min(targetIndex, rules.length - 1));
  if (from < 0 || from === to) return collection;
  const [moved] = rules.splice(from, 1);
  rules.splice(to, 0, moved);
  return withScopeRules(collection, scope, rules);
}

export function deleteRegexRules(collection, ids) {
  const removed = new Set(ids);
  let next = collection;
  REGEX_SCOPES.forEach((scope) => {
    next = withScopeRules(next, scope.id, rulesForScope(next, scope.id).filter((rule) => !removed.has(rule.id)));
  });
  return {
    ...next,
    versions: next.versions.map((version) => ({
      ...version,
      globalEnabledIds: version.globalEnabledIds.filter((id) => !removed.has(id)),
      agentPresetEnabledIds: version.agentPresetEnabledIds.filter((id) => !removed.has(id)),
      characterEnabledIds: version.characterEnabledIds.filter((id) => !removed.has(id)),
    })),
  };
}

export function duplicateRegexRules(collection, ids) {
  const selected = new Set(ids);
  let next = collection;
  REGEX_SCOPES.forEach((scope) => {
    const rules = [];
    const copies = [];
    rulesForScope(next, scope.id).forEach((rule) => {
      rules.push(rule);
      if (selected.has(rule.id)) {
        const copy = { ...rule, id: newRegexId(), name: `${rule.name.trim() || "未命名规则"} 副本` };
        rules.push(copy);
        copies.push(copy);
      }
    });
    next = withScopeRules(next, scope.id, rules);
    copies.filter((copy) => copy.enabled).forEach((copy) => { next = withVersionMembership(next, scope.id, copy.id, true); });
  });
  return next;
}

export function moveRegexRuleToScope(collection, fromScope, nextScope, ruleId) {
  if (fromScope === nextScope) return collection;
  const rule = rulesForScope(collection, fromScope).find((item) => item.id === ruleId);
  if (!rule) return collection;
  let next = withScopeRules(collection, fromScope, rulesForScope(collection, fromScope).filter((item) => item.id !== ruleId));
  next = withVersionMembership(next, "Global", ruleId, false);
  next = withVersionMembership(next, "Character", ruleId, false);
  next = withScopeRules(next, nextScope, [rule, ...rulesForScope(next, nextScope)]);
  return rule.enabled ? withVersionMembership(next, nextScope, ruleId, true) : next;
}

export function captureRegexVersion(collection, name) {
  const version = {
    id: newRegexId("regex-version"),
    name: name.trim() || "未命名预设",
    globalEnabledIds: collection.globalRules.filter((rule) => rule.enabled).map((rule) => rule.id),
    agentPresetEnabledIds: collection.agentPresetRules.filter((rule) => rule.enabled).map((rule) => rule.id),
    characterEnabledIds: collection.characterRules.filter((rule) => rule.enabled).map((rule) => rule.id),
  };
  return { ...collection, versions: [...collection.versions, version], activeVersionId: version.id };
}

export function applyRegexVersion(collection, versionId) {
  if (!versionId) return { ...collection, activeVersionId: "" };
  const version = collection.versions.find((item) => item.id === versionId);
  if (!version) return collection;
  const globalEnabled = new Set(version.globalEnabledIds);
  const agentPresetEnabled = new Set(version.agentPresetEnabledIds);
  const characterEnabled = new Set(version.characterEnabledIds);
  return {
    ...collection,
    activeVersionId: version.id,
    globalRules: collection.globalRules.map((rule) => ({ ...rule, enabled: globalEnabled.has(rule.id) })),
    agentPresetRules: collection.agentPresetRules.map((rule) => ({ ...rule, enabled: agentPresetEnabled.has(rule.id) })),
    characterRules: collection.characterRules.map((rule) => ({ ...rule, enabled: characterEnabled.has(rule.id) })),
  };
}

export function deleteRegexVersion(collection, versionId) {
  return {
    ...collection,
    versions: collection.versions.filter((version) => version.id !== versionId),
    activeVersionId: collection.activeVersionId === versionId ? "" : collection.activeVersionId,
  };
}
