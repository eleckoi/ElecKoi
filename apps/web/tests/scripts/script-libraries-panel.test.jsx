// @vitest-environment jsdom
import React, { act } from 'react';
import { withLibraryVersions } from '../helpers/editorLibraryVersions.js';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ScriptLibrariesPanel } from '../../src/modules/scripts/components/ScriptLibrariesPanel.jsx';
import { createScriptItem } from '../../src/modules/scripts/model/scriptEditing.js';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.stubGlobal('React', React);
const switchScope = async (node, scope) => act(() => [...node.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === (scope === 'global' ? '全局' : '角色')).click());


describe('native script library status display', () => {
  it('shows scoped runtime status and errors for matching source only, then withdraws them with the service', async () => {
    const owners = { global: '', character: 'synthetic-character', preset: 'synthetic-preset' };
    const libraries = Object.fromEntries(Object.entries(owners).map(([scope, ownerId]) => [scope, {
      scope, ownerId, enabled: true, revision: 1, variables: {}, trees: [
        { ...createScriptItem('script', 'synthetic-script'), enabled: true, name: `Synthetic ${scope} script`, content: 'export default () => {}' },
      ],
    }]));
    const statuses = Object.fromEntries(Object.entries(owners).map(([scope, ownerId]) => [JSON.stringify([scope, ownerId, 'synthetic-script']), {
      key: JSON.stringify([scope, ownerId, 'synthetic-script']), id: 'synthetic-script', scope, ownerId,
      source: scope === 'preset' ? 'export default () => { /* previous generation */ }' : 'export default () => {}',
      status: scope === 'global' ? 'error' : 'running', error: scope === 'global' ? 'Synthetic global startup error' : '',
    }]));
    const listeners = new Set(), connectionListeners = new Set();
    let snapshot = { status: 'ready', conversationId: 'synthetic-chat', scriptStatuses: statuses, error: '' };
    const runtime = { getSnapshot: () => snapshot,
      subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
    let current = runtime;
    const connection = { getSnapshot: () => current,
      subscribe: listener => { connectionListeners.add(listener); return () => connectionListeners.delete(listener); } };
    const services = {
      activePreset: async () => ({ id: 'synthetic-preset', name: 'Synthetic preset' }),
      read: async (scope, ownerId) => { expect(ownerId).toBe(owners[scope]); return structuredClone(libraries[scope]); },
      subscribe: () => () => {}, subscribeChanges: () => () => {}, saveAll: vi.fn(), openDirectory: vi.fn(async () => {}),
    };
    withLibraryVersions(services, 'scripts');
    const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    try {
      await act(async () => root.render(<ScriptLibrariesPanel characterId="synthetic-character" scriptLibraries={services} scriptRuntimeConnection={connection} />));
      const group = scope => node.querySelector(`[aria-label="${{ global: '全局脚本', character: '角色脚本', preset: '预设脚本' }[scope]}"]`);
      await act(() => [...node.querySelectorAll('button')].find(button => button.textContent === '管理').click());
      for (const scope of ['global', 'character']) {
        await act(() => { const select = document.querySelector('.editor-management-fields select'); select.value = scope; select.dispatchEvent(new Event('change', { bubbles: true })); });
        await act(async () => [...document.querySelectorAll('.editor-management-modal button')].find(button => button.textContent === '打开源码目录').click());
        expect(services.openDirectory).toHaveBeenLastCalledWith(scope, owners[scope]);
      }
      expect(services.saveAll).not.toHaveBeenCalled();
      services.openDirectory.mockRejectedValueOnce(new Error('Synthetic directory open failure'));
      await act(async () => [...document.querySelectorAll('.editor-management-modal button')].find(button => button.textContent === '打开源码目录').click());
      await act(() => document.querySelector('.editor-management-modal [aria-label="关闭"]').click());
      expect(node.textContent).toContain('Synthetic directory open failure');
      expect(services.saveAll).not.toHaveBeenCalled();
      await switchScope(node, 'global');
      expect(group('global').querySelector('.script-state').textContent).toBe('运行错误');
      await switchScope(node, 'character');
      expect(group('character').querySelector('.script-state').textContent).toBe('运行中');
      await act(() => { snapshot = { ...snapshot, status: 'starting' }; listeners.forEach(listener => listener()); });
      expect(group('character').querySelector('.script-state').textContent).toBe('启动中');
      await act(() => { snapshot = { ...snapshot, status: 'error', error: 'Synthetic disconnected channel' }; listeners.forEach(listener => listener()); });
      expect(group('character').querySelector('.script-state').textContent).toBe('运行错误');
      await act(() => { snapshot = { ...snapshot, status: 'idle', conversationId: '', scriptStatuses: {}, error: '' }; listeners.forEach(listener => listener()); });
      expect(group('character').querySelector('.script-state').textContent).toBe('已启用');
      await act(() => { snapshot = { ...snapshot, status: 'ready', conversationId: 'synthetic-chat', scriptStatuses: statuses }; listeners.forEach(listener => listener()); });
      expect(group('preset')).toBeNull();
      await switchScope(node, 'global');
      await act(async () => group('global').querySelector('.script-list-name').click());
      expect(node.querySelector('.script-inspector [role=alert]').textContent).toBe('Synthetic global startup error');
      await switchScope(node, 'character');
      await act(async () => group('character').querySelector('.script-list-name').click());
      expect(node.querySelector('.script-inspector [role=alert]')).toBeNull();
      await act(async () => { current = null; connectionListeners.forEach(listener => listener()); });
      await switchScope(node, 'global');
      expect(group('global').querySelector('.script-state').textContent).toBe('运行环境未就绪');
      expect(listeners.size).toBe(0);
    } finally { await act(async () => root.unmount()); node.remove(); }
    expect(connectionListeners.size).toBe(0);
  });
});

describe('script library editing commands', () => {
  async function mount(compact = false, treesByScope = {}) {
    const libraries = Object.fromEntries(['global', 'character', 'preset'].map(scope => [scope, {
      scope, ownerId: scope === 'global' ? '' : `synthetic-${scope}`, enabled: true, revision: 1, variables: {},
      trees: treesByScope[scope] || [{ ...createScriptItem('script', 'synthetic-script'), name: `Synthetic ${scope} script` }],
    }]));
    const service = {
      activePreset: async () => ({ id: 'synthetic-preset', name: 'Synthetic preset' }),
      read: async scope => structuredClone(libraries[scope]), subscribe: () => () => {}, subscribeChanges: () => () => {},
      saveAll: vi.fn(async values => values.map(library => ({ ...library, revision: library.revision + 1 }))),
      openDirectory: vi.fn(),
    };
    withLibraryVersions(service, 'scripts');
    const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    await act(async () => root.render(<EditorPresentationContext.Provider value={{ compact }}>
      <ScriptLibrariesPanel characterId="synthetic-character" scriptLibraries={service} />
    </EditorPresentationContext.Provider>));
    const row = scope => node.querySelector(`[aria-label="${{ global: '全局脚本', character: '角色脚本', preset: '预设脚本' }[scope]}"] .script-list-row`);
    const menu = () => document.querySelector('[role="menu"][aria-label="脚本操作"]');
    const rightClick = async scope => { await switchScope(node, scope); return act(() => row(scope).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }))); };
    const action = async label => act(() => [...menu().querySelectorAll('button')].find(button => button.textContent === label).click());
    return { node, service, row, menu, rightClick, action, async close() { await act(() => root.unmount()); node.remove(); } };
  }

  it('uses the shared toolbar-offset inspector with script classification folders', async () => {
    const page = await mount();
    try {
      expect(page.node.querySelector('[aria-label*="新建"][aria-label*="文件夹"], [aria-label*="新建"][aria-label*="分组"]')).toBeNull();
      await page.rightClick('character'); await page.action('重命名');
      const pane = page.node.querySelector('.editor-sidebar-pane');
      expect(pane.classList.contains('is-overlay')).toBe(true);
      expect(page.node.querySelector('.editor-collection-toolbar').closest('.editor-sidebar-pane')).toBeNull();
      expect(page.node.querySelector('.script-inspector select')).toBeTruthy();
      expect(page.node.querySelector('.script-inspector input').value).toBe('Synthetic character script');
    } finally { await page.close(); }
  });

  it('copies, toggles and deletes the right-clicked script, not a same-ID script selected in another scope', async () => {
    const page = await mount();
    try {
      await act(() => page.row('character').querySelector('button').click());
      await page.rightClick('global'); await page.action('复制');
      const global = page.node.querySelector('[aria-label="全局脚本"]');
      expect(global.querySelectorAll('.script-list-row')).toHaveLength(2);
      await switchScope(page.node, 'character');
      expect(page.node.querySelector('[aria-label="角色脚本"]').querySelectorAll('.script-list-row')).toHaveLength(1);
      await page.rightClick('global'); await page.action('启用');
      expect(page.row('global').querySelector('input[type="checkbox"]').checked).toBe(true);
      await switchScope(page.node, 'character');
      await act(() => page.row('character').querySelector('button').click());
      await page.rightClick('global'); await page.action('删除');
      const dialog = document.querySelector('[role="alertdialog"]');
      expect(dialog.textContent).toContain('Synthetic global script');
      await act(() => [...dialog.querySelectorAll('button')].find(button => button.textContent === '删除').click());
      expect(page.node.querySelector('[aria-label="全局脚本"]').querySelectorAll('.script-list-row')).toHaveLength(1);
      await switchScope(page.node, 'character');
      await act(() => page.row('character').querySelector('button').click());
      expect(page.node.querySelector('.script-inspector input').value).toBe('Synthetic character script');
      await act(() => page.node.querySelector('.setting-library-save-button').click());
      expect(page.service.saveAll).toHaveBeenCalledWith([expect.objectContaining({ scope: 'global',
        trees: [expect.objectContaining({ name: 'Synthetic global script 副本' })] })]);
    } finally { await page.close(); }
  });

  it('supports menu keyboard dismissal and keeps saving available in the compact editor', async () => {
    const page = await mount(true);
    try {
      await page.rightClick('character');
      expect(document.activeElement.textContent).toBe('重命名');
      await act(() => page.menu().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
      expect(document.activeElement.textContent).toBe('复制');
      await act(() => page.menu().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      expect(page.menu()).toBeNull();
      expect(document.activeElement).toBe(page.row('character').querySelector('button'));
      await page.rightClick('character'); await page.action('重命名');
      expect(page.node.querySelector('.editor-page-list').hidden).toBe(true);
      expect(page.node.querySelector('.editor-page-feedback .setting-library-save-button')).toBeTruthy();
      await act(() => page.node.querySelector('[aria-label="关闭编辑器"]').click());
      expect(page.node.querySelector('.editor-page-list').hidden).toBe(false);
    } finally { await page.close(); }
  });

  async function dragEvent(node, type, dataTransfer, clientY = 40) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { dataTransfer: { value: dataTransfer }, clientY: { value: clientY } });
    await act(() => node.dispatchEvent(event));
  }
  async function dragTo(page, sourceId, targetId, progress = .5, scope = '角色脚本') {
    const group = page.node.querySelector(`[aria-label="${scope}"]`);
    const source = group.querySelector(`[data-script-id="${sourceId}"] .script-list-name`);
    const target = group.querySelector(`[data-script-id="${targetId}"]`);
    const rect = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 20, height: 40 });
    const transfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    try {
      await dragEvent(source, 'dragstart', transfer);
      await dragEvent(target, 'dragover', transfer, 20 + 40 * progress);
      await dragEvent(target, 'drop', transfer);
      await dragEvent(source, 'dragend', transfer);
    } finally { rect.mockRestore(); }
  }
  it('drags into folders, changes sibling order, returns to the root and saves the final tree without changing source', async () => {
    const first = { ...createScriptItem('script', 'first'), name: '合成脚本一', content: 'export default () => "first";' };
    const second = { ...createScriptItem('script', 'second'), name: '合成脚本二' };
    const folder = createScriptItem('folder', 'folder'), other = { ...createScriptItem('folder', 'other'), scripts: [second] };
    const page = await mount(false, { character: [first, folder, other] });
    try {
      await dragTo(page, first.id, folder.id);
      expect(page.node.querySelector('[aria-label="角色脚本"] .script-folder [data-script-id="first"]').classList.contains('is-nested')).toBe(true);
      await dragTo(page, first.id, other.id);
      await dragTo(page, first.id, second.id, .1);
      expect([...page.node.querySelector('[aria-label="角色脚本"] .script-folder:last-child').querySelectorAll('[data-script-id]')].map(row => row.dataset.scriptId)).toEqual(['other', 'first', 'second']);
      await dragTo(page, first.id, folder.id, .1);
      await dragTo(page, other.id, folder.id, .1);
      await act(async () => page.node.querySelector('.setting-library-save-button').click());
      expect(page.service.saveAll).toHaveBeenCalledWith([expect.objectContaining({ scope: 'character', trees: [first, other, folder] })]);
    } finally { await page.close(); }
  });
  it('rejects cross-scope and folder-nesting drops and disables sorting in a filtered or multi-selected list', async () => {
    const folder = { ...createScriptItem('folder', 'folder'), scripts: [createScriptItem('script', 'nested')] };
    const page = await mount(false, { character: [createScriptItem('script', 'synthetic-script'), folder] });
    try {
      const transfer = { setData: vi.fn() };
      await switchScope(page.node, 'global');
      const source = page.row('global').querySelector('.script-list-name');
      await dragEvent(source, 'dragstart', transfer);
      await switchScope(page.node, 'character');
      await dragEvent(page.row('character'), 'dragover', transfer);
      await dragEvent(page.row('character'), 'drop', transfer);
      await dragTo(page, folder.id, 'nested');
      expect(page.node.querySelector('.setting-library-save-button').disabled).toBe(true);
      const input = page.node.querySelector('input[aria-label="搜索脚本"]');
      await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Synthetic'); input.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(page.node.querySelector('.script-list-name').draggable).toBe(false);
      await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); });
      await act(() => page.node.querySelector('[aria-label="多选"]').click());
      expect(page.node.querySelector('.script-list-name').draggable).toBe(false);
      expect(page.service.saveAll).not.toHaveBeenCalled();
    } finally { await page.close(); }
  });
});
