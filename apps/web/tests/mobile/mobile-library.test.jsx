// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileCharactersPage } from '../../src/mobile/MobileCharactersPage.jsx';
import { MobilePresetsPage } from '../../src/mobile/MobilePresetsPage.jsx';

const fixture = vi.hoisted(() => ({ presets: null }));
vi.mock('../../src/modules/presets/components/PresetPanel.jsx', () => ({ PresetProvider: ({ children }) => children, PresetWorkspace: () => null, usePresets: () => fixture.presets }));
vi.mock('../../src/app/windows/CharacterEditorWindow.jsx', () => ({ CharacterEditorWindow: () => null }));
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, view, saveGroups, start, select, renderSection, maskEvents, backHandlers;
const samples = [
  { id: 'character-a', name: '合成角色甲', description: '正式简介甲', profileLike: '旧字段内容', group: '分组甲', persona: {} },
  { id: 'character-b', name: '合成角色乙', description: '正式简介乙', group: '分组乙', persona: {} },
  { id: 'character-c', name: '合成角色丙', description: '', group: '', persona: {} },
];
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  backHandlers = []; saveGroups = vi.fn(); start = vi.fn(); select = vi.fn(); renderSection = vi.fn((key, owner, fallback) => fallback);
  maskEvents = [];
  document.addEventListener('eleckoi:system-bar-mask', recordMask);
});

function recordMask(event) { maskEvents.push(event.detail); }
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; document.body.replaceChildren(); document.removeEventListener('eleckoi:system-bar-mask', recordMask); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function mount(page = 'character', initialRoute = { kind: 'root' }, characters = samples) {
  function Harness() {
    const [route, setRoute] = useState(initialRoute);
    const [collection, setCollection] = useState({ items: structuredClone(characters), groups: ['分组甲', '分组乙'], active_character_id: 'character-a' });
    view = { route, routeBusy: false, scrollPositions: new Map(), guardRef: { current: null }, characters: { exportCharacters: vi.fn(), duplicate: vi.fn() },
      openDrawer: vi.fn(), pushRoute: setRoute, replaceRoute: setRoute, goBack: () => setRoute({ kind: 'root' }), openCharacterConversation: start,
      registerBackHandler: callback => { backHandlers.push(callback); return () => { backHandlers = backHandlers.filter(item => item !== callback); }; },
      renderCharacterPageSection: renderSection,
      chat: { characters: collection, selectCharacter: select, persona: { user_name: '合成用户' }, notify: vi.fn(),
        saveCharacterGroups: async (groups, assignments = []) => { await saveGroups(groups, assignments); setCollection(current => ({ ...current, groups, items: current.items.map(item => ({ ...item, group: assignments.find(value => value.characterId === item.id)?.group ?? item.group })) })); },
        deleteCharacterIds: vi.fn() },
    };
    return <MainPageContext.Provider value={view}><main className="mobile-shell">{page === 'character' ? <MobileCharactersPage /> : <MobilePresetsPage />}</main></MainPageContext.Provider>;
  }
  const node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<Harness />));
}
async function click(label, within = document) {
  const button = [...within.querySelectorAll('button')].find(item => item.textContent.trim() === label || item.getAttribute('aria-label') === label);
  expect(button, label).toBeTruthy(); await act(async () => button.click());
}
async function input(value) {
  const node = document.querySelector('input[aria-label="名称"]');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); });
}

describe('Android character and preset library contracts', () => {
  it('copies only selected cards and keeps failed cards selected for retry', async () => {
    await mount()
    view.characters.duplicate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Synthetic copy failure')).mockResolvedValue({})
    await click('角色操作'); await click('复制角色卡')
    expect(document.querySelector('[aria-label="导出格式"]')).toBeNull()
    await click('合成角色甲'); await click('合成角色丙'); await click('复制')
    expect(view.characters.duplicate.mock.calls).toEqual([['character-a'], ['character-c']])
    expect(view.chat.notify).toHaveBeenCalledWith('info', '已复制 1 张角色卡')
    expect(document.querySelectorAll('.mobile-character-card[aria-pressed=true]')).toHaveLength(1)
    expect(document.querySelector('.mobile-character-card[aria-pressed=true]').getAttribute('aria-label')).toBe('合成角色丙')
    expect(document.querySelector('.mobile-inline-error').textContent).toContain('Synthetic copy failure')
    await click('复制')
    expect(view.characters.duplicate.mock.calls).toEqual([['character-a'], ['character-c'], ['character-c']])
    expect(document.querySelector('.mobile-library-selection-header')).toBeNull()
  })

  it.each([0, 1])('keeps canceled export selection and only reports files actually saved (%i written)', async count => {
    await mount()
    view.characters.exportCharacters.mockResolvedValue({ canceled: true, written: samples.slice(0, count).map(item => ({ characterId: item.id, fileName: 'synthetic.png' })), failures: [] })
    await click('角色操作'); await click('导出角色卡'); await click('全选'); await click('导出')
    expect(document.querySelector('.mobile-library-selection-header')).toBeTruthy()
    expect(document.querySelectorAll('.mobile-character-card[aria-pressed=true]')).toHaveLength(3 - count)
    if (count) expect(view.chat.notify).toHaveBeenCalledWith('info', '已导出 1 张角色卡')
    else expect(view.chat.notify).not.toHaveBeenCalled()
    expect(document.querySelector('.mobile-inline-error')).toBeNull()
  })

  it('selects more than fifty export cards individually and through select all', async () => {
    const characters = Array.from({ length: 101 }, (_, index) => ({ id: `synthetic-card-${index}`, name: `Synthetic card ${index}`, group: '', persona: {} }));
    await mount('character', { kind: 'root' }, characters);
    await click('角色操作');
    await click('导出角色卡');
    for (const character of characters.slice(0, 51)) await click(character.name);
    expect(document.querySelectorAll('.mobile-character-card[aria-pressed=true]')).toHaveLength(51);
    await click('全选');
    expect(document.querySelectorAll('.mobile-character-card[aria-pressed=true]')).toHaveLength(101);
    expect(document.querySelector('.mobile-inline-error')).toBeNull();
  });

  it('uses a single portrait through the official slot and keeps actions outside the long introduction scroll', async () => {
    await mount('character', { kind: 'character-profile', characterId: 'character-a' });
    expect(document.querySelector('.character-deck')).toBeNull();
    expect(document.querySelector('.character-profile-portrait')).toBeTruthy();
    expect(document.querySelector('.character-profile-scroll .character-profile-actions')).toBeNull();
    expect(document.querySelector('.character-profile-scroll').nextElementSibling.className).toBe('character-profile-actions');
    expect(document.querySelector('.mobile-header [aria-label="编辑角色"]')).toBeNull();
    expect(document.querySelector('select')).toBeNull();
    expect(document.querySelector('.character-profile-copy').textContent).toContain('正式简介甲');
    expect(document.querySelector('.character-profile-copy').textContent).not.toContain('旧字段内容');
    expect(renderSection.mock.calls[0][0]).toBe('profile');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(select).not.toHaveBeenCalled();
    await click('开始对话'); expect(start).toHaveBeenCalledWith('character-a');
    await click('编辑角色'); expect(view.route).toEqual({ kind: 'character-editor', characterId: 'character-a' });
  });
  it('opens the anchored action menu, restores focus and enters a full-page manager', async () => {
    await mount(); await click('角色操作');
    const menu = document.querySelector('.mobile-bubble-menu');
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent.trim()))
      .toEqual(['新建角色', '分组管理', '复制角色卡', '导入角色卡', '导出角色卡', '删除角色卡']);
    expect(menu.querySelectorAll('hr')).toHaveLength(2);
    expect(document.querySelector('.mobile-dialog')).toBeNull();
    expect(maskEvents.filter(event => event.active)).toHaveLength(1);
    await act(async () => backHandlers.at(-1)());
    expect(document.activeElement.getAttribute('aria-label')).toBe('角色操作'); expect(maskEvents.filter(event => !event.active)).toHaveLength(1);
    await click('角色操作'); await click('分组管理');
    expect(view.route.kind).toBe('character-groups');
    expect(document.querySelector('.mobile-group-manager')).toBeTruthy(); expect(document.querySelector('.mobile-bubble-menu')).toBeNull();
  });
  it('renames memberships atomically, rejects duplicate names, and confirms deletion with the PC destination', async () => {
    await mount('character', { kind: 'character-groups' });
    await click('分组甲 (1)'); await input('分组乙'); await click('保存');
    expect(saveGroups).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]').textContent).toContain('已存在');
    await input('分组丙'); await click('保存');
    expect(saveGroups).toHaveBeenLastCalledWith(['分组丙', '分组乙'], [{ characterId: 'character-a', group: '分组丙' }]);
    await click('删除分组'); await click('删除分组 分组丙');
    expect(saveGroups).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.mobile-library-dialog').textContent).toContain('移至“分组乙”');
    await click('删除', document.querySelector('.mobile-library-dialog'));
    expect(saveGroups).toHaveBeenLastCalledWith(['分组乙'], [{ characterId: 'character-a', group: '分组乙' }]);
  });
  it('saves explicit group membership without touching other unselected groups and keeps failed saves open', async () => {
    await mount('character', { kind: 'character-groups' }); await click('管理分组 分组甲 的角色');
    await click('合成角色甲'); await click('合成角色丙');
    saveGroups.mockRejectedValueOnce(new Error('保存失败'));
    await click('保存'); expect(document.querySelector('.mobile-library-selection-header')).toBeTruthy();
    expect(document.querySelector('[role="alert"]').textContent).toContain('保存失败');
    await click('保存');
    expect(saveGroups).toHaveBeenLastCalledWith(['分组甲', '分组乙'], [{ characterId: 'character-a', group: '' }, { characterId: 'character-c', group: '分组甲' }]);
  });
  it('keeps group order in the formal group list and supports keyboard reordering', async () => {
    await mount('character', { kind: 'character-groups' });
    await act(async () => document.querySelector('[aria-label="调整分组 分组乙 的顺序"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(saveGroups).toHaveBeenLastCalledWith(['分组乙', '分组甲'], []);
  });
  it('excludes the protected default preset from batch deletion and retries only failed IDs', async () => {
    const presets = ['agent-preset-standard', 'preset-a', 'preset-b'].map((id, index) => ({ id, purpose: 'roleplay', name: `合成预设${index}`, libraryGroupId: '', profile: {}, modelTags: [] }));
    const remove = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('写入失败')).mockResolvedValue({});
    const catalog = { presets, groups: [], activePresetIds: { roleplay: 'agent-preset-standard', creator: 'agent-preset-creator' } };
    fixture.presets = { catalog, purposeCatalog: catalog, purpose: 'roleplay', setPurpose: vi.fn(), catalogModel: { delete: remove }, setSelectedPresetId: vi.fn(), refresh: vi.fn() };
    await mount('presets'); await click('预设操作');
    expect([...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toEqual(['新建预设', '导入预设', '导出预设', '批量删除']);
    await click('批量删除'); await click('全选');
    expect(document.querySelector('.mobile-selection-bar').textContent).toContain('2 项');
    expect(document.querySelector('.mobile-preset-open').disabled).toBe(true);
    await click('删除'); await click('删除', document.querySelector('.mobile-library-dialog'));
    expect(remove.mock.calls.map(([id]) => id)).toEqual(['preset-a', 'preset-b']);
    expect(document.querySelector('.mobile-selection-bar').textContent).toContain('1 项');
    expect(document.querySelector('.mobile-library-dialog [role="alert"]').textContent).toContain('操作失败，请重试。');
    await click('删除', document.querySelector('.mobile-library-dialog'));
    expect(remove.mock.calls.map(([id]) => id)).toEqual(['preset-a', 'preset-b', 'preset-b']);
    expect(document.querySelector('.mobile-library-selection-header')).toBeNull();
  });
});
