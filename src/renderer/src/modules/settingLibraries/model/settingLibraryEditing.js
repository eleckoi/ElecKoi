export const FIXED_ENTRY_IDS = new Set([
  "fixed-opening-assistant",
  "built-in-roleplay-history-compaction",
]);

export const PINNED_ENTRY_IDS = new Set([
  ...FIXED_ENTRY_IDS,
  "built-in-hidden-tool-timeline",
]);

export function createId(prefix) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function uniqueName(base, names) {
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

export function createGroupDraft(parentId, order, names) {
  const timestamp = new Date().toISOString();
  return {
    id: createId("group"),
    name: uniqueName("新建文件夹", names),
    parentId,
    order,
    treeViewOrder: order,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createEntryDraft(groupId, order, entries, draftKind = "standard") {
  const timestamp = new Date().toISOString();
  const siblingNames = new Set(entries.filter((entry) => entry.groupId === groupId).map((entry) => entry.title));
  const isReference = draftKind === "reference";
  return {
    id: createId("setting"),
    title: uniqueName("新建设定", siblingNames),
    iconId: isReference ? "link" : "",
    kind: "normal",
    groupId,
    content: "",
    openingMessages: [],
    defaultOpeningMessageId: "",
    agentSelectionHint: "",
    agentReadStrategy: isReference ? "variable_condition" : "normal",
    agentReadCondition: "",
    dynamicMode: isReference ? "ejs_reference" : "single_condition",
    keywords: [],
    keywordScanDepth: 1,
    conditionKeywords: [],
    keywordCondition: "none",
    keywordUseRegex: false,
    keywordIgnoreCase: true,
    keywordWholeWord: false,
    keywordRecursionDepth: 0,
    triggerMode: isReference ? "agent_tool" : "always",
    enabled: isReference,
    position: "after_instructions",
    promptPositionId: "",
    insertRole: "user",
    order: 1,
    viewOrder: Math.max(0, ...entries.map((entry) => entry.viewOrder)) + 1,
    groupViewOrder: groupId
      ? Math.max(0, ...entries.filter((entry) => entry.groupId === groupId).map((entry) => entry.groupViewOrder)) + 1
      : 0,
    treeViewOrder: order,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function treeParentId(node) {
  return node.kind === "group" ? node.value.parentId : node.value.groupId;
}

function orderedTreeChildren(library, parentId) {
  return [
    ...library.groups
      .filter((group) => group.parentId === parentId)
      .map((value) => ({ kind: "group", id: value.id, value })),
    ...library.entries
      .filter((entry) => !PINNED_ENTRY_IDS.has(entry.id) && entry.groupId === parentId)
      .map((value) => ({ kind: "entry", id: value.id, value })),
  ].sort((left, right) => left.value.treeViewOrder - right.value.treeViewOrder || left.id.localeCompare(right.id));
}

function descendantGroupIds(groups, groupId) {
  const ids = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) {
      if (ids.has(group.parentId) && !ids.has(group.id)) {
        ids.add(group.id);
        changed = true;
      }
    }
  }
  return ids;
}

/**
 * Apply a controlled tree move after the drag library has resolved the drop
 * target. `destinationIndex` is the post-removal index among movable siblings.
 */
export function moveTreeNode(library, moved, destinationParentId, destinationIndex) {
  const movedValue = moved.kind === "group"
    ? library.groups.find((group) => group.id === moved.id)
    : library.entries.find((entry) => entry.id === moved.id);
  if (!movedValue || PINNED_ENTRY_IDS.has(moved.id)) return library;
  if (
    moved.kind === "group" &&
    destinationParentId &&
    descendantGroupIds(library.groups, moved.id).has(destinationParentId)
  ) return library;

  const sourceParentId = treeParentId({ ...moved, value: movedValue });
  const movedNode = { ...moved, value: movedValue };
  const destinationSiblings = orderedTreeChildren(library, destinationParentId)
    .filter((node) => !(node.kind === moved.kind && node.id === moved.id));
  destinationSiblings.splice(
    Math.max(0, Math.min(destinationIndex, destinationSiblings.length)),
    0,
    movedNode,
  );
  const destinationOrder = new Map(destinationSiblings.map((node, index) => [`${node.kind}:${node.id}`, index + 1]));

  const sourceOrder = sourceParentId === destinationParentId
    ? new Map()
    : new Map(orderedTreeChildren(library, sourceParentId)
      .filter((node) => !(node.kind === moved.kind && node.id === moved.id))
      .map((node, index) => [`${node.kind}:${node.id}`, index + 1]));

  return {
    ...library,
    groups: library.groups.map((group) => {
      if (moved.kind === "group" && group.id === moved.id) {
        return {
          ...group,
          parentId: destinationParentId,
          treeViewOrder: destinationOrder.get(`group:${group.id}`) || group.treeViewOrder,
        };
      }
      const treeViewOrder = destinationOrder.get(`group:${group.id}`) || sourceOrder.get(`group:${group.id}`);
      return treeViewOrder ? { ...group, treeViewOrder } : group;
    }),
    entries: library.entries.map((entry) => {
      if (moved.kind === "entry" && entry.id === moved.id) {
        return {
          ...entry,
          groupId: destinationParentId,
          treeViewOrder: destinationOrder.get(`entry:${entry.id}`) || entry.treeViewOrder,
        };
      }
      const treeViewOrder = destinationOrder.get(`entry:${entry.id}`) || sourceOrder.get(`entry:${entry.id}`);
      return treeViewOrder ? { ...entry, treeViewOrder } : entry;
    }),
  };
}

export function primaryFirstOpeningMessages(entry) {
  const messages = entry.openingMessages?.length
    ? entry.openingMessages
    : [{ id: "opening-default", title: "默认开场", content: entry.content || "", initialVariableStateJson: "" }];
  const primary = messages.find((message) => message.id === entry.defaultOpeningMessageId) || messages[0];
  return [primary, ...messages.filter((message) => message.id !== primary.id)];
}

function withOpeningMessages(entry, messages, defaultMessageId) {
  const primary = messages.find((message) => message.id === defaultMessageId) || messages[0];
  return {
    ...entry,
    openingMessages: messages,
    defaultOpeningMessageId: primary.id,
    content: primary.content,
  };
}

export function createBackupOpening(entry) {
  const messages = primaryFirstOpeningMessages(entry);
  const next = { id: createId("opening"), title: "", content: "", initialVariableStateJson: "" };
  return { entry: withOpeningMessages(entry, [...messages, next], messages[0].id), createdId: next.id };
}

export function updateOpening(entry, messageId, patch) {
  const messages = primaryFirstOpeningMessages(entry).map((message) => message.id === messageId
    ? { ...message, ...patch, title: Object.hasOwn(patch, "title") ? patch.title.slice(0, 40) : message.title }
    : message);
  return withOpeningMessages(entry, messages, messages[0].id);
}

export function duplicateOpening(entry, messageId) {
  const messages = primaryFirstOpeningMessages(entry);
  const sourceIndex = messages.findIndex((message) => message.id === messageId);
  if (sourceIndex < 0) return { entry, createdId: "" };
  const source = messages[sourceIndex];
  const copy = {
    ...source,
    id: createId("opening"),
    title: source.title.trim() ? `${source.title} 副本`.slice(0, 40) : "",
  };
  const next = [...messages];
  next.splice(sourceIndex + 1, 0, copy);
  return { entry: withOpeningMessages(entry, next, messages[0].id), createdId: copy.id };
}

export function moveBackupOpening(entry, messageId, offset) {
  const messages = primaryFirstOpeningMessages(entry);
  const fromIndex = messages.findIndex((message) => message.id === messageId);
  const toIndex = fromIndex + offset;
  if (fromIndex <= 0 || toIndex < 1 || toIndex >= messages.length) return entry;
  const next = [...messages];
  next.splice(toIndex, 0, next.splice(fromIndex, 1)[0]);
  return withOpeningMessages(entry, next, messages[0].id);
}

export function deleteOpening(entry, messageId) {
  const messages = primaryFirstOpeningMessages(entry);
  if (messages.length <= 1) return entry;
  const remaining = messages.filter((message) => message.id !== messageId);
  const defaultMessageId = messageId === messages[0].id ? remaining[0].id : messages[0].id;
  return withOpeningMessages(entry, remaining, defaultMessageId);
}

export const SETTING_LIBRARY_POSITION_OPTIONS = [
  { value: "instructions", label: "系统指令" },
  { value: "after_instructions", label: "系统指令之后" },
  { value: "before_history", label: "聊天记录之前" },
  { value: "after_history", label: "聊天记录之后" },
  { value: "before_latest_user_input", label: "用户最新输入之前" },
  { value: "after_latest_user_input", label: "用户最新输入之后" },
  { value: "before_tool_flow", label: "工具调用流程之前" },
  { value: "after_tool_flow", label: "工具调用流程之后" },
];

export const SETTING_LIBRARY_PLACEMENT_ROWS = [
  { type: "position", value: "instructions", card: true },
  { type: "position", value: "after_instructions" },
  { type: "position", value: "before_history" },
  { type: "context", id: "history", label: "聊天记录" },
  { type: "position", value: "after_history" },
  { type: "position", value: "before_latest_user_input" },
  { type: "context", id: "latest-user-input", label: "用户最新输入" },
  { type: "position", value: "after_latest_user_input" },
  { type: "position", value: "before_tool_flow" },
  { type: "context", id: "tool-flow", label: "工具调用流程" },
  { type: "position", value: "after_tool_flow" },
];

export function positionOrderScope(entries, position, promptPositionId = "") {
  const scope = promptPositionId || position;
  return entries
    .filter((entry) => (entry.promptPositionId || entry.position || "") === scope)
    .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
}

export function moveEntryToPosition(entries, entryId, targetPosition, targetPromptPositionId = "") {
  const moving = entries.find((entry) => entry.id === entryId);
  if (!moving || FIXED_ENTRY_IDS.has(entryId) || moving.triggerMode !== "always") return entries;

  const targetScope = positionOrderScope(entries, targetPosition, targetPromptPositionId)
    .filter((entry) => entry.id !== entryId && !FIXED_ENTRY_IDS.has(entry.id) && entry.triggerMode === "always");
  targetScope.push({
    ...moving,
    position: targetPosition,
    promptPositionId: targetPromptPositionId,
    insertRole: targetPosition === "instructions" ? "system" : moving.insertRole === "system" ? "user" : moving.insertRole,
  });
  const targetOrders = new Map(targetScope.map((entry, index) => [entry.id, index + 1]));

  const sourceScope = moving.position && (moving.promptPositionId || moving.position) !== (targetPromptPositionId || targetPosition)
    ? positionOrderScope(entries, moving.position, moving.promptPositionId)
      .filter((entry) => entry.id !== entryId && !FIXED_ENTRY_IDS.has(entry.id) && entry.triggerMode === "always")
    : [];
  const sourceOrders = new Map(sourceScope.map((entry, index) => [entry.id, index + 1]));

  return entries.map((entry) => {
    if (entry.id === entryId) {
      return {
        ...entry,
        position: targetPosition,
        promptPositionId: targetPromptPositionId,
        insertRole: targetPosition === "instructions" ? "system" : entry.insertRole === "system" ? "user" : entry.insertRole,
        order: targetOrders.get(entry.id) || 1,
      };
    }
    if (targetOrders.has(entry.id)) return { ...entry, order: targetOrders.get(entry.id) };
    if (sourceOrders.has(entry.id)) return { ...entry, order: sourceOrders.get(entry.id) };
    return entry;
  });
}
