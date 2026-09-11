import { createId, SETTING_LIBRARY_PLACEMENT_ROWS, SETTING_LIBRARY_POSITION_OPTIONS } from './settingLibraryEditing.js';

const ANCHOR_ORDER = new Map(SETTING_LIBRARY_POSITION_OPTIONS.map((option, index) => [option.value, index]));

const MANAGEMENT_FIXED_ROWS = [
  { type: 'instructions', key: 'fixed:instructions', label: '系统指令' },
  { type: 'anchor', key: 'anchor:after-instructions', label: '系统指令之后', anchor: 'after_instructions' },
  { type: 'context', key: 'fixed-group:history', label: '聊天记录', before: 'before_history', after: 'after_history' },
  { type: 'context', key: 'fixed-group:latest-user-input', label: '用户最新输入', before: 'before_latest_user_input', after: 'after_latest_user_input' },
  { type: 'context', key: 'fixed-group:tool-flow', label: '工具调用流程', before: 'before_tool_flow', after: 'after_tool_flow' },
];

export function normalizeCustomPositions(positions) {
  const ordered = [...positions].sort((left, right) => (
    (ANCHOR_ORDER.get(left.anchor) ?? Number.MAX_SAFE_INTEGER) - (ANCHOR_ORDER.get(right.anchor) ?? Number.MAX_SAFE_INTEGER)
    || left.order - right.order
    || left.id.localeCompare(right.id)
  ));
  const counts = new Map();
  return ordered.map((position) => {
    const order = (counts.get(position.anchor) || 0) + 1;
    counts.set(position.anchor, order);
    return position.order === order ? position : { ...position, order };
  });
}

export function createPositionDraft(positions, position = null, anchor = 'after_instructions') {
  if (position) return { ...position };
  const timestamp = new Date().toISOString();
  const safeAnchor = ANCHOR_ORDER.has(anchor) && anchor !== 'instructions' ? anchor : 'after_instructions';
  return {
    id: createId('prompt-position'),
    name: '',
    anchor: safeAnchor,
    order: positions.filter((item) => item.anchor === safeAnchor).length + 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function savePositionDraft(positions, entries, draft, selectedEntryId = '') {
  const name = draft.name.trim();
  if (!name) throw new Error('填写位置名称');
  if (name.length > 60) throw new Error('位置名称最多 60 个字符');
  if (!SETTING_LIBRARY_POSITION_OPTIONS.some((option) => option.value === draft.anchor)) throw new Error('选择有效的插入位置');
  const position = { ...draft, name, updatedAt: new Date().toISOString() };
  const exists = positions.some((item) => item.id === draft.id);
  return {
    positions: normalizeCustomPositions(exists ? positions.map((item) => item.id === draft.id ? position : item) : [...positions, position]),
    entries: entries.map((entry) => {
      if (entry.promptPositionId === draft.id) return { ...entry, position: draft.anchor };
      if (!exists && entry.id === selectedEntryId) {
        return { ...entry, position: draft.anchor, promptPositionId: draft.id };
      }
      return entry;
    }),
  };
}

export function removeCustomPosition(positions, entries, position) {
  return {
    positions: positions.filter((item) => item.id !== position.id),
    entries: entries.map((entry) => entry.promptPositionId === position.id ? { ...entry, promptPositionId: '', position: position.anchor } : entry),
  };
}

export function positionPickerRows(positions) {
  return SETTING_LIBRARY_PLACEMENT_ROWS.flatMap((row) => [row, ...positions
    .filter((position) => row.type === 'position' && position.anchor === row.value)
    .sort((a, b) => a.order - b.order)
    .map((position) => ({ type: 'custom', value: position.anchor, position }))]);
}

export function positionManagementRows(positions) {
  const byAnchor = new Map();
  for (const position of normalizeCustomPositions(positions)) {
    const group = byAnchor.get(position.anchor) || [];
    group.push({ type: 'custom', key: `custom:${position.id}`, position });
    byAnchor.set(position.anchor, group);
  }
  const rows = [];
  const appendCustom = (anchor) => rows.push(...(byAnchor.get(anchor) || []));
  rows.push(MANAGEMENT_FIXED_ROWS[0], MANAGEMENT_FIXED_ROWS[1]);
  appendCustom('after_instructions');
  appendCustom('before_history');
  rows.push(MANAGEMENT_FIXED_ROWS[2]);
  appendCustom('after_history');
  appendCustom('before_latest_user_input');
  rows.push(MANAGEMENT_FIXED_ROWS[3]);
  appendCustom('after_latest_user_input');
  appendCustom('before_tool_flow');
  rows.push(MANAGEMENT_FIXED_ROWS[4]);
  appendCustom('after_tool_flow');
  return rows;
}

export function moveCustomPosition(positions, entries, movingId, targetKey, movingDown) {
  const moving = positions.find((position) => position.id === movingId);
  const target = positionManagementRows(positions).find((row) => row.key === targetKey);
  if (!moving || !target || target.key === `custom:${movingId}`) return { positions, entries };

  let targetAnchor = 'after_instructions';
  if (target.type === 'custom') targetAnchor = target.position.anchor;
  else if (target.type === 'context') targetAnchor = movingDown ? target.after : target.before;
  else if (target.type === 'anchor') targetAnchor = target.anchor;

  const without = positions.filter((position) => position.id !== movingId);
  const sameAnchor = without
    .filter((position) => position.anchor === targetAnchor)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  let targetIndex = movingDown ? sameAnchor.length : 0;
  if (target.type === 'custom') {
    const index = sameAnchor.findIndex((position) => position.id === target.position.id);
    targetIndex = index < 0 ? sameAnchor.length : index + (movingDown ? 1 : 0);
  }
  sameAnchor.splice(Math.max(0, Math.min(targetIndex, sameAnchor.length)), 0, {
    ...moving,
    anchor: targetAnchor,
    updatedAt: new Date().toISOString(),
  });
  const replaced = new Set(sameAnchor.map((position) => position.id));
  const nextPositions = normalizeCustomPositions([...without.filter((position) => !replaced.has(position.id)), ...sameAnchor]);
  const placementKey = (items) => normalizeCustomPositions(items).map((position) => `${position.id}:${position.anchor}:${position.order}`).join('|');
  if (placementKey(nextPositions) === placementKey(positions)) return { positions, entries };
  return {
    positions: nextPositions,
    entries: entries.map((entry) => entry.promptPositionId === movingId ? { ...entry, position: targetAnchor } : entry),
  };
}
