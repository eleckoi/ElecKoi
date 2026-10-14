import { FIXED_ENTRY_IDS, PINNED_ENTRY_IDS, createId, uniqueName } from "./settingLibraryEditing.js";

export const SETTING_LIBRARY_EXPORT_FORMAT = "eleckoi.workspace-setting-library";
export const SETTING_LIBRARY_EXPORT_VERSION = 3;

const POSITIONS = new Set([
  "instructions",
  "insert_point_1",
  "insert_point_2",
  "insert_point_3",
  "insert_point_4",
  "insert_point_5",
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

function activeSnapshot(library) {
  const previous = library.versions.find((version) => version.id === library.activeVersionId);
  return {
    id: library.activeVersionId,
    name: library.name,
    entries: clone(library.entries),
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
    entries: clone(version.entries),
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
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return [
    ...blankFixedEntries(library).map((entry) => byId.get(entry.id) || entry),
    ...entries.filter((entry) => !PINNED_ENTRY_IDS.has(entry.id)),
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
    ...(typeof value.variable_version_id === "string" ? { variableVersionId: value.variable_version_id } : {}),
  };
}

function entryFromJson(value, index) {
  const rawPosition = text(value.position);
  const triggerMode = text(value.trigger_mode);
  return {
    id: text(value.id) || createId("setting"),
    title: text(value.title).slice(0, 120),
    iconId: text(value.icon_id),
    kind: ["normal", "opening", "history_compaction", "hidden_tool_timeline"].includes(value.kind) ? value.kind : "normal",
    groupId: text(value.group_id),
    sendGroupId: text(value.send_group_id),
    content: text(value.content),
    openingMessages: objectList(value.opening_messages).map(openingMessageFromJson),
    defaultOpeningMessageId: text(value.default_opening_message_id),
    agentSelectionHint: text(value.agent_selection_hint),
    agentReadStrategy: ["required", "keyword", "normal"].includes(value.agent_read_strategy) ? value.agent_read_strategy : "normal",
    dynamicMode: ["standard", "ejs_reference"].includes(value.dynamic_mode) ? value.dynamic_mode : "standard",
    contentMode: ["plain_text", "ejs"].includes(value.content_mode) ? value.content_mode : "plain_text",
    keywords: stringList(value.keywords),
    keywordScanDepth: Math.max(0, integer(value.keyword_scan_depth, 1)),
    conditionKeywords: stringList(value.condition_keywords),
    keywordCondition: ["none", "any", "all", "not_any", "not_all"].includes(value.keyword_condition) ? value.keyword_condition : "none",
    keywordUseRegex: bool(value.keyword_use_regex),
    keywordIgnoreCase: bool(value.keyword_ignore_case, true),
    keywordWholeWord: bool(value.keyword_whole_word),
    keywordRecursionDepth: Math.max(0, integer(value.keyword_recursion_depth)),
    triggerMode: ["always", "agent_tool"].includes(triggerMode) ? triggerMode : null,
    enabled: bool(value.enabled, true),
    position: currentPosition(rawPosition),
    promptPositionId: text(value.prompt_position_id),
    insertRole: ["system", "user", "assistant"].includes(value.insert_role) ? value.insert_role : "user",
    order: Math.max(1, integer(value.order, 1)),
    viewOrder: integer(value.view_order, index + 1),
    groupViewOrder: integer(value.group_view_order),
    treeViewOrder: integer(value.tree_view_order, index + 1),
    createdAt: text(value.created_at),
    updatedAt: text(value.updated_at),
    ...(value.silly_tavern && typeof value.silly_tavern === "object" ? { sillyTavern: clone(value.silly_tavern) } : {}),
  };
}

function groupFromJson(value, index) {
  return {
    id: text(value.id) || createId("group"),
    name: text(value.name).slice(0, 80),
    parentId: text(value.parent_id),
    mergeSend: bool(value.merge_send),
    order: Math.max(1, integer(value.order, index + 1)),
    treeViewOrder: integer(value.tree_view_order, index + 1),
    createdAt: text(value.created_at),
    updatedAt: text(value.updated_at),
    ...(value.silly_tavern && typeof value.silly_tavern === "object" ? { sillyTavern: clone(value.silly_tavern) } : {}),
  };
}

function promptPositionFromJson(value, index) {
  const anchor = text(value.anchor);
  const placement = promptPlacement(anchor, text(value.side));
  return {
    id: text(value.id) || createId("prompt-position"),
    name: text(value.name).slice(0, 60),
    ...placement,
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
    entries: objectList(source.entries).map(entryFromJson),
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
    return Object.keys(raw).sort((left, right) => (Number.isFinite(Number(left)) ? Number(left) : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(Number(right)) ? Number(right) : Number.MAX_SAFE_INTEGER))
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
      dynamicMode: "standard",
      contentMode: "plain_text",
      keywords: constant ? [] : keys,
      keywordScanDepth: 1,
      conditionKeywords: constant ? [] : secondary,
      keywordCondition: constant || !secondary.length ? "none" : logic === 1 ? "not_all" : logic === 2 ? "not_any" : logic === 3 ? "all" : "any",
      keywordUseRegex: !constant && bool(item.use_regex),
      keywordIgnoreCase: !bool(item.case_sensitive, bool(item?.extensions?.case_sensitive)),
      keywordWholeWord: bool(item.match_whole_words, bool(item?.extensions?.match_whole_words)),
      keywordRecursionDepth: 0,
      triggerMode: "agent_tool",
      enabled: Object.hasOwn(item, "enabled") ? bool(item.enabled, true) : !bool(item.disable),
      position: "insert_point_1",
      promptPositionId: "",
      insertRole: "user",
      order: index + 1,
      viewOrder: index + 1,
      groupViewOrder: index + 1,
      treeViewOrder: index + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      sillyTavern: clone(item),
    } };
  });
  const controllers = imported.filter((item) => ejsController(item.content));
  const referencedTitles = new Set(controllers.flatMap((item) => [...literalGetwiTargets(item.content)]));
  const dynamicReferences = controllers.some((item) => hasDynamicGetwi(item.content));
  const entries = imported.map(({ rawTitle, entry }) => {
    if (ejsController(entry.content)) return {
      ...entry,
      agentSelectionHint: "酒馆 EJS 动态控制器，渲染结果为 Agent 必读",
      agentReadStrategy: "normal",
      dynamicMode: "standard",
      contentMode: "ejs",
      keywords: [],
      conditionKeywords: [],
      keywordCondition: "none",
    };
    if (dynamicReferences || referencedTitles.has(rawTitle)) return {
      ...entry,
      agentSelectionHint: "供 EJS 控制器通过 getwi 读取的 EJS引用设定",
      agentReadStrategy: "normal",
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
    groups: [{ id: groupId, name, parentId: "", order: 1, treeViewOrder: 1, createdAt: timestamp, updatedAt: timestamp,
      sillyTavern: Object.fromEntries(Object.entries(book).filter(([key]) => key !== "entries")) }],
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
    send_group_id: entry.sendGroupId || '',
    opening_messages: entry.openingMessages.map((message) => ({
      id: message.id, title: message.title, content: message.content,
      initial_variable_state: message.initialVariableStateJson,
      ...(typeof message.variableVersionId === "string" ? { variable_version_id: message.variableVersionId } : {}),
    })),
    default_opening_message_id: entry.defaultOpeningMessageId,
    agent_selection_hint: entry.agentSelectionHint, agent_read_strategy: entry.agentReadStrategy,
    dynamic_mode: entry.dynamicMode,
    content_mode: entry.contentMode,
    keywords: entry.keywords, keyword_scan_depth: entry.keywordScanDepth,
    condition_keywords: entry.conditionKeywords, keyword_condition: entry.keywordCondition,
    keyword_use_regex: entry.keywordUseRegex, keyword_ignore_case: entry.keywordIgnoreCase,
    keyword_whole_word: entry.keywordWholeWord, keyword_recursion_depth: entry.keywordRecursionDepth,
    trigger_mode: entry.triggerMode || "", enabled: entry.enabled, position: entry.position || "",
    prompt_position_id: entry.promptPositionId, insert_role: entry.insertRole, order: entry.order,
    view_order: entry.viewOrder, group_view_order: entry.groupViewOrder, tree_view_order: entry.treeViewOrder,
    created_at: entry.createdAt, updated_at: entry.updatedAt,
    ...(entry.sillyTavern ? { silly_tavern: clone(entry.sillyTavern) } : {}),
  };
}

export function toSettingLibraryExport(library) {
  const current = syncActiveVersion(library);
  return {
    format: SETTING_LIBRARY_EXPORT_FORMAT,
    version: SETTING_LIBRARY_EXPORT_VERSION,
    character_id: current.characterId,
    name: current.name,
    list_all_expanded: current.listAllExpanded,
    expanded_group_ids: current.expandedGroupIds,
    entries: current.entries.map(entryToJson),
    groups: current.groups.map((group) => ({
      id: group.id, name: group.name, parent_id: group.parentId, order: group.order,
      merge_send: group.mergeSend === true,
      tree_view_order: group.treeViewOrder, created_at: group.createdAt, updated_at: group.updatedAt,
      ...(group.sillyTavern ? { silly_tavern: clone(group.sillyTavern) } : {}),
    })),
    prompt_positions: current.promptPositions.map((position) => ({
      id: position.id, name: position.name, anchor: position.anchor, side: position.side, order: position.order,
      created_at: position.createdAt, updated_at: position.updatedAt,
    })),
  };
}

export function serializeSettingLibrary(library) {
  return JSON.stringify(toSettingLibraryExport(library), null, 2);
}

function currentPosition(value) {
  return POSITIONS.has(value) ? value : null;
}

function promptPlacement(anchor, side) {
  if (POSITIONS.has(anchor)) return {
    anchor,
    side: side === "after_setting_position" ? "after_setting_position" : "before_setting_position",
  };
  return { anchor: "insert_point_1", side: "before_setting_position" };
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
  const sendGroupIds = new Map();
  for (const source of picked) {
    if (source.sendGroupId && !sendGroupIds.has(source.sendGroupId)) sendGroupIds.set(source.sendGroupId, createId('send-group'));
    const groupId = source.groupId ? resolved.get(source.groupId) || destination : destination;
    const title = availableTitle(groupId, source.title, entries);
    const order = availableOrder(source, entries);
    if (title !== (source.title.trim() || "未命名设定")) renamedEntryCount += 1;
    if (order !== source.order) reorderedEntryCount += 1;
    const timestamp = new Date().toISOString();
    entries.push({
      ...clone(source), id: createId("setting"), title, groupId, order, viewOrder: ++viewOrder,
      sendGroupId: sendGroupIds.get(source.sendGroupId) || '',
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

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function bookMetadata(book) {
  const metadata = clone(record(book));
  delete metadata.entries;
  if (metadata.extensions) delete metadata.extensions.eleckoi;
  return metadata;
}

function availableTransferName(requested, existing, maxLength, fallback) {
  const base = requested.trim().slice(0, maxLength) || fallback;
  const used = new Set(existing.map(name => name.trim().toLocaleLowerCase()));
  let name = base, index = 2;
  while (used.has(name.toLocaleLowerCase())) {
    const suffix = ` (${index++})`;
    name = `${base.slice(0, maxLength - suffix.length)}${suffix}`;
  }
  return name;
}

function worldbookValue(values, expected, preserveNative) {
  const supplied = values.filter(value => value !== undefined);
  return (preserveNative ? supplied.find(value => JSON.stringify(value) !== JSON.stringify(expected)) : undefined)
    ?? supplied[0] ?? expected;
}

function applyWorldbookFields(entry, item, preserveNativePlacement = false) {
  const extensions = record(item.extensions);
  const baseline = preserveNativePlacement ? worldbookEntry(entry, 0) : null;
  const baselineExtensions = record(baseline?.extensions);
  const secondary = stringList(worldbookValue([item.keysecondary, item.secondary_keys], entry.conditionKeywords, preserveNativePlacement));
  const logic = integer(worldbookValue([item.selectiveLogic, extensions.selectiveLogic], baseline?.selectiveLogic ?? baselineExtensions.selectiveLogic, preserveNativePlacement));
  const rawRole = worldbookValue([item.role, extensions.role], baseline?.role ?? baselineExtensions.role, preserveNativePlacement);
  const role = ["system", "user", "assistant"].includes(rawRole) ? rawRole : ["system", "user", "assistant"][rawRole];
  const wirePosition = worldbookValue([item.position, extensions.position], baseline?.position ?? baselineExtensions.position, preserveNativePlacement);
  const position = currentPosition(wirePosition) || (Number.isInteger(wirePosition)
    ? ["insert_point_1", "insert_point_2", "insert_point_3", "insert_point_4", "insert_point_3", "insert_point_1", "insert_point_2"][wirePosition] : null);
  const order = worldbookValue([item.order, item.insertion_order, extensions.insertion_order], entry.order, preserveNativePlacement);
  const positionChanged = !baseline || wirePosition !== (baseline.position ?? record(baseline.extensions).position);
  const roleChanged = !baseline || rawRole !== (baseline.role ?? record(baseline.extensions).role);
  return { ...entry,
    title: text(worldbookValue([item.comment, item.name], entry.title, preserveNativePlacement), entry.title).slice(0, 120), content: text(item.content, entry.content),
    keywords: stringList(worldbookValue([item.key, item.keys], entry.keywords, preserveNativePlacement)), conditionKeywords: secondary,
    keywordCondition: !secondary.length ? "none" : logic === 1 ? "not_all" : logic === 2 ? "not_any" : logic === 3 ? "all" : "any",
    keywordScanDepth: Math.max(0, integer(worldbookValue([item.scanDepth, item.scan_depth, extensions.scan_depth], entry.keywordScanDepth, preserveNativePlacement), entry.keywordScanDepth)),
    keywordUseRegex: bool(item.use_regex, entry.keywordUseRegex),
    keywordIgnoreCase: !bool(worldbookValue([item.case_sensitive, extensions.case_sensitive], !entry.keywordIgnoreCase, preserveNativePlacement), !entry.keywordIgnoreCase),
    keywordWholeWord: bool(worldbookValue([item.match_whole_words, extensions.match_whole_words], entry.keywordWholeWord, preserveNativePlacement), entry.keywordWholeWord),
    triggerMode: bool(item.constant) ? "always" : entry.triggerMode === "always" ? "agent_tool" : entry.triggerMode,
    enabled: bool(worldbookValue([typeof item.disable === "boolean" ? !item.disable : undefined, item.enabled], entry.enabled, preserveNativePlacement), entry.enabled),
    order: Math.max(1, integer(order, entry.order)),
    ...(positionChanged && position ? { position, ...(preserveNativePlacement ? { promptPositionId: "" } : {}) } : {}),
    ...(roleChanged && role ? { insertRole: role } : {}),
    sillyTavern: clone(item),
  };
}

/** Parse either supported file format while preserving worldbook extension fields. */
export function parseSettingLibraryTransfer(json, { filename = "", format = "auto" } = {}) {
  let source;
  try { source = JSON.parse(json); }
  catch (error) { throw new Error("JSON 文件无法读取。", { cause: error }); }
  const book = source?.data?.character_book || source?.character_book || source;
  const embedded = record(record(book?.extensions).eleckoi);
  if (!source?.format && embedded.format === SETTING_LIBRARY_EXPORT_FORMAT) {
    if (format === "eleckoi") throw new Error("请选择 ElecKoi 导出的设定库文件。");
    const imported = parseElecKoiExport(embedded);
    imported.name = text(book.name, imported.name);
    const items = worldBookEntries(book), nativeEntries = new Map(imported.entries.map(entry => [entry.id, entry]));
    let rootGroupId = text(embedded.root_group_id);
    let root = imported.groups.find(group => group.id === rootGroupId);
    if (root) { root.name = imported.name.slice(0, 80); root.sillyTavern = bookMetadata(book); }
    if (!root) {
      rootGroupId = createId("tavern-world-book");
      const timestamp = new Date().toISOString();
      root = { id: rootGroupId, name: imported.name.slice(0, 80), parentId: "", order: 1, treeViewOrder: 1,
        createdAt: timestamp, updatedAt: timestamp, sillyTavern: bookMetadata(book) };
      imported.groups = [root, ...imported.groups.map(group => ({ ...group, parentId: group.parentId || rootGroupId }))];
      imported.expandedGroupIds = [rootGroupId, ...imported.expandedGroupIds];
    }
    const newEntries = items.length ? parseSillyTavernExport({ ...book, entries: items }).entries : [];
    const usedIds = new Set();
    imported.entries = items.map((item, index) => {
      const id = record(item.extensions).eleckoi_entry_id, entry = nativeEntries.get(id);
      if (entry && !usedIds.has(id)) {
        usedIds.add(id);
        return applyWorldbookFields({ ...entry, groupId: entry.groupId || rootGroupId }, item, true);
      }
      return applyWorldbookFields({ ...newEntries[index], groupId: rootGroupId }, item);
    });
    return { ...imported, sourceFormat: "sillytavern", rootGroupId };
  }
  const imported = parseSettingLibraryFile(json, format);
  if (source.format === SETTING_LIBRARY_EXPORT_FORMAT) return { ...imported, sourceFormat: "eleckoi", rootGroupId: text(source.root_group_id) };
  const name = text(book.name) || text(source.name) || filename.replace(/\.[^.]+$/, "") || imported.name;
  const items = worldBookEntries(book);
  const root = imported.groups[0];
  root.name = name.slice(0, 80);
  root.sillyTavern = bookMetadata(book);
  return { ...imported, name, sourceFormat: "sillytavern", rootGroupId: root.id,
    entries: imported.entries.map((entry, index) => applyWorldbookFields(entry, items[index])) };
}

/** Append an imported draft; the caller's existing save action owns persistence. */
export function mergeSettingLibraryTransfer(library, imported, { targetGroupId = "" } = {}) {
  if (targetGroupId && !library.groups.some(group => group.id === targetGroupId)) throw new Error("导入目标文件夹不存在。");
  for (const values of [imported.entries, imported.groups, imported.promptPositions]) {
    if (new Set(values.map(value => value.id)).size !== values.length) throw new Error("导入文件中存在重复编号。");
  }
  const entryIds = new Map(imported.entries.filter(entry => entry.kind === "normal" && !PINNED_ENTRY_IDS.has(entry.id))
    .map(entry => [entry.id, createId("setting")]));
  const flattenRoot = targetGroupId ? imported.rootGroupId : "";
  const groupIds = new Map(imported.groups.map(group => [group.id, group.id === flattenRoot ? targetGroupId : createId("group")]));
  const positionIds = new Map(imported.promptPositions.map(position => [position.id, createId("prompt-position")]));
  const sendGroupIds = new Map(imported.entries.filter(entry => entry.sendGroupId)
    .map(entry => [entry.sendGroupId, createId('send-group')]));
  if (imported.entries.some(entry => entry.promptPositionId && !positionIds.has(entry.promptPositionId))) throw new Error("导入条目引用了不存在的自定义位置。");
  const groups = clone(library.groups), entries = clone(library.entries);
  if (flattenRoot) {
    const source = imported.groups.find(group => group.id === flattenRoot);
    const target = groups.find(group => group.id === targetGroupId);
    if (source?.mergeSend) target.mergeSend = true;
    if (source?.sillyTavern) target.sillyTavern = { ...clone(source.sillyTavern), ...record(target.sillyTavern),
      extensions: { ...record(source.sillyTavern.extensions), ...record(target.sillyTavern?.extensions) } };
  }
  const offset = nextTreeViewOrder(targetGroupId, groups, entries);
  for (const source of imported.groups) {
    if (source.id === flattenRoot) continue;
    const parentId = groupIds.get(source.parentId) || targetGroupId;
    const name = availableTransferName(source.name, groups.filter(group => group.parentId === parentId).map(group => group.name), 80, "未命名文件夹");
    groups.push({ ...clone(source), id: groupIds.get(source.id), name, parentId,
      treeViewOrder: source.parentId && source.parentId !== flattenRoot ? source.treeViewOrder : offset + source.treeViewOrder });
  }
  const viewOffset = Math.max(0, ...entries.map(entry => entry.viewOrder));
  for (const source of imported.entries) {
    if (!entryIds.has(source.id)) continue;
    const groupId = groupIds.get(source.groupId) || targetGroupId;
    const title = availableTransferName(source.title, entries.filter(entry => entry.groupId === groupId).map(entry => entry.title), 120, "未命名设定");
    entries.push({ ...clone(source), id: entryIds.get(source.id), title, groupId,
      sendGroupId: sendGroupIds.get(source.sendGroupId) || '',
      promptPositionId: source.promptPositionId ? positionIds.get(source.promptPositionId) || "" : "",
      viewOrder: viewOffset + source.viewOrder,
      treeViewOrder: groupId === targetGroupId ? offset + source.treeViewOrder : source.treeViewOrder });
  }
  return { ...library, entries, groups,
    promptPositions: [...clone(library.promptPositions), ...imported.promptPositions.map(position => ({ ...clone(position), id: positionIds.get(position.id) }))],
    expandedGroupIds: [...new Set([...library.expandedGroupIds, ...imported.expandedGroupIds.map(id => groupIds.get(id)).filter(Boolean)])] };
}

function transferSubset(library, groupId) {
  if (!groupId) return { ...library, entries: clone(library.entries), groups: clone(library.groups), promptPositions: clone(library.promptPositions) };
  const root = library.groups.find(group => group.id === groupId);
  if (!root) throw new Error("导出文件夹不存在。");
  const ids = new Set([groupId]);
  let count;
  do { count = ids.size; for (const group of library.groups) if (ids.has(group.parentId)) ids.add(group.id); } while (count !== ids.size);
  const entries = library.entries.filter(entry => ids.has(entry.groupId) && entry.kind === "normal").map(clone);
  const referencedPositions = new Set(entries.map(entry => entry.promptPositionId).filter(Boolean));
  return { ...library, name: root.name, entries,
    groups: library.groups.filter(group => ids.has(group.id)).map(group => ({ ...clone(group), parentId: group.id === groupId ? "" : group.parentId })),
    promptPositions: library.promptPositions.filter(position => referencedPositions.has(position.id)).map(clone),
    expandedGroupIds: library.expandedGroupIds.filter(id => ids.has(id)) };
}

function worldbookEntry(entry, index) {
  const source = record(entry.sillyTavern), extensions = clone(record(source.extensions));
  const sourceSecondary = stringList(source.secondary_keys ?? source.keysecondary);
  const sourceLogic = integer(source.selectiveLogic ?? extensions.selectiveLogic);
  const sourceCondition = !sourceSecondary.length ? "none" : sourceLogic === 1 ? "not_all" : sourceLogic === 2 ? "not_any" : sourceLogic === 3 ? "all" : "any";
  if (entry.keywordCondition !== sourceCondition || !Object.hasOwn(extensions, "selectiveLogic")) {
    extensions.selectiveLogic = entry.keywordCondition === "not_all" ? 1 : entry.keywordCondition === "not_any" ? 2 : entry.keywordCondition === "all" ? 3 : 0;
  }
  if (Object.hasOwn(source, "selectiveLogic")) extensions.selectiveLogic = entry.keywordCondition === sourceCondition
    ? sourceLogic : entry.keywordCondition === "not_all" ? 1 : entry.keywordCondition === "not_any" ? 2 : entry.keywordCondition === "all" ? 3 : 0;
  extensions.eleckoi_entry_id = entry.id;
  const result = { ...clone(source), uid: index, comment: entry.title, content: entry.content,
    key: [...entry.keywords], keysecondary: [...entry.conditionKeywords],
    constant: entry.triggerMode === "always", disable: !entry.enabled,
    selective: entry.keywordCondition === sourceCondition && JSON.stringify(entry.conditionKeywords) === JSON.stringify(sourceSecondary)
      ? source.selective ?? entry.conditionKeywords.length > 0 : entry.conditionKeywords.length > 0 && entry.keywordCondition !== "none",
    order: entry.order, insertion_order: entry.order, scanDepth: entry.keywordScanDepth,
    use_regex: entry.keywordUseRegex, case_sensitive: !entry.keywordIgnoreCase, match_whole_words: entry.keywordWholeWord,
    extensions };
  if (Object.hasOwn(source, "name")) result.name = entry.title;
  if (Object.hasOwn(source, "keys")) result.keys = [...entry.keywords];
  if (Object.hasOwn(source, "secondary_keys")) result.secondary_keys = [...entry.conditionKeywords];
  if (Object.hasOwn(source, "enabled")) result.enabled = entry.enabled;
  if (Object.hasOwn(source, "selectiveLogic")) result.selectiveLogic = extensions.selectiveLogic;
  if (Object.hasOwn(source, "scan_depth")) result.scan_depth = entry.keywordScanDepth;
  if (Object.hasOwn(extensions, "scan_depth")) extensions.scan_depth = entry.keywordScanDepth;
  if (Object.hasOwn(extensions, "insertion_order")) extensions.insertion_order = entry.order;
  if (Object.hasOwn(extensions, "case_sensitive")) extensions.case_sensitive = !entry.keywordIgnoreCase;
  if (Object.hasOwn(extensions, "match_whole_words")) extensions.match_whole_words = entry.keywordWholeWord;
  const sourcePosition = source.position ?? extensions.position;
  const mappedPosition = currentPosition(sourcePosition) || ["insert_point_1", "insert_point_2", "insert_point_3", "insert_point_4", "insert_point_3", "insert_point_1", "insert_point_2"][sourcePosition];
  result.position = sourcePosition !== undefined && mappedPosition === entry.position ? sourcePosition : entry.position === "insert_point_2" ? 1 :
    ["insert_point_3", "insert_point_4", "insert_point_5"].includes(entry.position) ? 4 : 0;
  if (Object.hasOwn(extensions, "position")) extensions.position = result.position;
  const sourceRole = source.role ?? extensions.role;
  const mappedRole = ["system", "user", "assistant"].includes(sourceRole) ? sourceRole : ["system", "user", "assistant"][sourceRole];
  if (sourceRole !== undefined || result.position === 4) result.role = mappedRole === entry.insertRole
    ? sourceRole : ["system", "user", "assistant"].indexOf(entry.insertRole);
  if (Object.hasOwn(extensions, "role")) extensions.role = result.role;
  return result;
}

/** Export one folder recursively or the active library without unrelated versions. */
export function exportSettingLibraryTransfer(library, { groupId = "", format = "eleckoi" } = {}) {
  if (!["eleckoi", "sillytavern"].includes(format)) throw new Error("选择有效的设定库导出格式。");
  const subset = transferSubset(library, groupId);
  const native = { ...toSettingLibraryExport(subset), ...(groupId ? { root_group_id: groupId } : {}) };
  const safeName = (subset.name || "设定库").replace(/[\\/:*?"<>|]/g, "_");
  if (format === "eleckoi") return { filename: `${safeName}.eleckoi.json`, value: native };
  const root = subset.groups.find(group => group.id === groupId);
  const source = record(root?.sillyTavern);
  const normal = subset.entries.filter(entry => entry.kind === "normal");
  native.entries = normal.map(entryToJson);
  return { filename: `${safeName}.worldbook.json`, value: { ...clone(source), name: subset.name,
    extensions: { ...clone(record(source.extensions)), eleckoi: native },
    entries: Object.fromEntries(normal.map((entry, index) => [index, worldbookEntry(entry, index)])) } };
}
