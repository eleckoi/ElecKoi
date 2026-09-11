import { FIXED_ENTRY_IDS, PINNED_ENTRY_IDS, createId, uniqueName } from "./settingLibraryEditing.js";

export const SETTING_LIBRARY_EXPORT_FORMAT = "eleckoi.workspace-setting-library";
export const SETTING_LIBRARY_EXPORT_VERSION = 3;

const POSITIONS = new Set([
  "instructions",
  "after_instructions",
  "before_history",
  "after_history",
  "before_latest_user_input",
  "after_latest_user_input",
  "before_tool_flow",
  "after_tool_flow",
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function text(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function integer(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function stringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function objectList(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
}

function isLegacyRoleplayPlanEntry(entry) {
  return entry?.id === "fixed-roleplay-plan" || entry?.kind === "roleplay_plan";
}

function currentEntries(entries) {
  return entries.filter((entry) => !isLegacyRoleplayPlanEntry(entry));
}

function activeSnapshot(library) {
  const previous = library.versions.find((version) => version.id === library.activeVersionId);
  return {
    id: library.activeVersionId,
    name: library.name,
    entries: clone(currentEntries(library.entries)),
    groups: clone(library.groups),
    promptPositions: clone(library.promptPositions),
    listAllExpanded: library.listAllExpanded,
    expandedGroupIds: [...library.expandedGroupIds],
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: previous?.updatedAt || "",
  };
}

export function syncActiveVersion(library) {
  const active = activeSnapshot(library);
  const versions = library.versions.some((version) => version.id === active.id)
    ? library.versions.map((version) => version.id === active.id ? active : version)
    : [...library.versions, active];
  return { ...library, versions };
}

export function renameActiveVersion(library, name) {
  const next = { ...library, name: name.slice(0, 60) };
  return syncActiveVersion(next);
}

function applyVersion(library, version) {
  return {
    ...library,
    name: version.name,
    entries: clone(currentEntries(version.entries)),
    groups: clone(version.groups),
    promptPositions: clone(version.promptPositions),
    activeVersionId: version.id,
    listAllExpanded: version.listAllExpanded,
    expandedGroupIds: [...version.expandedGroupIds],
  };
}

export function switchLibraryVersion(library, versionId) {
  const synced = syncActiveVersion(library);
  const version = synced.versions.find((item) => item.id === versionId);
  return version ? applyVersion(synced, version) : library;
}

function blankFixedEntries(library) {
  return library.entries.filter((entry) => PINNED_ENTRY_IDS.has(entry.id)).map((entry) => {
    const copied = clone(entry);
    if (copied.kind !== "opening") return copied;
    const first = copied.openingMessages?.find((message) => message.id === copied.defaultOpeningMessageId)
      || copied.openingMessages?.[0]
      || { id: "opening-default", title: "默认开场", content: "", initialVariableStateJson: "" };
    return {
      ...copied,
      content: "",
      openingMessages: [{ ...first, content: "", initialVariableStateJson: "" }],
      defaultOpeningMessageId: first.id,
    };
  });
}

function ensureFixedEntries(library, entries) {
  const sanitized = currentEntries(entries);
  const byId = new Map(sanitized.map((entry) => [entry.id, entry]));
  return [
    ...blankFixedEntries(library).map((entry) => byId.get(entry.id) || entry),
    ...sanitized.filter((entry) => !PINNED_ENTRY_IDS.has(entry.id)),
  ];
}

function availableVersionName(library, requested) {
  const names = new Set(library.versions.map((version) => version.name.trim()));
  return uniqueName(requested.trim() || "新版本", names).slice(0, 60);
}

export function createLibraryVersion(library, requestedName, sourceVersionId = "") {
  const synced = syncActiveVersion(library);
  const source = synced.versions.find((version) => version.id === sourceVersionId);
  const timestamp = new Date().toISOString();
  const version = source ? {
    ...clone(source),
    id: createId("library"),
    name: availableVersionName(synced, requestedName),
    createdAt: timestamp,
    updatedAt: timestamp,
  } : {
    id: createId("library"),
    name: availableVersionName(synced, requestedName),
    entries: blankFixedEntries(synced),
    groups: [],
    promptPositions: [],
    listAllExpanded: true,
    expandedGroupIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return applyVersion({ ...synced, versions: [...synced.versions, version] }, version);
}

export function deleteActiveLibraryVersion(library) {
  const synced = syncActiveVersion(library);
  const remaining = synced.versions.filter((version) => version.id !== synced.activeVersionId);
  if (remaining.length) return applyVersion({ ...synced, versions: remaining }, remaining[0]);
  const timestamp = new Date().toISOString();
  const replacement = {
    id: createId("library"), name: "新版本", entries: blankFixedEntries(synced), groups: [],
    promptPositions: [], listAllExpanded: true, expandedGroupIds: [], createdAt: timestamp, updatedAt: timestamp,
  };
  return applyVersion({ ...synced, versions: [replacement] }, replacement);
}

export function importLibraryAsVersion(library, imported) {
  const synced = syncActiveVersion(library);
  const timestamp = new Date().toISOString();
  const version = {
    ...clone(imported),
    id: createId("library"),
    name: availableVersionName(synced, imported.name || "导入版本"),
    entries: ensureFixedEntries(synced, imported.entries),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return applyVersion({ ...synced, versions: [...synced.versions, version] }, version);
}

function openingMessageFromJson(value) {
  return {
    id: text(value.id) || createId("opening"),
    title: text(value.title),
    content: text(value.content),
    initialVariableStateJson: text(value.initial_variable_state),
  };
}

function entryFromJson(value, index) {
  const rawPosition = text(value.position);
  const triggerMode = text(value.trigger_mode);
  return {
    id: text(value.id) || createId("setting"),
    title: text(value.title).slice(0, 120),
    iconId: text(value.icon_id),
    kind: ["normal", "opening", "roleplay_plan", "history_compaction", "hidden_tool_timeline"].includes(value.kind) ? value.kind : "normal",
    groupId: text(value.group_id),
    content: text(value.content),
    openingMessages: objectList(value.opening_messages).map(openingMessageFromJson),
    defaultOpeningMessageId: text(value.default_opening_message_id),
    agentSelectionHint: text(value.agent_selection_hint),
    agentReadStrategy: ["required", "keyword", "normal", "variable_condition"].includes(value.agent_read_strategy) ? value.agent_read_strategy : "normal",
    agentReadCondition: text(value.agent_read_condition),
    dynamicMode: ["single_condition", "ejs_controller", "ejs_reference"].includes(value.dynamic_mode) ? value.dynamic_mode : "single_condition",
    keywords: stringList(value.keywords),
    keywordScanDepth: Math.max(0, integer(value.keyword_scan_depth, 1)),
    conditionKeywords: stringList(value.condition_keywords),
    keywordCondition: ["none", "any", "all", "not_any"].includes(value.keyword_condition) ? value.keyword_condition : "none",
    keywordUseRegex: bool(value.keyword_use_regex),
    keywordIgnoreCase: bool(value.keyword_ignore_case, true),
    keywordWholeWord: bool(value.keyword_whole_word),
    keywordRecursionDepth: Math.max(0, integer(value.keyword_recursion_depth)),
    triggerMode: ["always", "agent_tool"].includes(triggerMode) ? triggerMode : null,
    enabled: bool(value.enabled, true),
    position: POSITIONS.has(rawPosition) ? rawPosition : null,
    promptPositionId: text(value.prompt_position_id),
    insertRole: ["system", "user", "assistant"].includes(value.insert_role) ? value.insert_role : "user",
    order: Math.max(1, integer(value.order, 1)),
    viewOrder: integer(value.view_order, index + 1),
    groupViewOrder: integer(value.group_view_order),
    treeViewOrder: integer(value.tree_view_order, index + 1),
    createdAt: text(value.created_at),
    updatedAt: text(value.updated_at),
  };
}

function groupFromJson(value, index) {
  return {
    id: text(value.id) || createId("group"),
    name: text(value.name).slice(0, 80),
    parentId: text(value.parent_id),
    order: Math.max(1, integer(value.order, index + 1)),
    treeViewOrder: integer(value.tree_view_order, index + 1),
    createdAt: text(value.created_at),
    updatedAt: text(value.updated_at),
  };
}

function promptPositionFromJson(value, index) {
  const anchor = text(value.anchor);
  return {
    id: text(value.id) || createId("prompt-position"),
    name: text(value.name).slice(0, 60),
    anchor: POSITIONS.has(anchor) ? anchor : "after_instructions",
    order: Math.max(1, integer(value.order, index + 1)),
    createdAt: text(value.created_at),
    updatedAt: text(value.updated_at),
  };
}

function parseElecKoiExport(source) {
  if (source.format !== SETTING_LIBRARY_EXPORT_FORMAT || source.version !== SETTING_LIBRARY_EXPORT_VERSION) {
    throw new Error("这不是当前版本的 ElecKoi 设定库文件。");
  }
  return {
    id: createId("import"),
    name: text(source.name, "导入版本"),
    entries: currentEntries(objectList(source.entries).map(entryFromJson)),
    groups: objectList(source.groups).map(groupFromJson),
    promptPositions: objectList(source.prompt_positions).map(promptPositionFromJson),
    listAllExpanded: bool(source.list_all_expanded, true),
    expandedGroupIds: stringList(source.expanded_group_ids),
    createdAt: "",
    updatedAt: "",
  };
}

function uniqueImportedTitle(requested, used) {
  const base = requested.trim().slice(0, 120) || "世界书条目";
  if (!used.has(base.toLocaleLowerCase())) {
    used.add(base.toLocaleLowerCase());
    return base;
  }
  let index = 2;
  while (used.has(`${base} (${index})`.toLocaleLowerCase())) index += 1;
  const result = `${base} (${index})`.slice(0, 120);
  used.add(result.toLocaleLowerCase());
  return result;
}

function worldBookEntries(source) {
  const raw = source?.entries;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    return Object.keys(raw).sort((left, right) => (Number(left) || Number.MAX_SAFE_INTEGER) - (Number(right) || Number.MAX_SAFE_INTEGER))
      .map((key) => raw[key]).filter(Boolean);
  }
  return [];
}

function ejsController(content) {
  return /<%[_=\-#]?/.test(content);
}

function literalGetwiTargets(content) {
  const targets = new Set();
  const pattern = /getwi\s*\(\s*(?:(?:null|["'`][^"'`]*["'`])\s*,\s*)?(["'`])([^"'`]+)\1/gi;
  let match;
  while ((match = pattern.exec(content))) targets.add(match[2]);
  return targets;
}

function hasDynamicGetwi(content) {
  const callPattern = /getwi\s*\(([^)]*)\)/gi;
  const literalArguments = /^\s*(?:(?:null|["'`][^"'`]*["'`])\s*,\s*)?["'`][^"'`]+["'`]\s*$/i;
  let match;
  while ((match = callPattern.exec(content))) {
    if (!literalArguments.test(match[1])) return true;
  }
  return false;
}

function parseSillyTavernExport(source) {
  const book = source?.data?.character_book || source?.character_book || source;
  const rawEntries = worldBookEntries(book);
  if (!rawEntries.length) throw new Error("这个文件里没有可导入的酒馆世界书条目。");
  const name = text(source.name) || text(source?.originalData?.name) || text(book?.name) || "酒馆世界书";
  const groupId = createId("tavern-world-book");
  const timestamp = new Date().toISOString();
  const used = new Set();
  const imported = rawEntries.map((item, index) => {
    const keys = stringList(item.keys || item.key);
    const secondary = stringList(item.secondary_keys || item.keysecondary);
    const constant = bool(item.constant);
    const rawTitle = text(item.name) || text(item.comment) || keys[0] || `世界书条目 ${index + 1}`;
    const title = uniqueImportedTitle(rawTitle, used);
    const logic = integer(item?.extensions?.selectiveLogic);
    const content = text(item.content);
    return { rawTitle, content, entry: {
      id: createId("tavern-world-entry"),
      title,
      iconId: "",
      kind: "normal",
      groupId,
      content,
      openingMessages: [],
      defaultOpeningMessageId: "",
      agentSelectionHint: constant ? "酒馆世界书常驻条目，Agent 必读" : "酒馆世界书关键词命中时读取",
      agentReadStrategy: constant ? "required" : "keyword",
      agentReadCondition: "",
      dynamicMode: "single_condition",
      keywords: constant ? [] : keys,
      keywordScanDepth: 1,
      conditionKeywords: constant ? [] : secondary,
      keywordCondition: constant || !secondary.length ? "none" : logic === 2 ? "not_any" : logic === 3 ? "all" : "any",
      keywordUseRegex: !constant && bool(item.use_regex),
      keywordIgnoreCase: !bool(item.case_sensitive, bool(item?.extensions?.case_sensitive)),
      keywordWholeWord: bool(item.match_whole_words, bool(item?.extensions?.match_whole_words)),
      keywordRecursionDepth: 0,
      triggerMode: "agent_tool",
      enabled: Object.hasOwn(item, "enabled") ? bool(item.enabled, true) : !bool(item.disable),
      position: "after_instructions",
      promptPositionId: "",
      insertRole: "user",
      order: index + 1,
      viewOrder: index + 1,
      groupViewOrder: index + 1,
      treeViewOrder: index + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    } };
  });
  const controllers = imported.filter((item) => ejsController(item.content));
  const referencedTitles = new Set(controllers.flatMap((item) => [...literalGetwiTargets(item.content)]));
  const dynamicReferences = controllers.some((item) => hasDynamicGetwi(item.content));
  const entries = imported.map(({ rawTitle, entry }) => {
    if (ejsController(entry.content)) return {
      ...entry,
      agentSelectionHint: "酒馆 EJS 动态控制器，渲染结果为 Agent 必读",
      agentReadStrategy: "variable_condition",
      dynamicMode: "ejs_controller",
      keywords: [],
      conditionKeywords: [],
      keywordCondition: "none",
    };
    if (dynamicReferences || referencedTitles.has(rawTitle)) return {
      ...entry,
      agentSelectionHint: "供 EJS 控制器通过 getwi 读取的引用条目",
      agentReadStrategy: "variable_condition",
      dynamicMode: "ejs_reference",
      keywords: [],
      conditionKeywords: [],
      keywordCondition: "none",
      enabled: true,
    };
    return entry;
  });
  return {
    id: createId("import"), name, entries,
    groups: [{ id: groupId, name, parentId: "", order: 1, treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp }],
    promptPositions: [], listAllExpanded: true, expandedGroupIds: [groupId], createdAt: "", updatedAt: "",
  };
}

export function parseSettingLibraryFile(json, expected = "auto") {
  let source;
  try {
    source = JSON.parse(json);
  } catch (error) {
    throw new Error("JSON 文件无法读取。", { cause: error });
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("设定库文件格式不正确。");
  const isSillyTavern = !source.format && Boolean(source.entries || source.character_book || source?.data?.character_book);
  if (expected === "eleckoi" && isSillyTavern) throw new Error("请选择 ElecKoi 导出的设定库文件。");
  if (expected === "sillytavern" && !isSillyTavern) throw new Error("请选择 SillyTavern 世界书 JSON。");
  return isSillyTavern ? parseSillyTavernExport(source) : parseElecKoiExport(source);
}

function entryToJson(entry) {
  return {
    id: entry.id, title: entry.title, icon_id: entry.iconId, kind: entry.kind,
    group_id: entry.groupId, content: entry.content,
    opening_messages: entry.openingMessages.map((message) => ({
      id: message.id, title: message.title, content: message.content,
      initial_variable_state: message.initialVariableStateJson,
    })),
    default_opening_message_id: entry.defaultOpeningMessageId,
    agent_selection_hint: entry.agentSelectionHint, agent_read_strategy: entry.agentReadStrategy,
    agent_read_condition: entry.agentReadCondition, dynamic_mode: entry.dynamicMode,
    keywords: entry.keywords, keyword_scan_depth: entry.keywordScanDepth,
    condition_keywords: entry.conditionKeywords, keyword_condition: entry.keywordCondition,
    keyword_use_regex: entry.keywordUseRegex, keyword_ignore_case: entry.keywordIgnoreCase,
    keyword_whole_word: entry.keywordWholeWord, keyword_recursion_depth: entry.keywordRecursionDepth,
    trigger_mode: entry.triggerMode || "", enabled: entry.enabled, position: entry.position || "",
    prompt_position_id: entry.promptPositionId, insert_role: entry.insertRole, order: entry.order,
    view_order: entry.viewOrder, group_view_order: entry.groupViewOrder, tree_view_order: entry.treeViewOrder,
    created_at: entry.createdAt, updated_at: entry.updatedAt,
  };
}

export function serializeSettingLibrary(library) {
  const current = syncActiveVersion(library);
  return JSON.stringify({
    format: SETTING_LIBRARY_EXPORT_FORMAT,
    version: SETTING_LIBRARY_EXPORT_VERSION,
    character_id: current.characterId,
    name: current.name,
    list_all_expanded: current.listAllExpanded,
    expanded_group_ids: current.expandedGroupIds,
    entries: currentEntries(current.entries).map(entryToJson),
    groups: current.groups.map((group) => ({
      id: group.id, name: group.name, parent_id: group.parentId, order: group.order,
      tree_view_order: group.treeViewOrder, created_at: group.createdAt, updated_at: group.updatedAt,
    })),
    prompt_positions: current.promptPositions.map((position) => ({
      id: position.id, name: position.name, anchor: position.anchor, order: position.order,
      created_at: position.createdAt, updated_at: position.updatedAt,
    })),
  }, null, 2);
}

function requiredGroupIds(sourceEntries, sourceGroups, selectedEntryIds) {
  const byId = new Map(sourceGroups.map((group) => [group.id, group]));
  const result = [];
  const seen = new Set();
  for (const entry of sourceEntries.filter((item) => selectedEntryIds.has(item.id))) {
    const chain = [];
    const visited = new Set();
    let group = byId.get(entry.groupId);
    while (group && !visited.has(group.id)) {
      chain.push(group);
      visited.add(group.id);
      group = byId.get(group.parentId);
    }
    for (const item of chain.reverse()) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        result.push(item.id);
      }
    }
  }
  return result;
}

function nextTreeViewOrder(parentId, groups, entries) {
  return Math.max(0,
    ...groups.filter((group) => group.parentId === parentId).map((group) => group.treeViewOrder),
    ...entries.filter((entry) => entry.groupId === parentId).map((entry) => entry.treeViewOrder),
  ) + 1;
}

function availableTitle(groupId, requested, entries) {
  const base = requested.trim() || "未命名设定";
  const names = new Set(entries.filter((entry) => entry.groupId === groupId).map((entry) => entry.title.trim()));
  return uniqueName(base, names).slice(0, 120);
}

function availableOrder(entry, entries) {
  if (!entry.position) return entry.order;
  const scope = entry.promptPositionId || entry.position;
  const used = new Set(entries.filter((item) => !FIXED_ENTRY_IDS.has(item.id) && (item.promptPositionId || item.position) === scope).map((item) => item.order));
  let order = entry.order;
  while (used.has(order)) order += 1;
  return order;
}

export function mergeSettingLibraryEntries(library, sourceVersion, selectedIds, destinationGroupId = "") {
  const selectedEntryIds = new Set(selectedIds);
  const picked = sourceVersion.entries.filter((entry) => selectedEntryIds.has(entry.id) && !PINNED_ENTRY_IDS.has(entry.id));
  if (!picked.length) return { library, plan: { entryCount: 0, mergedFolderCount: 0, newFolderCount: 0, renamedEntryCount: 0, reorderedEntryCount: 0 } };
  const sourceGroups = new Map(sourceVersion.groups.map((group) => [group.id, group]));
  const destination = library.groups.some((group) => group.id === destinationGroupId) ? destinationGroupId : "";
  const groups = clone(library.groups);
  const entries = clone(library.entries);
  const resolved = new Map();
  let mergedFolderCount = 0;
  let newFolderCount = 0;
  for (const sourceId of requiredGroupIds(picked, sourceVersion.groups, selectedEntryIds)) {
    const source = sourceGroups.get(sourceId);
    const parentId = source.parentId ? resolved.get(source.parentId) || destination : destination;
    const name = source.name.trim() || "未命名文件夹";
    const existing = groups.find((group) => group.parentId === parentId && group.name.trim() === name);
    if (existing) {
      resolved.set(sourceId, existing.id);
      mergedFolderCount += 1;
    } else {
      const timestamp = new Date().toISOString();
      const group = { ...clone(source), id: createId("group"), name, parentId, order: groups.length + 1, treeViewOrder: nextTreeViewOrder(parentId, groups, entries), createdAt: timestamp, updatedAt: timestamp };
      groups.push(group);
      resolved.set(sourceId, group.id);
      newFolderCount += 1;
    }
  }
  let renamedEntryCount = 0;
  let reorderedEntryCount = 0;
  let viewOrder = Math.max(0, ...entries.map((entry) => entry.viewOrder));
  for (const source of picked) {
    const groupId = source.groupId ? resolved.get(source.groupId) || destination : destination;
    const title = availableTitle(groupId, source.title, entries);
    const order = availableOrder(source, entries);
    if (title !== (source.title.trim() || "未命名设定")) renamedEntryCount += 1;
    if (order !== source.order) reorderedEntryCount += 1;
    const timestamp = new Date().toISOString();
    entries.push({
      ...clone(source), id: createId("setting"), title, groupId, order, viewOrder: ++viewOrder,
      groupViewOrder: Math.max(0, ...entries.filter((entry) => entry.groupId === groupId).map((entry) => entry.groupViewOrder)) + 1,
      treeViewOrder: nextTreeViewOrder(groupId, groups, entries), createdAt: timestamp, updatedAt: timestamp,
    });
  }
  const next = syncActiveVersion({ ...library, entries, groups });
  return {
    library: next,
    plan: { entryCount: picked.length, mergedFolderCount, newFolderCount, renamedEntryCount, reorderedEntryCount },
  };
}
