// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PresetPromptEditor } from '../../src/modules/presets/components/PresetPromptEditor.jsx';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';

let root, draft;
const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); };
const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);
const checkbox = label => document.querySelector(`input[aria-label="选择${label}"]`);
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('React', React);
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0));
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });

it.each(['creator', 'roleplay'])('keeps familiar prompt controls while limiting creator EJS and keyword options (%s)', async purpose => {
  function Fixture() {
    const [preset, setPreset] = useState({ id: 'synthetic-preset', purpose, name: 'Synthetic preset', promptPositions: [], groups: [], expandedGroupIds: [], entries: [
      { ...createEntryDraft('', 1, []), id: 'synthetic-prompt', title: 'Synthetic prompt', triggerMode: 'agent_tool', agentReadStrategy: 'normal', content: 'Synthetic content' },
    ] });
    draft = preset;
    return <PresetPromptEditor preset={preset} onChange={setPreset} />;
  }
  await act(async () => root.render(<Fixture />));
  await click(button('新建'));
  expect(Boolean([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent === 'EJS引用设定'))).toBe(purpose === 'roleplay');
  await click(document.querySelector('[role="treeitem"]'));
  const tab = label => [...document.querySelectorAll('.setting-library-entry-tabs button')].find(item => item.textContent.endsWith(label));
  await click(tab('触发'));
  expect(button('Agent 读取').getAttribute('aria-checked')).toBe('true');
  expect(button('提示词常驻')).toBeTruthy();
  expect(Boolean(document.querySelector('[aria-label="关键词命中"]'))).toBe(purpose === 'roleplay');
  await click(button('必读')); expect(draft.entries[0].agentReadStrategy).toBe('required');
  await click(button('选读')); expect(draft.entries[0].agentReadStrategy).toBe('normal');
  await click(tab('正文'));
  expect(Boolean(document.querySelector('[aria-label="正文格式"]'))).toBe(purpose === 'roleplay');
  await click(tab('触发')); await click(button('提示词常驻'));
  expect(draft.entries[0].triggerMode).toBe('always');
  expect(document.querySelector('[aria-label="读取策略"]')).toBeNull();
});

it.each(['creator', 'roleplay'])('limits mobile prompt creation to the preset purpose (%s)', async purpose => {
  const preset = { id: 'synthetic-mobile-preset', purpose, name: 'Synthetic mobile preset', entries: [], groups: [], promptPositions: [], expandedGroupIds: [] };
  await act(async () => root.render(<EditorPresentationContext.Provider value={{ compact: true }}><PresetPromptEditor preset={preset} onChange={() => {}} /></EditorPresentationContext.Provider>));
  await click(button('新建'));
  expect([...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toEqual(purpose === 'creator' ? ['文件夹', '提示词'] : ['文件夹', '提示词', 'EJS引用设定']);
});

it('right-clicks preset prompts without opening or replacing the editor and keeps commands addressed to their own prompt', async () => {
  function Fixture() {
    const [preset, setPreset] = useState({ id: 'synthetic-preset', name: '合成预设', promptPositions: [], groups: [], expandedGroupIds: [], entries: [
      { ...createEntryDraft('', 1, []), id: 'first', title: '合成第一提示词' },
      { ...createEntryDraft('', 2, []), id: 'second', title: '合成第二提示词' },
    ] });
    draft = preset;
    return <PresetPromptEditor preset={preset} onChange={setPreset} />;
  }
  await act(async () => root.render(<Fixture />));
  const rows = () => [...document.querySelectorAll('[role="treeitem"]')];
  const right = async row => {
    await act(async () => row.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })));
    await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 24, clientY: 24 })));
  };
  await right(rows()[1]); expect(document.querySelector('[aria-label="设定编辑器"]')).toBeNull();
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
  await click(rows()[0]); const inspector = document.querySelector('[aria-label="设定编辑器"]');
  await right(rows()[1]); expect(document.querySelector('[aria-label="设定编辑器"]')).toBe(inspector);
  expect(inspector.querySelector('input[placeholder="条目标题/待命名"]').value).toBe('合成第一提示词');
  await click([...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === '删除'));
  expect(draft.entries.map(item => item.id)).toEqual(['first']);
  expect(document.querySelector('[aria-label="设定编辑器"]')).toBe(inspector);
});

it.each([true, false])('selects, copies and deletes prompt subtrees without duplicating descendants or affecting fixed entries (compact=%s)', async compact => {
  function Fixture() {
    const [preset, setPreset] = useState(() => ({ id: 'synthetic-preset', name: '合成预设', promptPositions: [],
      groups: [{ id: 'outer', name: '合成文件夹', parentId: '', treeViewOrder: 1 }, { id: 'inner', name: '合成子文件夹', parentId: 'outer', treeViewOrder: 1 }],
      expandedGroupIds: ['outer', 'inner'], entries: [
        { ...createEntryDraft('', 0, []), id: 'built-in-hidden-tool-timeline', title: '合成固定提示词' },
        { ...createEntryDraft('', 2, []), id: 'root', title: '合成根提示词' },
        { ...createEntryDraft('inner', 1, []), id: 'child', title: '合成子提示词', content: '保留的合成正文' },
      ] }));
    draft = preset;
    return <EditorPresentationContext.Provider value={{ compact }}><PresetPromptEditor preset={preset} onChange={setPreset} /></EditorPresentationContext.Provider>;
  }
  await act(async () => root.render(<Fixture />));
  await click(button('多选'));
  expect(checkbox('合成固定提示词').disabled).toBe(true);
  expect(document.querySelector('.mobile-editor-actions')).toBeNull();
  await click(checkbox('合成文件夹')); await click(checkbox('合成子提示词'));
  await click(button('复制'));
  expect(draft.groups).toHaveLength(4); expect(draft.entries).toHaveLength(4);
  expect(draft.entries.filter(entry => entry.content === '保留的合成正文')).toHaveLength(2);
  expect(document.querySelector('[role="status"]').textContent).toBe('已选 0 项');
  const input = document.querySelector('[aria-label="搜索提示词"]');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '合成根提示词'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(document.querySelector('.editor-selection-bar input'));
  expect(document.querySelector('[role="status"]').textContent).toBe('已选 1 项');
  await click(button('删除')); await click(document.querySelector('[role="alertdialog"] .is-destructive'));
  expect(draft.entries.some(entry => entry.id === 'root')).toBe(false);
  expect(draft.entries.some(entry => entry.id === 'built-in-hidden-tool-timeline')).toBe(true);
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await click(checkbox('合成文件夹')); await click(checkbox('合成子提示词'));
  await click(button('删除')); await click(button('取消'));
  expect(draft.groups).toHaveLength(4);
  await click(button('删除')); await click(document.querySelector('[role="alertdialog"] .is-destructive'));
  expect(draft.groups).toHaveLength(2); expect(draft.entries).toHaveLength(2);
  expect(draft.expandedGroupIds).toEqual([]);
  await click(button('完成'));
  expect(document.querySelector('.editor-selection-bar')).toBeNull();
  expect(document.querySelector('[aria-label="选择合成固定提示词"]')).toBeNull();
  expect(Boolean(document.querySelector('.mobile-editor-actions'))).toBe(compact);
});
