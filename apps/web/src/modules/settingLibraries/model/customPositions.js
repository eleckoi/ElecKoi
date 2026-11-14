import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { createId, SETTING_LIBRARY_PLACEMENT_ROWS, SETTING_LIBRARY_POSITION_OPTIONS } from './settingLibraryEditing.js';

const ANCHOR_ORDER = new Map(SETTING_LIBRARY_POSITION_OPTIONS.map((option, index) => [option.value, index]));

const MANAGEMENT_FIXED_ROWS = [
  { type: 'instructions', key: 'fixed:instructions', label: '系统指令' },
  { type: 'slot', key: 'slot:insert_point_1', label: '设定插入点 1', anchor: 'insert_point_1' },
  { type: 'context', key: 'fixed-group:cache', label: '缓存设定区', before: 'insert_point_1', after: 'insert_point_2' },
  { type: 'slot', key: 'slot:insert_point_2', label: '设定插入点 2', anchor: 'insert_point_2' },
  { type: 'context', key: 'fixed-group:history', label: '聊天记录', before: 'insert_point_2', after: 'insert_point_3' },
  { type: 'slot', key: 'slot:insert_point_3', label: '设定插入点 3', anchor: 'insert_point_3' },
  { type: 'context', key: 'fixed-group:latest-user-input', label: '用户最新输入', before: 'insert_point_3', after: 'insert_point_4' },
  { type: 'slot', key: 'slot:insert_point_4', label: '设定插入点 4', anchor: 'insert_point_4' },
  { type: 'context', key: 'fixed-group:tool-flow', label: '工具调用流程', before: 'insert_point_4', after: 'insert_point_5' },
  { type: 'slot', key: 'slot:insert_point_5', label: '设定插入点 5', anchor: 'insert_point_5' },
];

function normalizeCustomPositions(positions) {
  const ordered = [...positions].sort((left, right) => (
    (ANCHOR_ORDER.get(left.anchor) ?? Number.MAX_SAFE_INTEGER) - (ANCHOR_ORDER.get(right.anchor) ?? Number.MAX_SAFE_INTEGER)
    || left.side.localeCompare(right.side)
    || left.order - right.order
    || left.id.localeCompare(right.id)
  ));
  const counts = new Map();
  return ordered.map((position) => {
    const key = `${position.anchor}:${position.side}`;
    const order = (counts.get(key) || 0) + 1;
    counts.set(key, order);
    return position.order === order ? position : { ...position, order };
  });
}

export function createPositionDraft(positions, position = null, anchor = 'insert_point_1') {
  if (position) return { ...position };
  const timestamp = new Date().toISOString();
  const safeAnchor = ANCHOR_ORDER.has(anchor) && anchor !== 'instructions' ? anchor : 'insert_point_1';
  return {
    id: createId('prompt-position'),
    name: '',
    anchor: safeAnchor,
    side: 'before_setting_position',
    order: positions.filter((item) => item.anchor === safeAnchor && item.side === 'before_setting_position').length + 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function savePositionDraft(positions, entries, draft, selectedEntryId = '') {
  const name = draft.name.trim();
  if (!name) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '填写位置名称', { field: '位置名称' });
  if (!SETTING_LIBRARY_POSITION_OPTIONS.some((option) => option.value === draft.anchor)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, '选择有效的插入位置', { field: '插入位置' });
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
    .filter((position) => row.type === 'position' && position.anchor === row.value && position.side === 'after_setting_position')
    .sort((a, b) => a.order - b.order)
    .map((position) => ({ type: 'custom', value: position.anchor, position }))])
    .flatMap((row) => row.type !== 'position' ? [row] : [
      ...positions.filter((position) => position.anchor === row.value && position.side === 'before_setting_position')
        .sort((a, b) => a.order - b.order)
        .map((position) => ({ type: 'custom', value: position.anchor, position })),
      row,
    ]);
}

export function fixedPlacementRowSelectable(row, allowCustomPromptPositions) {
  return row.type === 'position' && (row.value === 'instructions' || !allowCustomPromptPositions);
}

export function positionManagementRows(positions) {
  const byPlacement = new Map();
  for (const position of normalizeCustomPositions(positions)) {
    const key = `${position.anchor}:${position.side}`;
    const group = byPlacement.get(key) || [];
    group.push({ type: 'custom', key: `custom:${position.id}`, position });
    byPlacement.set(key, group);
  }
  const rows = [];
  const appendCustom = (anchor, side) => rows.push(...(byPlacement.get(`${anchor}:${side}`) || []));
  rows.push(MANAGEMENT_FIXED_ROWS[0]);
  for (const row of MANAGEMENT_FIXED_ROWS.slice(1)) {
    if (row.type === 'slot') {
      appendCustom(row.anchor, 'before_setting_position');
      rows.push(row);
      appendCustom(row.anchor, 'after_setting_position');
    } else {
      rows.push(row);
    }
  }
  return rows;
}

export function moveCustomPosition(positions, entries, movingId, targetKey, movingDown) {
  const moving = positions.find((position) => position.id === movingId);
  const target = positionManagementRows(positions).find((row) => row.key === targetKey);
  if (!moving || !target || target.key === `custom:${movingId}`) return { positions, entries };

  let targetAnchor = 'insert_point_1';
  let targetSide = 'before_setting_position';
  if (target.type === 'custom') {
    targetAnchor = target.position.anchor;
    targetSide = target.position.side;
  } else if (target.type === 'context') {
    targetAnchor = movingDown ? target.after : target.before;
    targetSide = movingDown ? 'before_setting_position' : 'after_setting_position';
  } else if (target.type === 'slot') {
    targetAnchor = target.anchor;
    targetSide = movingDown ? 'after_setting_position' : 'before_setting_position';
  } else if (target.type === 'instructions') {
    targetAnchor = 'insert_point_1';
  }

  const without = positions.filter((position) => position.id !== movingId);
  const sameAnchor = without
    .filter((position) => position.anchor === targetAnchor && position.side === targetSide)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  let targetIndex = movingDown ? sameAnchor.length : 0;
  if (target.type === 'custom') {
    const index = sameAnchor.findIndex((position) => position.id === target.position.id);
    targetIndex = index < 0 ? sameAnchor.length : index + (movingDown ? 1 : 0);
  }
  sameAnchor.splice(Math.max(0, Math.min(targetIndex, sameAnchor.length)), 0, {
    ...moving,
    anchor: targetAnchor,
    side: targetSide,
    updatedAt: new Date().toISOString(),
  });
  const replaced = new Set(sameAnchor.map((position) => position.id));
  const reordered = sameAnchor.map((position, index) => ({ ...position, order: index + 1 }));
  const nextPositions = normalizeCustomPositions([...without.filter((position) => !replaced.has(position.id)), ...reordered]);
  const placementKey = (items) => normalizeCustomPositions(items).map((position) => `${position.id}:${position.anchor}:${position.side}:${position.order}`).join('|');
  if (placementKey(nextPositions) === placementKey(positions)) return { positions, entries };
  return {
    positions: nextPositions,
    entries: entries.map((entry) => entry.promptPositionId === movingId ? { ...entry, position: targetAnchor } : entry),
  };
}
