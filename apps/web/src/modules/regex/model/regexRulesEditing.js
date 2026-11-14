import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';

export const REGEX_SCOPES = [
  { id: "Global", label: "全局正则", key: "globalRules", enabledKey: 'globalEnabled' },
  { id: "AgentPreset", label: "预设正则", key: "agentPresetRules", enabledKey: 'agentPresetEnabled' },
  { id: "Character", label: "角色正则", key: "characterRules", enabledKey: 'characterEnabled' },
];

export const REGEX_TARGETS = [
  { id: "UserInput", label: "用户发送" },
  { id: "AiOutput", label: "AI 回复" },
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

function withScopeRules(collection, scope, rules) {
  const key = REGEX_SCOPES.find((item) => item.id === scope)?.key;
  if (!key) return collection;
  return { ...collection, [key]: rules.map((rule, order) => ({ ...rule, order })) };
}

export function replaceRegexScopeVersion(collection, scope, rules) {
  const metadata = REGEX_SCOPES.find(item => item.id === scope);
  if (!metadata) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '正则版本作用域无效。', { field: 'scope' });
  const next = withScopeRules(collection, scope, rules);
  const allIds = REGEX_SCOPES.flatMap(item => rulesForScope(next, item.id).map(rule => rule.id));
  if (new Set(allIds).size !== allIds.length) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, '正则版本包含与其他作用域重复的规则编号。', { what: '规则编号' });
  const allowed = new Set(rules.map(rule => rule.id)), enabled = rules.filter(rule => rule.enabled).map(rule => rule.id);
  const memberKey = scope === 'Global' ? 'globalEnabledIds' : scope === 'AgentPreset' ? 'agentPresetEnabledIds' : 'characterEnabledIds';
  return { ...next, versions: next.versions.map(version => ({ ...version,
    [memberKey]: version.id === next.activeVersionId ? enabled : version[memberKey].filter(id => allowed.has(id)) })) };
}

export function findRegexRule(collection, ruleId) {
  for (const scope of REGEX_SCOPES) {
    const rule = rulesForScope(collection, scope.id).find((candidate) => candidate.id === ruleId);
    if (rule) return { scope: scope.id, rule };
  }
  return null;
}

export function setRegexScopeEnabled(collection, scope, enabled) {
  const metadata = REGEX_SCOPES.find(item => item.id === scope);
  if (!metadata) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '正则作用域无效。', { field: 'scope' });
  const rules = rulesForScope(collection, scope).map(rule => ({ ...rule, enabled }));
  return { ...replaceRegexScopeVersion(collection, scope, rules), [metadata.enabledKey]: enabled };
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
  next = withScopeRules(next, nextScope, [rule, ...rulesForScope(next, nextScope)]);
  const keys = { Global: 'globalEnabledIds', AgentPreset: 'agentPresetEnabledIds', Character: 'characterEnabledIds' };
  return { ...next, versions: next.versions.map(version => {
    const enabled = version.id === next.activeVersionId ? rule.enabled : version[keys[fromScope]].includes(ruleId);
    const destination = version[keys[nextScope]].filter(id => id !== ruleId);
    return { ...version, [keys[fromScope]]: version[keys[fromScope]].filter(id => id !== ruleId),
      [keys[nextScope]]: enabled ? [...destination, ruleId] : destination };
  }) };
}
