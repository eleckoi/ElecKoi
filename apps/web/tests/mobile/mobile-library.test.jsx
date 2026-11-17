// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileCharactersPage } from '../../src/mobile/MobileCharactersPage.jsx';
import { MobilePresetsPage } from '../../src/mobile/MobilePresetsPage.jsx';
import '../helpers/masonryGeometry.js';

const fixture = vi.hoisted(() => ({ presets: null }));
vi.mock('../../src/modules/presets/components/PresetPanel.jsx', () => ({ PresetProvider: ({ children }) => children, PresetWorkspace: () => null, usePresets: () => fixture.presets }));
vi.mock('../../src/app/windows/CharacterEditorWindow.jsx', () => ({ CharacterEditorWindow: () => null }));
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, view, saveGroups, start, select, renderSection, maskEvents, backHandlers, removeCharacter, goBack;
const samples = [
  { id: 'character-a', name: '合成角色甲', description: '正式简介甲', profileLike: '旧字段内容', group: '分组甲', persona: {} },
  { id: 'character-b', name: '合成角色乙', description: '正式简介乙', group: '分组乙', persona: {} },
  { id: 'character-c', name: '合成角色丙', description: '', group: '', persona: {} },
];
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  backHandlers = []; saveGroups = vi.fn(); start = vi.fn(); select = vi.fn(); renderSection = vi.fn((key, owner, fallback) => fallback);
  removeCharacter = vi.fn(); goBack = vi.fn();
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
      openDrawer: vi.fn(), pushRoute: setRoute, replaceRoute: setRoute, goBack: () => { goBack(); setRoute({ kind: 'root' }); }, openCharacterConversation: start,
      registerBackHandler: callback => { backHandlers.push(callback); return () => { backHandlers = backHandlers.filter(item => item !== callback); }; },
      renderCharacterPageSection: renderSection,
      chat: { characters: collection, selectCharacter: select, persona: { user_name: '合成用户' }, notify: vi.fn(),
        saveCharacterGroups: async (groups, assignments = []) => { await saveGroups(groups, assignments); setCollection(current => ({ ...current, groups, items: current.items.map(item => ({ ...item, group: assignments.find(value => value.characterId === item.id)?.group ?? item.group })) })); },
        deleteCharacterIds: async ids => { await removeCharacter(ids); setCollection(current => ({ ...current, items: current.items.filter(item => !ids.includes(item.id)) })); } },
    };
    return <MainPageContext.Provider value={view}><main className="mobile-shell">{page === 'character' ? <MobileCharactersPage /> : <MobilePresetsPage />}</main></MainPageContext.Provider>;
  }
  const node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<Harness />));
}
async function click(label, within = document) {
  const find = () => [...within.querySelectorAll('button')].find(item => item.textContent.trim() === label || item.getAttribute('aria-label') === label);
  let button = find();
  const target = view?.chat?.characters?.items.findIndex(item => item.name === label);
  if (!button && target >= 0) {
    const viewport = document.querySelector('.mobile-character-list');
    for (let n = 0; viewport && !button && n < view.chat.characters.items.length * 2; n++) {
      const first = Number(viewport.querySelector('[data-index]')?.dataset.index || 0);
      await act(async () => { viewport.scrollTop = Math.max(0, viewport.scrollTop + (first > target ? -200 : 200)); viewport.dispatchEvent(new Event('scroll')); });
      button = find();
    }
  }
  expect(button, label).toBeTruthy(); await act(async () => button.click());
}
async function input(value) {
  const node = document.querySelector('input[aria-label="名称"]');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); });
}

describe('Android character and preset library contracts', () => {
  it('shows the original card author and leaves missing authors empty instead of using the current player', async () => {
    await mount('character', { kind: 'root' }, [
      { ...samples[0], authorName: '原始作者', authorAvatar: 'data:image/png;base64,YXV0aG9y' },
      { ...samples[1] },
    ]);
    const cards = [...document.querySelectorAll('.mobile-character-card')];
    expect(cards[0].querySelector('.mobile-character-author').textContent).toContain('原始作者');
    expect(cards[1].textContent).toContain('未填写作者');
    expect(cards.some(card => card.textContent.includes('合成用户'))).toBe(false);
  });

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

  it('offers PNG and ZIP exports and passes the selected ZIP format to the export service', async () => {
    await mount(); await click('角色操作'); await click('导出角色卡');
    const format = document.querySelector('select[aria-label="导出格式"]');
    expect([...format.options].map(option => option.value)).toEqual(['png', 'zip']);
    await act(() => { format.value = 'zip'; format.dispatchEvent(new Event('change', { bubbles: true })); });
    view.characters.exportCharacters.mockResolvedValue({ canceled: true, written: [], failures: [] });
    await click('合成角色甲'); await click('导出');
    expect(view.characters.exportCharacters).toHaveBeenCalledWith(['character-a'], 'zip');
  });
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
    expect(document.querySelector('.mobile-library-selection-header').textContent).toContain('51 张');
    await click('全选');
    expect(document.querySelector('.mobile-library-selection-header').textContent).toContain('101 张');
    view.characters.exportCharacters.mockResolvedValue({ canceled: true, written: [], failures: [] });
    await click('导出');
    expect(view.characters.exportCharacters).toHaveBeenCalledWith(characters.map(item => item.id), 'png');
    expect(document.querySelector('.mobile-inline-error')).toBeNull();
  });

  it('uses a single portrait through the official slot and keeps actions outside the long introduction scroll', async () => {
    const description = `正式简介甲\n\n${'合成长简介正文。'.repeat(1500)}\n\n简介末尾`;
    const authorAvatar = 'data:image/png;base64,YXV0aG9y';
    await mount('character', { kind: 'character-profile', characterId: 'character-a' }, [{ ...samples[0], description, authorName: '原始作者', authorAvatar }]);
    expect(document.querySelector('.character-deck')).toBeNull();
    expect(document.querySelector('.character-profile-portrait')).toBeTruthy();
    expect(document.querySelector('.character-profile-scroll .character-profile-actions')).toBeNull();
    expect(document.querySelector('.character-profile-scroll').nextElementSibling.className).toBe('character-profile-actions');
    expect(document.querySelector('.mobile-header [aria-label="编辑角色"]')).toBeNull();
    expect(document.querySelector('select')).toBeNull();
    expect(document.querySelector('.character-profile-copy p').textContent).toBe(description);
    expect(document.querySelector('.character-profile-copy').textContent).not.toContain('旧字段内容');
    expect(document.querySelector('.character-profile-sheet .character-profile-identity h1').textContent).toBe(samples[0].name);
    expect(document.querySelector('.character-profile-author').textContent).toBe('原始作者');
    expect(document.querySelector('.character-profile-author img').getAttribute('src')).toBe(authorAvatar);
    expect(document.querySelector('.character-profile-sheet .character-profile-copy h2').textContent).toBe('简介');
    expect(document.querySelector('.character-profile-panel').textContent).not.toContain('合成用户');
    expect(renderSection.mock.calls[0][0]).toBe('profile');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(select).not.toHaveBeenCalled();
    await click('进入对话'); expect(start).toHaveBeenCalledWith('character-a');
    await click('编辑角色'); expect(view.route).toEqual({ kind: 'character-editor', characterId: 'character-a' });
  });
  it.each(['png', 'zip'])('exports only the viewed character as %s through the shared bubble menu and permits retry', async format => {
    await mount('character', { kind: 'character-profile', characterId: 'character-b' });
    await click('角色操作');
    const menu = document.querySelector('.mobile-bubble-menu');
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent.trim())).toEqual(['导出 PNG', '导出 ZIP', '删除角色']);
    expect([...menu.querySelectorAll('[role="menuitem"]')].at(-1).classList.contains('is-destructive')).toBe(true);
    expect(menu.querySelectorAll('hr')).toHaveLength(1);
    view.characters.exportCharacters.mockResolvedValueOnce({ canceled: false, written: [], failures: [{ characterId: 'character-b', message: 'Synthetic export failure' }] })
      .mockResolvedValueOnce({ canceled: false, written: [{ characterId: 'character-b', fileName: `card.${format}` }], failures: [] });
    await click(`导出 ${format.toUpperCase()}`);
    expect(menu.querySelector('[role="alert"]').textContent).toContain('操作失败，请重试。');
    expect(view.chat.notify).not.toHaveBeenCalled();
    expect(removeCharacter).not.toHaveBeenCalled();
    await click(`导出 ${format.toUpperCase()}`);
    expect(view.characters.exportCharacters.mock.calls).toEqual([[['character-b'], format], [['character-b'], format]]);
    expect(document.querySelector('.mobile-bubble-menu')).toBeNull();
    expect(view.chat.notify).toHaveBeenCalledWith('info', '已导出 1 张角色卡');
    expect(view.route).toEqual({ kind: 'character-profile', characterId: 'character-b' });
    expect(document.activeElement.getAttribute('aria-label')).toBe('角色操作');
  });
  it('does not report a canceled single export as saved and blocks repeated export taps while pending', async () => {
    await mount('character', { kind: 'character-profile', characterId: 'character-c' });
    let finish;
    view.characters.exportCharacters.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await click('角色操作');
    const button = document.querySelector('[role="menuitem"]');
    await act(async () => button.click());
    expect([...document.querySelectorAll('[role="menuitem"]')].every(item => item.disabled)).toBe(true);
    await act(async () => button.click());
    expect(view.characters.exportCharacters).toHaveBeenCalledTimes(1);
    await act(async () => finish({ canceled: true, written: [], failures: [] }));
    expect(view.chat.notify).not.toHaveBeenCalled();
    expect(view.route.characterId).toBe('character-c');
    expect(document.querySelector('.mobile-bubble-menu')).toBeNull();
  });
  it('confirms deletion of the viewed character, preserves it on cancel or failure and returns only after success', async () => {
    await mount('character', { kind: 'character-profile', characterId: 'character-b' });
    await click('角色操作'); await click('删除角色');
    let dialog = document.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain('确认删除“合成角色乙”？');
    expect(removeCharacter).not.toHaveBeenCalled();
    await click('取消', dialog);
    expect(view.route.characterId).toBe('character-b');
    expect(removeCharacter).not.toHaveBeenCalled();
    await click('角色操作'); await click('删除角色');
    removeCharacter.mockRejectedValueOnce(new Error('Synthetic delete failure'));
    await click('删除', document.querySelector('[role="dialog"]'));
    dialog = document.querySelector('[role="dialog"]');
    expect(dialog.querySelector('[role="alert"]').textContent).toContain('Synthetic delete failure');
    expect(view.route.characterId).toBe('character-b');
    expect(view.chat.characters.items.map(item => item.id)).toEqual(['character-a', 'character-b', 'character-c']);
    await click('删除', dialog);
    expect(removeCharacter.mock.calls).toEqual([[['character-b']], [['character-b']]]);
    expect(view.route).toEqual({ kind: 'root' });
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(view.chat.characters.items.map(item => item.id)).toEqual(['character-a', 'character-c']);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('.mobile-library-selection-header')).toBeNull();
  });
  it('does not navigate again if a pending deletion finishes after leaving the profile', async () => {
    await mount('character', { kind: 'character-profile', characterId: 'character-b' });
    let finish;
    removeCharacter.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await click('角色操作'); await click('删除角色'); await click('删除', document.querySelector('[role="dialog"]'));
    await click('返回', document.querySelector('.mobile-header'));
    expect(goBack).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(view.route).toEqual({ kind: 'root' });
    expect(view.chat.characters.items.map(item => item.id)).toEqual(['character-a', 'character-c']);
  });
  it('omits actions for a missing character and closes the detail menu on Back without leaving the profile', async () => {
    await mount('character', { kind: 'character-profile', characterId: 'character-c' });
    await click('角色操作');
    await act(async () => backHandlers.at(-1)());
    expect(document.querySelector('.mobile-bubble-menu')).toBeNull();
    expect(view.route.characterId).toBe('character-c');
    await act(async () => view.replaceRoute({ kind: 'character-profile', characterId: 'missing' }));
    expect(document.querySelector('.mobile-header [aria-label="角色操作"]')).toBeNull();
    expect(document.querySelector('.mobile-state').textContent).toBe('角色不存在');
  });
  it('keeps missing author and introduction explicit and recovers failed portrait and author images', async () => {
    await mount('character', { kind: 'character-profile', characterId: 'character-c' }, [{ ...samples[2], persona: { assistant_cover: 'broken-cover.png' }, authorAvatar: 'broken-author.png' }]);
    expect(document.querySelector('.character-profile-author').textContent).toBe('未填写作者');
    expect(document.querySelector('.character-profile-copy .is-empty').textContent).toBe('暂无简介');
    expect(document.querySelector('.character-profile-panel').textContent).not.toContain('合成用户');
    await act(async () => {
      document.querySelector('.character-profile-portrait img').dispatchEvent(new Event('error'));
      document.querySelector('.character-profile-author img').dispatchEvent(new Event('error'));
    });
    expect(document.querySelector('.character-profile-portrait img')).toBeNull();
    expect(document.querySelector('.character-profile-portrait').textContent).toBe('封面立绘');
    expect(document.querySelector('.character-profile-author img')).toBeNull();
    await click('进入对话'); expect(start).toHaveBeenCalledWith('character-c');
  });
  it('replaces the old manager with quick group switching and batch moving while preserving the action menu', async () => {
    await mount(); await click('角色操作');
    const menu = document.querySelector('.mobile-bubble-menu');
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent.trim()))
      .toEqual(['新建角色', '移动角色', '复制角色卡', '导入角色卡', '导出角色卡', '删除角色卡']);
    await act(async () => backHandlers.at(-1)());
    expect(document.activeElement.getAttribute('aria-label')).toBe('角色操作');
    await click('展开分组'); await click('分组甲', document.querySelector('.mobile-character-library-group-panel'));
    expect(document.querySelector('.mobile-character-library-panel-reveal').classList.contains('is-open')).toBe(false);
    expect([...document.querySelectorAll('.mobile-character-card')].map(node => node.getAttribute('aria-label'))).toEqual(['合成角色甲']);
    expect(document.querySelector('.mobile-character-library-tabs [aria-pressed=true]').textContent).toBe('分组甲');
    expect(document.querySelector('.mobile-character-library-tabs').textContent).not.toMatch(/\d/);
    await click('展开分组'); await click('全部', document.querySelector('.mobile-character-library-group-panel'));
    await click('角色操作'); await click('移动角色'); await click('合成角色甲'); await click('合成角色丙'); await click('移动到分组');
    expect(document.querySelectorAll('.mobile-character-selection[data-selected="true"]')).toHaveLength(2);
    expect(document.querySelector('.mobile-character-selection[data-selected="false"] svg')).toBeNull();
    await click('分组乙', document.querySelector('.mobile-character-library-group-panel'));
    expect(saveGroups).toHaveBeenLastCalledWith(['分组甲', '分组乙'], [{ characterId: 'character-a', group: '分组乙' }, { characterId: 'character-c', group: '分组乙' }]);
    expect(document.querySelector('.mobile-library-selection-header')).toBeNull();
    expect(document.querySelectorAll('.mobile-character-card')).toHaveLength(3);
  });
  it('renames memberships atomically, rejects duplicate names and deletes only the group', async () => {
    await mount(); await click('展开分组'); await click('进入编辑');
    await click('分组 分组甲，长按拖动，点击改名'); await input('分组乙'); await click('保存');
    expect(saveGroups).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]').textContent).toContain('已存在');
    await input('分组丙'); await click('保存');
    expect(saveGroups).toHaveBeenLastCalledWith(['分组丙', '分组乙'], [{ characterId: 'character-a', group: '分组丙' }]);
    await click('删除分组 分组丙'); expect(saveGroups).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]').textContent).toContain('角色卡保留');
    await click('删除', document.querySelector('[role="dialog"]'));
    expect(saveGroups).toHaveBeenLastCalledWith(['分组乙'], [{ characterId: 'character-a', group: '' }]);
    expect(view.chat.characters.items).toHaveLength(3);
  });
  it('keeps editing expanded through Back and outside clicks, and saves ordering only on Done', async () => {
    await mount(); await click('展开分组'); await click('进入编辑');
    const chip = document.querySelector('[data-reorder-group="分组乙"] .mobile-character-library-group-chip');
    await act(async () => chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(saveGroups).not.toHaveBeenCalled();
    expect([...document.querySelectorAll('.mobile-character-library-group-grid [data-reorder-group]')].map(node => node.dataset.reorderGroup)).toEqual(['分组乙', '分组甲']);
    expect([...document.querySelectorAll('[aria-label="收起分组"]')].every(node => node.disabled)).toBe(true);
    await click('关闭分组面板'); await act(async () => backHandlers.at(-1)());
    expect(document.querySelector('.mobile-character-library-panel-reveal').classList.contains('is-open')).toBe(true);
    saveGroups.mockRejectedValueOnce(new Error('排序写入失败'));
    await click('完成编辑'); expect(document.querySelector('[role="alert"]').textContent).toContain('排序写入失败');
    expect(document.querySelector('.mobile-character-library-edit-mode').textContent).toBe('完成编辑');
    await click('完成编辑'); expect(saveGroups).toHaveBeenLastCalledWith(['分组乙', '分组甲'], []);
    await click('收起分组', document.querySelector('.mobile-character-library-group-panel'));
    expect(document.querySelector('.mobile-character-library-panel-reveal').classList.contains('is-open')).toBe(false);
  });
  it('keeps failed new groups and member moves available for retry', async () => {
    await mount(); await click('展开分组'); await click('新建'); await input('分组丙');
    saveGroups.mockRejectedValueOnce(new Error('新建写入失败')); await click('保存');
    expect(document.querySelector('input[aria-label="名称"]').value).toBe('分组丙');
    await click('保存'); expect(saveGroups).toHaveBeenLastCalledWith(['分组甲', '分组乙', '分组丙'], []);
    await click('全部', document.querySelector('.mobile-character-library-group-panel'));
    await click('角色操作'); await click('移动角色'); await click('合成角色甲'); await click('移动到分组');
    saveGroups.mockRejectedValueOnce(new Error('成员写入失败'));
    await click('分组乙', document.querySelector('.mobile-character-library-group-panel'));
    expect(document.querySelectorAll('.mobile-character-card[aria-pressed=true]')).toHaveLength(1);
    expect(document.querySelector('.mobile-character-library-panel-reveal').classList.contains('is-open')).toBe(true);
    await click('分组乙', document.querySelector('.mobile-character-library-group-panel'));
    expect(document.querySelector('.mobile-library-selection-header')).toBeNull();
  });
  it('excludes the protected default preset from batch deletion and retries only failed IDs', async () => {
    const presets = ['agent-preset-standard', 'preset-a', 'preset-b'].map((id, index) => ({ id, purpose: 'roleplay', name: `合成预设${index}`, libraryGroupId: '', profile: {}, modelTags: [] }));
    const remove = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('写入失败')).mockResolvedValue({});
    const catalog = { presets, groups: [], activePresetIds: { roleplay: 'agent-preset-standard', creator: 'agent-preset-creator' } };
    fixture.presets = { catalog, purposeCatalog: catalog, purpose: 'roleplay', setPurpose: vi.fn(), catalogModel: { delete: remove }, setSelectedPresetId: vi.fn(), refresh: vi.fn() };
    await mount('presets'); await click('预设操作');
    expect([...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toEqual(['新建预设', '导入预设', '导出预设', '批量删除']);
    await click('批量删除'); await click('全选');
    expect(document.querySelector('.mobile-library-selection-header .mobile-selection-summary').textContent).toBe('2 项');
    expect(document.querySelector('.mobile-preset-open').disabled).toBe(true);
    await click('删除'); await click('删除', document.querySelector('[role="dialog"]'));
    expect(remove.mock.calls.map(([id]) => id)).toEqual(['preset-a', 'preset-b']);
    expect(document.querySelector('.mobile-library-selection-header .mobile-selection-summary').textContent).toBe('1 项');
    expect(document.querySelector('[role="dialog"] [role="alert"]').textContent).toContain('操作失败，请重试。');
    await click('删除', document.querySelector('[role="dialog"]'));
    expect(remove.mock.calls.map(([id]) => id)).toEqual(['preset-a', 'preset-b', 'preset-b']);
    expect(document.querySelector('.mobile-library-selection-header')).toBeNull();
  });
});
