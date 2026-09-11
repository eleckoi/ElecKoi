import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createPositionDraft, moveCustomPosition, positionManagementRows, positionPickerRows, removeCustomPosition, savePositionDraft } from '../src/renderer/src/modules/settingLibraries/model/customPositions.js';
import { CustomPositionManager } from '../src/renderer/src/modules/settingLibraries/components/CustomPositionManager.jsx';

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());
const position = { id: 'world', name: '世界状态', anchor: 'after_instructions', order: 3, createdAt: 'created', updatedAt: 'updated' };
const entry = { id: 'entry', title: '环境', content: '保留正文', promptPositionId: 'world', position: 'after_instructions' };

describe('custom position editing', () => {
  it('keeps new and existing drafts isolated until save', () => {
    const positions = [position];
    const draft = createPositionDraft(positions);
    expect(draft.name).toBe('');
    expect(draft.order).toBe(2);
    expect(positions).toEqual([position]);
    const editing = createPositionDraft(positions, position);
    editing.name = '修改';
    expect(position.name).toBe('世界状态');
  });
  it('rejects blank names and unsupported anchors', () => {
    expect(() => savePositionDraft([], [], { ...position, name: '  ' })).toThrow('填写位置名称');
    expect(() => savePositionDraft([], [], { ...position, anchor: 'invalid' })).toThrow('选择有效的插入位置');
  });
  it('adds only on save and trims the name', () => {
    const detached = { ...entry, promptPositionId: '' };
    const saved = savePositionDraft([], [detached], { ...position, name: ' 世界状态 ' }, detached.id);
    expect(saved.positions).toHaveLength(1);
    expect(saved.positions[0].name).toBe('世界状态');
    expect(saved.entries[0].promptPositionId).toBe('world');
  });
  it('updates referenced entries when the anchor moves without changing their content', () => {
    const other = { ...entry, id: 'other', promptPositionId: '' };
    const saved = savePositionDraft([position], [entry, other], { ...position, anchor: 'after_history' });
    expect(saved.positions).toHaveLength(1);
    expect(saved.entries[0]).toEqual({ ...entry, position: 'after_history' });
    expect(saved.entries[1]).toBe(other);
    expect(entry.position).toBe('after_instructions');
  });
  it('deletes a position but preserves and relocates its entries', () => {
    const result = removeCustomPosition([position], [entry], position);
    expect(result.positions).toEqual([]);
    expect(result.entries).toEqual([{ ...entry, promptPositionId: '' }]);
    expect(entry.promptPositionId).toBe('world');
  });
  it('places custom nodes after their actual anchors in position order', () => {
    const earlier = { ...position, id: 'early', order: 1 };
    const later = { ...position, id: 'late', anchor: 'after_history' };
    const positions = [position, later, earlier];
    const rows = positionPickerRows(positions);
    const index = rows.findIndex((row) => row.value === 'after_instructions');
    expect(rows[index + 1].position.id).toBe('early');
    expect(rows[index + 2].position.id).toBe('world');
    const history = rows.findIndex((row) => row.value === 'after_history');
    expect(rows[history + 1].position.id).toBe('late');
    expect(positions).toEqual([position, later, earlier]);
  });
  it('builds one drag guide from fixed references and independent custom nodes', () => {
    const beforeHistory = { ...position, id: 'before', name: '人物状态', anchor: 'before_history', order: 1 };
    const rows = positionManagementRows([beforeHistory, position]);
    expect(rows.map((row) => row.key)).toEqual([
      'fixed:instructions',
      'anchor:after-instructions',
      'custom:world',
      'custom:before',
      'fixed-group:history',
      'fixed-group:latest-user-input',
      'fixed-group:tool-flow',
    ]);
  });
  it('derives anchor and order from dragging without changing entry content', () => {
    const second = { ...position, id: 'second', name: '第二个', order: 2 };
    const moved = moveCustomPosition([position, second], [entry], 'world', 'fixed-group:history', true);
    expect(moved.positions.find((item) => item.id === 'world')).toMatchObject({ anchor: 'after_history', order: 1 });
    expect(moved.entries[0]).toEqual({ ...entry, position: 'after_history' });
  });
  it('shows a fixed guide and draggable custom nodes without an insert-position field', () => {
    const html = renderToStaticMarkup(<CustomPositionManager entry={entry} positions={[position]} entries={[entry]} onChange={() => {}} onBack={() => {}} />);
    expect(html).toContain('返回插入配置');
    expect(html).toContain('世界状态');
    expect(html).toContain('系统指令之后');
    expect(html).toContain('管理位置：世界状态');
    expect(html).toContain('draggable="true"');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('插入位置');
    expect(html).not.toContain('消息身份');
  });
  it('keeps the fixed guide visible when there are no custom records', () => {
    const html = renderToStaticMarkup(<CustomPositionManager positions={[]} entries={[]} onChange={() => {}} onBack={() => {}} />);
    expect(html).toContain('系统指令');
    expect(html).toContain('聊天记录');
    expect(html).toContain('工具调用流程');
    expect(html).not.toContain('<article');
  });
});
