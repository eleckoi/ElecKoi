// @vitest-environment jsdom
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { dshClientPlugin } from '../../../../tests/helpers/dshClientPlugin'

const saveCharacter = vi.hoisted(() => vi.fn())
const resetTheme = vi.hoisted(() => vi.fn())

vi.mock('../../src/modules/persona/index.js', () => ({
  CharacterBasicInfoPanel: ({ character }) => <div data-testid="built-in-card">{character.name}</div>,
}))
vi.mock('../../src/modules/appearance/index.js', () => ({ applyAppearanceTheme: resetTheme }))
vi.mock('../../src/modules/settingLibraries/index.js', () => ({
  DynamicSettingsPanel: () => null,
  SettingLibraryPanel: () => null,
}))
vi.mock('../../src/modules/characterOpenings/index.js', () => ({ CharacterOpeningsPanel: () => null }))
vi.mock('../../src/modules/variables/index.js', () => ({ VariableConfigPanel: () => null }))
vi.mock('../../src/modules/regex/index.js', () => ({ RegexRulesPanel: () => null }))
vi.mock('../../src/app/services/windowControls.js', () => ({
  appWindow: { close: vi.fn() },
  showCurrentWindow: () => Promise.resolve(),
}))
vi.mock('../../src/app/windows/shell/components/TitleBar.jsx', () => ({ TitleBar: () => null }))
vi.mock('../../src/ui/ui/UnsavedChangesDialog.jsx', () => ({ UnsavedChangesDialog: ({ open, onSave, onDiscard, onCancel }) => open ? <div data-testid="unsaved-dialog">
  <button onClick={onSave}>保存并切换</button><button onClick={onDiscard}>放弃并切换</button><button onClick={onCancel}>留在当前页</button>
</div> : null }))

import { CharacterEditorWindow } from '../../src/app/windows/CharacterEditorWindow.jsx'
import { EditorSidebarLayout } from '../../src/ui/ui/EditorSidebarLayout.jsx'
import { DisplayPreferencesProvider } from '../../src/modules/settings/index.js'
import { CatalogSlotsContext } from '../../src/ui/ui/CatalogSlotsContext.jsx'

const preferencesSource = readFileSync(resolve('packages/client/features/dsh-client-display-preferences/src/client.js'), 'utf8');
function preferenceClient(remote) {
  let registration, model, cleanup;
  runInNewContext(preferencesSource, { window: { __ModuleLoader__: { load: value => { registration = value; } } } });
  dshClientPlugin(registration).apply({
    remote, provide: (_name, service) => { model = service; },
    effect: start => { cleanup = start(); }, on: () => () => {},
  });
  return { model, cleanup: () => cleanup() };
}

vi.stubGlobal('React', React)
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

afterEach(() => {
  saveCharacter.mockReset()
  resetTheme.mockReset()
  document.body.innerHTML = ''
  window.history.replaceState({}, '', '/')
})

describe('character editor client extension', () => {
  it('exposes navigation, toolbar and assets through the real editor and guards pending drafts', async () => {
    const character = { id: 'sample', name: '合成角色', persona: {} };
    const close = vi.fn();
    const update = vi.fn(async value => ({ items: [value] }));
    const render = (name, owner, fallback) => {
      if (name === 'eleckoi.character.editor.navigation') return <button onClick={() => owner.onSelect('assets')}>打开资产</button>;
      if (name === 'eleckoi.character.editor.toolbar') return <header>
        <button onClick={owner.onSave} disabled={!owner.dirty || owner.saving}>插件保存</button>
      </header>;
      return fallback;
    };
    const renderSection = (section, owner, fallback) => section === 'assets'
      ? <div data-assets-for={owner.characterId} /> : section === 'card'
        ? <button onClick={() => owner.onChange({ name: '编辑后' })}>改名</button> : fallback;
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    const click = label => act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === label).click());
    try {
      await act(async () => root.render(<CatalogSlotsContext.Provider value={{ render }}>
        <CharacterEditorWindow embeddedCharacterId={character.id} characterConfiguration={{}}
          characterCatalog={{ refresh: async () => ({ items: [character] }), update }}
          renderCharacterEditorSection={renderSection} onClose={close} />
      </CatalogSlotsContext.Provider>));
      await click('改名');
      await click('打开资产');
      expect(host.querySelector('[data-testid="unsaved-dialog"]')).not.toBeNull();
      expect(host.querySelector('[data-assets-for]')).toBeNull();
      await click('留在当前页');
      await click('插件保存');
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'sample', name: '编辑后' }));
      await click('打开资产');
      expect(host.querySelector('[data-assets-for]').dataset.assetsFor).toBe('sample');
      expect(close).not.toHaveBeenCalled();
    } finally { await act(() => root.unmount()); host.remove(); }
  });
  it.each([true, false])('does not flash a section heading while the character is loading (compact=%s)', async compact => {
    let complete;
    const pending = new Promise(resolve => { complete = resolve; });
    const catalog = { refresh: () => pending };
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<CharacterEditorWindow compact={compact} embeddedCharacterId="loading-card" characterCatalog={catalog} characterConfiguration={{}} />));
      const workspace = host.querySelector('.character-editor-workspace');
      expect(workspace.getAttribute('aria-busy')).toBe('true');
      expect(workspace.querySelector('h1,h2')).toBeNull();
      expect(workspace.textContent).toBe('');
      await act(async () => complete({ items: [{ id: 'loading-card', name: '合成加载角色', persona: {} }] }));
      expect(workspace.querySelector('[data-testid="built-in-card"]').textContent).toBe('合成加载角色');
      expect(workspace.querySelector('h1,h2')).toBeNull();
      expect(workspace.hasAttribute('aria-busy')).toBe(false);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });

  it('treats author-only changes as a draft, supports discard and saves the original author independently of the player', async () => {
    const original = { id: 'author-card', name: '合成角色', authorName: '原作者', authorAvatar: '', persona: { assistant_name: '合成角色', user_name: '当前玩家' } };
    const update = vi.fn(async character => ({ items: [character] }));
    const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    let owner;
    try {
      await act(async () => root.render(<CharacterEditorWindow embeddedCharacterId={original.id}
        characterCatalog={{ refresh: async () => ({ items: [original] }), update }} characterConfiguration={{}}
        renderCharacterEditorSection={(section, context, fallback) => { if (section === 'card') owner = context; return fallback; }} />));
      expect(owner.dirty).toBe(false);
      await act(async () => owner.onChange({ authorName: '新作者', authorAvatar: 'data:image/png;base64,YXV0aG9y' }));
      expect(owner.dirty).toBe(true);
      await act(async () => owner.onCancel());
      expect(owner.dirty).toBe(false); expect(owner.character.authorName).toBe('原作者');
      expect(update).not.toHaveBeenCalled();
      await act(async () => owner.onChange({ authorName: '新作者', authorAvatar: 'data:image/png;base64,YXV0aG9y' }));
      await act(async () => owner.onSave());
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ authorName: '新作者', authorAvatar: 'data:image/png;base64,YXV0aG9y', persona: original.persona }));
      expect(owner.dirty).toBe(false); expect(owner.saveNotice).toBe('saved');
    } finally { await act(async () => root.unmount()); }
  });

  it('places openings above settings and routes save, failure and discard to the opening controller', async () => {
    const character = { id: 'synthetic-character', name: '合成角色', persona: {} };
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true), discard = vi.fn();
    const handoff = vi.fn((section, owner, fallback) => {
      if (section !== 'openings') return fallback;
      owner.setController({ save, discard });
      return <button data-testid="edit-opening" onClick={() => owner.onDirtyChange(true)}>修改合成开场白</button>;
    });
    const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    const click = selector => act(async () => node.querySelector(selector).click());
    try {
      await act(async () => root.render(<CharacterEditorWindow embeddedCharacterId={character.id}
        characterCatalog={{ refresh: async () => ({ items: [character] }) }}
        characterConfiguration={{ openings: {} }} renderCharacterEditorSection={handoff} />));
      const labels = [...node.querySelectorAll('.character-editor-navigation button')].map(button => button.getAttribute('aria-label'));
      expect(labels.slice(0, 3)).toEqual(['基础资料', '开场白', '设定库']);
      await click('[aria-label="开场白"]');
      expect(handoff.mock.lastCall[0]).toBe('openings');
      await click('[data-testid="edit-opening"]');
      await click('[aria-label="设定库"]');
      expect(node.querySelector('[data-testid="unsaved-dialog"]')).toBeTruthy();
      await act(async () => [...node.querySelectorAll('button')].find(button => button.textContent === '保存并切换').click());
      expect(save).toHaveBeenCalledTimes(1);
      expect(node.querySelector('[aria-current="page"]').getAttribute('aria-label')).toBe('开场白');
      await act(async () => [...node.querySelectorAll('button')].find(button => button.textContent === '保存并切换').click());
      expect(node.querySelector('[aria-current="page"]').getAttribute('aria-label')).toBe('设定库');
      expect(saveCharacter).not.toHaveBeenCalled();
      await click('[aria-label="开场白"]'); await click('[data-testid="edit-opening"]'); await click('[aria-label="设定库"]');
      await act(async () => [...node.querySelectorAll('button')].find(button => button.textContent === '放弃并切换').click());
      expect(discard).toHaveBeenCalledTimes(1);
      expect(node.querySelector('[aria-current="page"]').getAttribute('aria-label')).toBe('设定库');
    } finally { await act(async () => root.unmount()); }
  });
  it('starts expanded and restores both rail states through a fresh preferences Client without changing other preferences or character data', async () => {
    const character = { id: 'synthetic-character', name: '合成角色', persona: {} };
    const catalog = { refresh: async () => ({ items: [character] }), update: saveCharacter };
    let stored = { ui: { pinned_chat_ids: ['synthetic-chat'] }, revision: 0, writable: true };
    const remote = { eleckoiDisplayPreferences: {
      read: async () => ({ ok: true, value: stored }),
      updateUi: vi.fn(async (ui, revision) => {
        expect(revision).toBe(stored.revision);
        stored = { ...stored, ui, revision: revision + 1 };
        return { ok: true, value: stored };
      }),
    }, $on: () => () => {} };
    const localWrite = vi.spyOn(Storage.prototype, 'setItem');
    const node = document.createElement('div'); document.body.append(node);
    let root, client;
    async function enter() {
      client = preferenceClient(remote); await client.model.refresh(); root = createRoot(node);
      await act(async () => root.render(<DisplayPreferencesProvider model={client.model}>
        <CharacterEditorWindow compact embeddedCharacterId={character.id} characterCatalog={catalog} characterConfiguration={{}} />
      </DisplayPreferencesProvider>));
    }
    async function leave() { await act(async () => root.unmount()); client.cleanup(); root = null; }
    try {
      await enter();
      expect(node.querySelector('.character-editor-sidebar-toggle').getAttribute('aria-expanded')).toBe('true');
      expect(remote.eleckoiDisplayPreferences.updateUi).not.toHaveBeenCalled();
      await act(async () => node.querySelector('.character-editor-sidebar-toggle').click());
      expect(stored.ui).toEqual({ pinned_chat_ids: ['synthetic-chat'], character_editor_sidebar_collapsed: true });
      await leave(); await enter();
      expect(node.querySelector('.is-sidebar-collapsed')).toBeTruthy();
      await act(async () => node.querySelector('.character-editor-sidebar-toggle').click());
      expect(stored.ui.character_editor_sidebar_collapsed).toBe(false);
      await leave(); await enter();
      expect(node.querySelector('.is-sidebar-collapsed')).toBeNull();
      expect(node.querySelector('[data-testid=built-in-card]').textContent).toBe('合成角色');
      expect(remote.eleckoiDisplayPreferences.updateUi).toHaveBeenCalledTimes(2);
      expect(saveCharacter).not.toHaveBeenCalled(); expect(localWrite).not.toHaveBeenCalled();
    } finally { if (root) await leave(); localWrite.mockRestore(); }
  });

  it('reports a preference write failure, retains the saved state and allows retry without saving character content', async () => {
    const character = { id: 'synthetic-character', name: '合成角色', persona: {} };
    const stored = { ui: {}, revision: 0, writable: true };
    const remote = { eleckoiDisplayPreferences: { read: async () => ({ ok: true, value: stored }),
      updateUi: vi.fn().mockResolvedValue({ ok: false, error: Object.assign(new Error('合成配置写入失败'), { isDSHRemoteError: true, code: 'gateway/internal', details: {} }) }),
    }, $on: () => () => {} };
    const client = preferenceClient(remote); await client.model.refresh();
    const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    try {
      await act(async () => root.render(<DisplayPreferencesProvider model={client.model}>
        <CharacterEditorWindow compact embeddedCharacterId={character.id} characterCatalog={{ refresh: async () => ({ items: [character] }) }} characterConfiguration={{}} />
      </DisplayPreferencesProvider>));
      await act(async () => node.querySelector('.character-editor-sidebar-toggle').click());
      expect(node.querySelector('.is-sidebar-collapsed')).toBeNull();
      expect(document.querySelector('[role=dialog]').textContent).toContain('保存侧边栏状态失败');
      expect(document.querySelector('[role=dialog]').textContent).not.toContain('合成配置写入失败');
      expect(stored.ui).toEqual({}); expect(saveCharacter).not.toHaveBeenCalled();
      await act(async () => document.querySelector('[role=dialog] button[aria-label="关闭错误详情"]').click());
      expect(document.querySelector('[role=dialog]')).toBeNull();
      remote.eleckoiDisplayPreferences.updateUi.mockImplementation(async ui => {
        stored.ui = ui; stored.revision += 1; return { ok: true, value: stored };
      });
      await act(async () => node.querySelector('.character-editor-sidebar-toggle').click());
      expect(node.querySelector('.is-sidebar-collapsed')).toBeTruthy();
      expect(stored.ui.character_editor_sidebar_collapsed).toBe(true);
    } finally { await act(async () => root.unmount()); client.cleanup(); }
  });

  it('toggles the compact rail without changing the active section or editing content', async () => {
    const character = { id: 'synthetic-character', name: '合成角色', persona: {} };
    const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    try {
      await act(async () => root.render(<CharacterEditorWindow compact embeddedCharacterId={character.id}
        characterCatalog={{ refresh: async () => ({ items: [character] }) }} characterConfiguration={{}} />));
      const navigation = node.querySelector('.character-editor-navigation');
      expect([...navigation.querySelectorAll('button')].map(button => button.getAttribute('aria-label')))
        .toEqual(['基础资料', '开场白', '设定库', '变量', '正则', '脚本', '前端', '资产库', '分支设定']);
      const toggle = node.querySelector('.character-editor-sidebar-toggle');
      expect(toggle.getAttribute('aria-label')).toBe('收起侧边栏');
      await act(async () => toggle.click());
      expect(node.querySelector('.is-sidebar-collapsed')).toBeTruthy();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-label')).toBe('展开侧边栏');
      expect(navigation.querySelector('[aria-current=page]').getAttribute('aria-label')).toBe('基础资料');
      expect(node.querySelector('[data-testid=built-in-card]').textContent).toBe('合成角色');
      await act(async () => toggle.click());
      expect(node.querySelector('.is-sidebar-collapsed')).toBeNull();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    } finally { await act(async () => root.unmount()); }
  });

  it('preserves the embedded theme and gives slot editors a full-page return path before leaving the character editor', async () => {
    const character = { id: 'synthetic-character', name: '合成角色', persona: {} };
    const catalog = { refresh: async () => ({ items: [character] }) };
    const backHandlers = [];
    const registerBackHandler = callback => { backHandlers.push(callback); return () => backHandlers.splice(backHandlers.indexOf(callback), 1); };
    function SlotEditor() {
      const [open, setOpen] = useState(false);
      return <EditorSidebarLayout inspectorTitle="合成子编辑页" onCloseInspector={() => setOpen(false)} inspector={open ? <aside>合成编辑内容</aside> : null}>
        <button type="button" onClick={() => setOpen(true)}>打开条目</button>
      </EditorSidebarLayout>;
    }
    const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    try {
      await act(async () => root.render(<CharacterEditorWindow compact embeddedCharacterId={character.id} characterCatalog={catalog} characterConfiguration={{}}
        registerBackHandler={registerBackHandler} renderCharacterEditorSection={() => <SlotEditor />}
        renderHeader={({ subpage }) => <header>{subpage?.title || '编辑角色'}</header>} />));
      expect(resetTheme).not.toHaveBeenCalled();
      await act(async () => node.querySelector('.editor-page-list button').click());
      expect(node.querySelector('.qq-character-editor-window-shell.is-editor-subpage')).toBeTruthy();
      expect(node.querySelector('header').textContent).toContain('ElecKoi');
      expect(node.querySelector('.character-editor-main-panel > header').textContent).toBe('合成子编辑页');
      expect(backHandlers).toHaveLength(1);
      await act(async () => backHandlers.at(-1)());
      expect(node.querySelector('.is-editor-subpage')).toBeNull();
      expect(node.querySelector('.editor-page-detail')).toBeNull();
      expect(node.querySelector('.character-editor-main-panel > header').textContent).toBe('编辑角色');
      expect(backHandlers).toHaveLength(0);
    } finally { await act(async () => root.unmount()); }
  });
  it('renders the real card editor through the DSH handoff and keeps its save action', async () => {
    window.history.replaceState({}, '', '/?view=character-editor&character=character-1')
    const initial = { id: 'character-1', name: '角色甲', persona: { assistant_name: '角色甲' } }
    const saved = { ...initial, name: '角色乙', persona: { assistant_name: '角色乙' } }
    const collection = { active_character_id: initial.id, groups: [], items: [initial] }
    const savedCollection = { ...collection, items: [saved] }
    const characterCatalog = { refresh: vi.fn().mockResolvedValue(collection), update: saveCharacter }
    saveCharacter.mockResolvedValue(savedCollection)
    const handoff = vi.fn((_section, _owner, fallback) => <div data-testid="extension-seat">{fallback}</div>)
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(<CharacterEditorWindow characterCatalog={characterCatalog}
          characterConfiguration={{}} />)
      })
      expect(container.querySelector('[data-testid="built-in-card"]')?.textContent).toBe('角色甲')
      expect(container.querySelector('[data-testid="extension-seat"]')).toBeNull()

      await act(async () => {
        root.render(<CharacterEditorWindow characterCatalog={characterCatalog}
          characterConfiguration={{}} renderCharacterEditorSection={handoff} />)
      })
      expect(container.querySelector('[data-testid="extension-seat"]')).not.toBeNull()
      expect(container.querySelector('[data-testid="built-in-card"]')?.textContent).toBe('角色甲')

      let savedResult
      await act(async () => { savedResult = await handoff.mock.lastCall[1].onSave(saved) })
      expect(savedResult).toBe(true)
      expect(saveCharacter).toHaveBeenCalledWith(saved)
      expect(container.querySelector('[data-testid="built-in-card"]')?.textContent).toBe('角色乙')
    } finally {
      await act(async () => root.unmount())
    }
  })
})
