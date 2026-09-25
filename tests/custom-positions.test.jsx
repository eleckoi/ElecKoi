import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createEntryDraft } from '../src/renderer/src/modules/settingLibraries/model/settingLibraryEditing.js';
import { createPositionDraft, fixedPlacementRowSelectable, moveCustomPosition, positionManagementRows, positionPickerRows, removeCustomPosition, savePositionDraft } from '../src/renderer/src/modules/settingLibraries/model/customPositions.js';
import { CustomPositionManager } from '../src/renderer/src/modules/settingLibraries/components/CustomPositionManager.jsx';
import { SettingLibraryEntryEditor, VisualPositionPicker } from '../src/renderer/src/modules/settingLibraries/components/SettingLibraryEntryEditor.jsx';

vi.stubGlobal('React', React);
afterAll(() => vi.unstubAllGlobals());
const position = { id: 'world', name: '世界状态', anchor: 'insert_point_1', side: 'after_setting_position', order: 3, createdAt: 'created', updatedAt: 'updated' };
const entry = { id: 'entry', title: '环境', content: '保留正文', promptPositionId: 'world', position: 'insert_point_1' };

describe('custom position editing', () => {
  it('keeps new and existing drafts isolated until save', () => {
    const positions = [position];
    const draft = createPositionDraft(positions);
    expect(draft.name).toBe('');
    expect(draft.order).toBe(1);
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
    const saved = savePositionDraft([position], [entry, other], { ...position, anchor: 'insert_point_3' });
    expect(saved.positions).toHaveLength(1);
    expect(saved.entries[0]).toEqual({ ...entry, position: 'insert_point_3' });
    expect(saved.entries[1]).toBe(other);
    expect(entry.position).toBe('insert_point_1');
  });
  it('deletes a position but preserves and relocates its entries', () => {
    const result = removeCustomPosition([position], [entry], position);
    expect(result.positions).toEqual([]);
    expect(result.entries).toEqual([{ ...entry, promptPositionId: '' }]);
    expect(entry.promptPositionId).toBe('world');
  });
  it('places custom nodes after their actual anchors in position order', () => {
    const earlier = { ...position, id: 'early', order: 1 };
    const later = { ...position, id: 'late', anchor: 'insert_point_3' };
    const positions = [position, later, earlier];
    const rows = positionPickerRows(positions);
    const index = rows.findIndex((row) => row.type === 'position' && row.value === 'insert_point_1');
    expect(rows[index + 1].position.id).toBe('early');
    expect(rows[index + 2].position.id).toBe('world');
    const history = rows.findIndex((row) => row.type === 'position' && row.value === 'insert_point_3');
    expect(rows[history + 1].position.id).toBe('late');
    expect(positions).toEqual([position, later, earlier]);
  });
  it('renders every fixed insertion point as a full position card', () => {
    const fixedPositions = positionPickerRows([]).filter((row) => row.type === 'position');
    expect(fixedPositions).toHaveLength(6);
    expect(fixedPositions.every((row) => row.card === true)).toBe(true);
  });
  it('builds one drag guide from fixed references and independent custom nodes', () => {
    const beforeHistory = { ...position, id: 'before', name: '人物状态', anchor: 'insert_point_2', side: 'before_setting_position', order: 1 };
    const hiddenToolTimeline = { ...position, id: 'hidden-tool-timeline', name: '隐藏工具时间线', anchor: 'insert_point_5', side: 'after_setting_position', order: 1 };
    const rows = positionManagementRows([beforeHistory, position, hiddenToolTimeline]);
    expect(rows.map((row) => row.key)).toEqual([
      'fixed:instructions',
      'slot:insert_point_1',
      'custom:world',
      'fixed-group:cache',
      'custom:before',
      'slot:insert_point_2',
      'fixed-group:history',
      'slot:insert_point_3',
      'fixed-group:latest-user-input',
      'slot:insert_point_4',
      'fixed-group:tool-flow',
      'slot:insert_point_5',
      'custom:hidden-tool-timeline',
    ]);
  });
  it('derives anchor and order from dragging without changing entry content', () => {
    const second = { ...position, id: 'second', name: '第二个', order: 2 };
    const moved = moveCustomPosition([position, second], [entry], 'world', 'fixed-group:history', true);
    expect(moved.positions.find((item) => item.id === 'world')).toMatchObject({ anchor: 'insert_point_3', side: 'before_setting_position', order: 1 });
    expect(moved.entries[0]).toEqual({ ...entry, position: 'insert_point_3' });
  });
  it('shows a fixed guide and draggable custom nodes without an insert-position field', () => {
    const html = renderToStaticMarkup(<CustomPositionManager entry={entry} positions={[position]} entries={[entry]} onChange={() => {}} onBack={() => {}} />);
    expect(html).toContain('返回插入配置');
    expect(html).toContain('世界状态');
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
  it('allows custom positions only in Agent presets', () => {
    const props = {
      entry: { ...entry, enabled: true, insertRole: 'user', order: 1 },
      entries: [{ ...entry, enabled: true, insertRole: 'user', order: 1 }],
      promptPositions: [position],
      onChange: () => {},
      onEntriesChange: () => {},
      onManagePositions: () => {},
    };
    const presetHtml = renderToStaticMarkup(<VisualPositionPicker {...props} allowCustomPromptPositions />);
    expect(presetHtml).toContain('插入位置');
    expect(presetHtml).toContain('管理位置');
    expect(presetHtml).toContain('世界状态');
    expect((presetHtml.match(/is-card/g) || [])).toHaveLength(7);
    expect(presetHtml).toContain('aria-label="选择系统指令"');
    expect(presetHtml).toMatch(/setting-library-placement-row is-card is-instructions/);
    expect(presetHtml).toContain('aria-label="固定位置设定插入点 1"');
    expect(presetHtml).not.toContain('aria-label="选择设定插入点 1"');

    const placementCss = readFileSync(new URL('../src/renderer/src/modules/settingLibraries/styles/setting-library.css', import.meta.url), 'utf8');
    expect(placementCss).toMatch(/\.setting-library-placement-row\.is-fixed > i\s*\{[^}]*background:[^}]*border:\s*0;/s);
    expect(placementCss).toMatch(/\.setting-library-placement-row\.is-instructions \.setting-library-placement-choice\s*\{[^}]*color:\s*var\(--text\);[^}]*font-weight:\s*600;/s);

    const characterHtml = renderToStaticMarkup(<VisualPositionPicker {...props} entry={{ ...props.entry, promptPositionId: '' }} allowCustomPromptPositions={false} />);
    expect(characterHtml).toContain('插入位置');
    expect(characterHtml).toContain('缓存设定区');
    expect(characterHtml).not.toContain('管理位置');
    expect(characterHtml).not.toContain('世界状态');
    expect((characterHtml.match(/is-card/g) || [])).toHaveLength(6);
    expect(characterHtml).toContain('aria-label="选择设定插入点 1"');
  });
  it('keeps setting insertion points visible but non-selectable in Agent presets', () => {
    const rows = positionPickerRows([]).filter((row) => row.type === 'position');
    expect(rows.map((row) => [row.value, fixedPlacementRowSelectable(row, true)])).toEqual([
      ['instructions', true],
      ['insert_point_1', false],
      ['insert_point_2', false],
      ['insert_point_3', false],
      ['insert_point_4', false],
      ['insert_point_5', false],
    ]);
    expect(rows.every((row) => fixedPlacementRowSelectable(row, false))).toBe(true);
  });
  it('keeps the cache placement visible without a manual cache-entry editor', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'setting-entry' });
    const entry = createEntryDraft('', 1, [], 'standard');
    const editorHtml = renderToStaticMarkup(<SettingLibraryEntryEditor
      entry={entry}
      entries={[entry]}
      groups={[]}
      onChange={() => {}}
      onEntriesChange={() => {}}
      onOpenEntry={() => {}}
    />);
    expect((editorHtml.match(/setting-library-entry-tab-node/g) || [])).toHaveLength(4);
    expect((editorHtml.match(/setting-library-entry-tab-connector/g) || [])).toHaveLength(3);
    expect(editorHtml).toContain('基础');
    expect(editorHtml).toContain('触发');
    expect(editorHtml).toContain('正文');
    expect(editorHtml).toContain('插入');
    expect(positionPickerRows([]).some((row) => row.label === '缓存设定区')).toBe(true);
  });
});
