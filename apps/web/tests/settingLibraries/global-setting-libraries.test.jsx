// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { globalSettingLibraryCollectionSchema } from '../../../../packages/shared/src/contracts/settingLibrary/global';
import { serializeSettingLibrary } from '../../src/modules/settingLibraries/model/settingLibraryTransfer.js';
import { SettingLibraryPanel } from '../../src/modules/settingLibraries/components/SettingLibraryPanel.jsx';
import { normalizeSettingLibrary, emptyEntry } from '../../../../packages/host/product-data/src/domain/settingLibraries/settingLibraryNormalization';

let root, container, roles, globals, role, collection;
beforeEach(async () => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  role = normalizeSettingLibrary('synthetic-role');
  collection = { revision: 0, libraries: [{ id: 'synthetic-global', name: '合成共享库', enabled: true,
    entries: [{ ...emptyEntry('synthetic-global-entry'), title: '合成共享条目', content: '合成共享正文' }], groups: [], promptPositions: [], listAllExpanded: false, expandedGroupIds: [], createdAt: '', updatedAt: '' }] };
  roles = { getSnapshot: () => ({ status: 'ready', value: role }), subscribe: () => () => {}, read: async () => role,
    save: vi.fn(async (_id, value) => { role = normalizeSettingLibrary('synthetic-role', value); return role; }), saveViewState: async () => [], listCharacters: async () => ({ items: [] }) };
  globals = { getSnapshot: () => ({ status: 'ready', value: collection }), subscribe: () => () => {}, read: async () => collection,
    save: vi.fn(async value => { collection = globalSettingLibraryCollectionSchema.parse({ ...value, revision: value.revision + 1 }); return collection; }) };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<SettingLibraryPanel characterId="synthetic-role" settingLibraries={roles} globalSettingLibraries={globals} />));
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); });
async function click(label, scope = document.body) {
  const button = [...scope.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent.trim() === label);
  expect(button, label).toBeTruthy(); await act(async () => button.click());
}
async function switchScope(label) {
  const tab = [...container.querySelectorAll('[role="tab"]')].find(item => item.textContent === label);
  await act(async () => tab.click());
}
async function importFile(text, name = 'synthetic-worldbook.json') {
  const input = container.querySelector('[aria-label="全局设定库文件"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [{ name, text: async () => text }] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
async function inputValue(input, value) {
  expect(input).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function selectEntry(title, libraryName = '合成共享库') {
  const section = [...container.querySelectorAll('.global-setting-library')].find(item => item.querySelector('.global-setting-library-name').textContent === libraryName);
  const row = [...section.querySelectorAll('[role="treeitem"]')].find(item => item.querySelector('.setting-library-tree-label').textContent === title);
  expect(row, title).toBeTruthy(); await act(async () => row.click()); return row;
}
async function editorStep(label) {
  const button = [...container.querySelectorAll('.setting-library-entry-tabs button')].find(item => item.textContent.endsWith(label));
  expect(button, label).toBeTruthy(); await act(async () => button.click());
}
it('keeps the exported file name when a standalone SillyTavern worldbook contains only entries', async () => {
  const exported = JSON.stringify({ entries: { 0: { uid: 0, key: ['合成关键词'], comment: '合成条目', content: '合成正文' } } });
  await switchScope('全局'); await importFile(exported, '合成独立世界书.json'); await click('保存');
  const imported = collection.libraries[1];
  expect(imported.name).toBe('合成独立世界书');
  expect(imported.groups[0].name).toBe('合成独立世界书');
  expect(imported.entries[0]).toMatchObject({ title: '合成条目', content: '合成正文', keywords: ['合成关键词'] });
});
it('renames the selected global library through a dialog and preserves its draft through a failed save and reopen', async () => {
  const original = structuredClone(collection.libraries[0]);
  await switchScope('全局'); await click('合成共享库'); await selectEntry('合成共享条目');
  const rename = () => container.querySelector('.global-setting-library-rename');
  expect(rename().nextElementSibling).toBe(container.querySelector('.global-setting-library-delete'));
  await click('重命名全局库合成共享库');
  expect(document.querySelector('input[placeholder="设定库名称"]').value).toBe('合成共享库');
  await click('取消', document.querySelector('[role="dialog"]'));
  expect(collection.libraries[0]).toEqual(original); expect(globals.save).not.toHaveBeenCalled();
  await click('重命名全局库合成共享库');
  await inputValue(document.querySelector('input[placeholder="设定库名称"]'), '   ');
  await click('完成', document.querySelector('[role="dialog"]'));
  expect(document.querySelector('[role="dialog"] [role="alert"]').textContent).toBe('请输入设定库名称');
  await inputValue(document.querySelector('input[placeholder="设定库名称"]'), '  合成改名库  ');
  await click('完成', document.querySelector('[role="dialog"]'));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(container.querySelector('.global-setting-library-name').textContent).toBe('合成改名库');
  expect(container.querySelector('.setting-library-owner-path').textContent).toContain('合成改名库');
  expect(container.querySelector('input[placeholder="条目标题/待命名"]').value).toBe('合成共享条目');
  expect(collection.libraries[0]).toEqual(original); expect(globals.save).not.toHaveBeenCalled();
  globals.save.mockRejectedValueOnce(new Error('合成保存失败'));
  await click('保存');
  expect(collection.libraries[0].name).toBe(original.name);
  expect(container.querySelector('.global-setting-library-name').textContent).toBe('合成改名库');
  await click('保存');
  expect(collection.libraries[0]).toEqual({ ...original, name: '合成改名库', updatedAt: expect.any(String) });
  expect(roles.save).not.toHaveBeenCalled();
  await act(async () => root.render(<SettingLibraryPanel key="reopened" characterId="synthetic-role" settingLibraries={roles} globalSettingLibraries={globals} />));
  await switchScope('全局'); await click('重命名全局库合成改名库');
  expect(document.querySelector('input[placeholder="设定库名称"]').value).toBe('合成改名库');
});
it('uses the normal editor for imported contents and saves title, trigger, content and placement independently', async () => {
  expect([...container.querySelectorAll('[role="tab"]')].map(item => item.textContent)).toEqual(['角色', '全局']);
  expect(container.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('角色');
  const originalRole = structuredClone(role);
  await switchScope('全局');
  expect(container.querySelector('[aria-label="新建"]').disabled).toBe(true);
  expect(container.querySelector('[aria-label="管理"]')).toBeNull();
  await click('合成共享库'); await selectEntry('合成共享条目');
  expect(container.querySelector('[aria-label="设定编辑器"]')).toBeTruthy();
  expect(container.querySelector('[aria-label="新建"]').disabled).toBe(false);
  await inputValue(container.querySelector('input[placeholder="条目标题/待命名"]'), '合成编辑标题');
  await editorStep('触发'); await click('提示词常驻');
  await editorStep('插入'); await click('选择设定插入点 1'); await click('AI');
  await editorStep('触发'); await click('Agent 读取'); await click('关键词命中');
  await inputValue(container.querySelector('.setting-library-keyword-input input'), '合成末尾关键词,');
  await editorStep('正文');
  const text = '首段' + '合成长正文'.repeat(20001) + '末尾合成关键词';
  const textarea = container.querySelector('textarea[aria-label="设定正文"]');
  expect(textarea.readOnly).toBe(false); await inputValue(textarea, text);
  await editorStep('插入'); expect(container.textContent).toContain('无需配置插入位置');
  await click('停用合成编辑标题'); await click('保存');
  const entry = collection.libraries[0].entries[0];
  expect(entry).toMatchObject({ title: '合成编辑标题', content: text, triggerMode: 'agent_tool', agentReadStrategy: 'keyword', keywords: ['合成末尾关键词'], position: 'insert_point_1', insertRole: 'assistant', enabled: false });
  expect(collection.libraries[0]).not.toHaveProperty('versions');
  expect(role).toEqual(originalRole); expect(roles.save).not.toHaveBeenCalled();
  await switchScope('角色'); await click('管理'); expect(document.body.textContent).toContain('角色设定库版本管理');
  await click('关闭'); await switchScope('全局'); await selectEntry('合成编辑标题'); await editorStep('正文');
  expect(container.querySelector('textarea[aria-label="设定正文"]').value === text).toBe(true);
});
it('keeps equal source entry IDs in separate global libraries independent through edits, copy and multi-delete', async () => {
  await switchScope('全局');
  await importFile(serializeSettingLibrary({ ...role, name: '合成第二库', entries: [{ ...collection.libraries[0].entries[0], title: '合成第二条目', content: '合成第二正文' }] }));
  await click('合成第二库'); await selectEntry('合成第二条目', '合成第二库');
  await inputValue(container.querySelector('input[placeholder="条目标题/待命名"]'), '合成第二编辑');
  await click('合成共享库');
  const row = await selectEntry('合成共享条目');
  await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })));
  await click('复制');
  await click('多选');
  const checkbox = container.querySelector('[aria-label="选择合成共享条目 副本"]');
  expect(checkbox).toBeTruthy(); await act(async () => checkbox.click()); await click('删除'); await click('删除', document.querySelector('[role="alertdialog"]'));
  await click('完成'); await click('保存');
  expect(collection.libraries[0].entries.map(item => item.title)).toEqual(['合成共享条目']);
  expect(collection.libraries[1].entries.map(item => item.title)).toEqual(['合成第二编辑']);
  expect(collection.libraries[1].entries[0].id).toBe(collection.libraries[0].entries[0].id);
  expect(roles.save).not.toHaveBeenCalled();
});
it('creates and edits folders and EJS references within an imported library, retaining drafts on save failure', async () => {
  await switchScope('全局'); await click('合成共享库');
  await click('新建'); await click('文件夹');
  await inputValue(container.querySelector('.setting-library-group-editor input'), '合成资料夹');
  await click('新建'); await click('EJS引用设定');
  await inputValue(container.querySelector('input[placeholder="供 getwi 按名称读取"]'), '合成引用');
  await inputValue(container.querySelector('textarea[aria-label="EJS引用正文"]'), '合成引用正文');
  globals.save.mockRejectedValueOnce(new Error('合成保存失败'));
  await click('保存'); expect(container.querySelector('textarea[aria-label="EJS引用正文"]').value).toBe('合成引用正文');
  expect(collection.libraries[0].groups).toHaveLength(0);
  await click('保存');
  const saved = collection.libraries[0], reference = saved.entries.find(item => item.title === '合成引用');
  expect(saved.groups[0].name).toBe('合成资料夹');
  expect(reference).toMatchObject({ dynamicMode: 'ejs_reference', content: '合成引用正文', groupId: saved.groups[0].id });
  expect(saved).not.toHaveProperty('versions'); expect(roles.save).not.toHaveBeenCalled();
});
it('deletes an imported library only after confirmation and save and retains the failed draft', async () => {
  await switchScope('全局'); await click('删除全局库合成共享库'); await click('取消'); expect(collection.libraries).toHaveLength(1);
  await click('删除全局库合成共享库'); await click('删除', document.querySelector('[role="alertdialog"]'));
  globals.save.mockRejectedValueOnce(new Error('合成保存失败，草稿保留'));
  await click('保存'); expect(collection.libraries).toHaveLength(1);
  await click('保存'); expect(collection.libraries).toHaveLength(0); expect(roles.save).not.toHaveBeenCalled();
});
it.each(['角色', '全局'])('dismisses the %s setting context menu outside the menu and with Escape while keeping commands usable', async scope => {
  await switchScope(scope);
  if (scope === '角色') { await click('新建'); await click('设定'); }
  else { await click('合成共享库'); await selectEntry('合成共享条目'); }
  const row = () => container.querySelector('[role="treeitem"]');
  const openMenu = async () => {
    await act(async () => row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })));
    expect(document.querySelector('[role="menu"]')).toBeTruthy();
  };
  for (const target of [container.querySelector('.editor-collection-toolbar'), container.querySelector('.setting-library-tree'), container.querySelector('.setting-library-inspector-body'), document.body]) {
    await openMenu();
    await act(async () => target.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  }
  await openMenu();
  await act(async () => document.querySelector('[role="menu"] button').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="menu"]')).toBeNull();
  await openMenu();
  const copy = [...document.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.trim() === '复制');
  await act(async () => copy.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
  expect(document.querySelector('[role="menu"]')).toBeTruthy();
  await act(async () => copy.click());
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(container.querySelectorAll('[role="treeitem"]')).toHaveLength(2);
});
it('right-clicks an imported entry without opening or switching the editor and deletes from the explicit menu library', async () => {
  await switchScope('全局');
  await importFile(serializeSettingLibrary({ ...role, name: '合成第二库', entries: [{ ...collection.libraries[0].entries[0], title: '合成第二条目' }] }));
  await click('展开合成第二库'); await click('展开合成共享库');
  const row = title => [...container.querySelectorAll('[role="treeitem"]')].find(item => item.querySelector('.setting-library-tree-label').textContent === title);
  const right = async title => act(async () => row(title).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })));
  await right('合成共享条目');
  expect(container.querySelector('[aria-label="设定编辑器"]')).toBeNull();
  await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
  await act(async () => row('合成共享条目').click());
  const title = container.querySelector('input[placeholder="条目标题/待命名"]');
  await right('合成第二条目');
  expect(title.value).toBe('合成共享条目');
  expect(container.querySelector('.setting-library-owner-path').textContent).toContain('合成共享库');
  await click('删除', document.querySelector('[role="menu"]')); await click('删除', document.querySelector('[role="alertdialog"]'));
  expect(container.querySelector('input[placeholder="条目标题/待命名"]').value).toBe('合成共享条目');
  await click('保存');
  expect(collection.libraries[0].entries).toHaveLength(1); expect(collection.libraries[1].entries).toHaveLength(0);
  expect(roles.save).not.toHaveBeenCalled();
});
it.each([101, 1001, 10001])('imports all %i worldbook entries without creating a blank library or modifying the role', async count => {
  const entries = Object.fromEntries(Array.from({ length: count }, (_, i) => [i, { uid: i, comment: `合成条目-${i}`, content: `首-${i}|${[0, Math.floor(count/2), count-1].includes(i) ? '合成长正文'.repeat(20001) : '合成正文'}|尾-${i}`, key: [`合成关键词-${i}`] }]));
  await switchScope('全局'); await importFile(JSON.stringify({ name: '合成导入库', entries })); await click('保存');
  const imported = collection.libraries.find(item => item.name === '合成导入库'); expect(imported.entries).toHaveLength(count);
  const byTitle = new Map(imported.entries.map(item => [item.title, item]));
  for (const i of [0, Math.floor(count/2), count-1]) {
    const item = byTitle.get(entries[i].comment);
    expect(item.content === entries[i].content).toBe(true); expect(item.keywords).toEqual(entries[i].key);
  }
  await click('重命名全局库合成导入库');
  await inputValue(document.querySelector('input[placeholder="设定库名称"]'), '合成大量条目库');
  await click('完成', document.querySelector('[role="dialog"]')); await click('保存');
  const renamed = collection.libraries.find(item => item.id === imported.id);
  expect(renamed.name).toBe('合成大量条目库'); expect(renamed.enabled).toBe(imported.enabled);
  expect(renamed.entries).toEqual(imported.entries); expect(renamed.groups).toEqual(imported.groups);
  expect(roles.save).not.toHaveBeenCalled(); expect(role.entries).toHaveLength(0);
});
it('imports an explicitly selected saved role version and keeps the source independent', async () => {
  const source = normalizeSettingLibrary('synthetic-source', { ...role, characterId: 'synthetic-source', name: '合成来源版本', entries: [{ ...emptyEntry('synthetic-source-entry'), title: '合成来源设定', content: '合成来源正文' }] });
  roles.listCharacters = async () => ({ items: [{ id: 'synthetic-source', name: '合成来源角色' }] });
  roles.readUntracked = vi.fn(async () => structuredClone(source));
  await switchScope('全局'); await click('导入全局设定库'); await click('从角色设定库');
  const select = document.querySelector('.global-library-import-fields select');
  await act(async () => { select.value = 'synthetic-source'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await click('导入', document.querySelector('.editor-management-modal')); await click('保存');
  expect(roles.readUntracked).toHaveBeenCalledWith('synthetic-source');
  expect(collection.libraries[1].entries[0].content).toBe('合成来源正文');
  expect(source.entries[0].content).toBe('合成来源正文'); expect(roles.save).not.toHaveBeenCalled();
});
it('reports a missing source version without importing another version and permits an explicit retry', async () => {
  const source = normalizeSettingLibrary('synthetic-source', { ...role, characterId: 'synthetic-source',
    entries: [{ ...emptyEntry('synthetic-source-entry'), title: '合成来源设定', content: '合成来源正文' }] });
  const before = structuredClone(collection);
  roles.listCharacters = async () => ({ items: [{ id: 'synthetic-source', name: '合成来源角色' }] });
  roles.readUntracked = vi.fn().mockResolvedValueOnce({ ...source, activeVersionId: 'synthetic-missing-version' })
    .mockResolvedValueOnce(structuredClone(source));
  await switchScope('全局'); await click('导入全局设定库'); await click('从角色设定库');
  const choose = async () => act(async () => {
    const select = document.querySelector('.global-library-import-fields select');
    select.value = 'synthetic-source'; select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await choose();
  const modal = document.querySelector('.editor-management-modal');
  expect(modal.querySelector('[role="alert"]').textContent).toBe('找不到来源角色的当前设定库版本。');
  expect([...modal.querySelectorAll('button')].find(item => item.textContent === '导入').disabled).toBe(true);
  expect(collection).toEqual(before); expect(globals.save).not.toHaveBeenCalled();
  await choose(); await click('导入', modal); await click('保存');
  expect(collection.libraries[1].entries[0].content).toBe('合成来源正文');
  expect(roles.readUntracked).toHaveBeenCalledTimes(2); expect(roles.save).not.toHaveBeenCalled();
});
