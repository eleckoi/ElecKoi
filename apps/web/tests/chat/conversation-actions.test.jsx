// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { RoleplayInputMenu } from '../../src/modules/chat/components/RoleplayInputMenu.jsx';

let container, root;
const tick = async action => { await act(async () => { await action?.(); }); };
const named = (label, scope = document) => [...scope.querySelectorAll('button')].find(button => button.textContent === label);
const change = async (input, value) => tick(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
function models() {
  const listeners = new Set(), libraryListeners = new Set();
  let snapshot = { status: 'ready', catalog: { activePresetIds: { roleplay: 'rp', creator: 'studio' }, presets: [
    { id: 'rp', purpose: 'roleplay', name: '日常扮演', profile: { authorName: '阿鱼', authorAvatarPath: 'https://example.test/author.png' } },
    { id: 'long', purpose: 'roleplay', name: '长篇剧情', profile: { authorName: '小溪', authorAvatarPath: '' } },
    { id: 'studio', purpose: 'creator', name: '创作预设', profile: { authorName: '作者', authorAvatarPath: '' } },
  ] }, error: '' };
  const catalog = { subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => snapshot,
    refresh: vi.fn(async () => {}), setActive: vi.fn(async id => {
      const purpose = snapshot.catalog.presets.find(item => item.id === id).purpose;
      snapshot = { ...snapshot, catalog: { ...snapshot.catalog, activePresetIds: { ...snapshot.catalog.activePresetIds, [purpose]: id } } };
      listeners.forEach(fn => fn());
    }) };
  const value = { revision: 7, libraries: [
    { id: 'one', name: '海边小镇', enabled: true, entries: [{ id: 'entry', content: '正文必须保留' }], updatedAt: 'original' },
    { id: 'two', name: '小镇历史', enabled: false, entries: [], updatedAt: 'original' },
  ] };
  let libraryState = { status: 'ready', value };
  const global = { subscribe: fn => { libraryListeners.add(fn); return () => libraryListeners.delete(fn); }, getSnapshot: () => libraryState,
    read: vi.fn(async () => { libraryListeners.forEach(fn => fn('configuration', 'global', libraryState)); return libraryState.value; }),
    save: vi.fn(async next => { libraryState = { status: 'ready', value: { ...next, revision: 8 } }; libraryListeners.forEach(fn => fn('configuration', 'global', libraryState)); return libraryState.value; }) };
  return { catalog, global, value, view: { presets: catalog, characterConfiguration: { globalSettingLibraries: global } } };
}
async function renderMenu(state, props = {}) {
  await tick(() => root.render(<MainPageContext.Provider value={state.view}><RoleplayInputMenu canDeleteMessages regenerateTargetMessageId="reply" {...props} /></MainPageContext.Provider>));
  await tick(() => container.querySelector('.roleplay-menu-trigger').click());
}
beforeEach(() => { vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await tick(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('conversation menu actions', () => {
  it('keeps frequent actions in the main menu, regeneration below delete, and More last', async () => {
    const state = models(), preview = vi.fn(), variables = vi.fn(), regenerate = vi.fn();
    await renderMenu(state, { onOpenRequestPreview: preview, onOpenVariables: variables, onRegenerate: regenerate });
    expect([...document.querySelectorAll('[role=menuitem]')].map(button => button.textContent)).toEqual(['聊天记录', '工具', '切换预设', '全局设定库', '新建对话', '删除消息', '重新生成', '更多']);
    expect(named('切换预设').querySelector('img').src).toBe('https://example.test/author.png');
    await tick(() => named('重新生成').click()); expect(regenerate).toHaveBeenCalledWith({ targetMessageId: 'reply' });
    await tick(() => container.querySelector('.roleplay-menu-trigger').click());
    await tick(() => named('更多').click());
    expect(named('请求上下文预览')).toBeTruthy(); expect(named('变量查看与管理')).toBeTruthy();
    await tick(() => named('变量查看与管理').click()); expect(variables).toHaveBeenCalledOnce(); expect(preview).not.toHaveBeenCalled();
  });

  it.each(['roleplay', 'creator'])('uses purpose-filtered presets and real author avatars for %s', async purpose => {
    const state = models(); await renderMenu(state, { purpose });
    expect(Boolean(named('全局设定库'))).toBe(purpose === 'roleplay');
    await tick(() => named('切换预设').click());
    const rows = [...document.querySelectorAll('.conversation-preset-row')];
    expect(rows.map(row => row.querySelector('strong').textContent)).toEqual(purpose === 'roleplay' ? ['日常扮演', '长篇剧情'] : ['创作预设']);
    expect(rows[0].querySelector('img').alt).toBe(purpose === 'roleplay' ? '阿鱼' : '作者');
    if (purpose === 'roleplay') {
      await change(document.querySelector('input[type=search]'), '小溪');
      expect(document.querySelectorAll('.conversation-preset-row')).toHaveLength(1);
      await tick(() => document.querySelector('.conversation-preset-row').click()); expect(state.catalog.setActive).toHaveBeenCalledWith('long');
      expect(state.catalog.getSnapshot().catalog.activePresetIds.creator).toBe('studio');
    }
  });

  it('retains a failed preset selection for retry with the original error', async () => {
    const state = models(); state.catalog.setActive.mockRejectedValueOnce(new Error('upstream preset failure'));
    await renderMenu(state); await tick(() => named('切换预设').click());
    await tick(() => document.querySelectorAll('.conversation-preset-row')[1].click());
    expect(document.querySelector('[role=alert]').textContent).toContain('upstream preset failure');
    expect(document.querySelector('.conversation-action-dialog')).toBeTruthy();
    await tick(() => document.querySelectorAll('.conversation-preset-row')[1].click()); expect(state.catalog.setActive).toHaveBeenCalledTimes(2);
  });

  it('saves global library toggles explicitly without changing their contents or other metadata', async () => {
    const state = models(); await renderMenu(state); await tick(() => named('全局设定库').click());
    await tick(() => document.querySelectorAll('.conversation-global-row input')[1].click());
    expect(state.global.save).not.toHaveBeenCalled();
    await tick(() => named('保存').click());
    expect(state.global.save).toHaveBeenCalledExactlyOnceWith({ ...state.value, libraries: [state.value.libraries[0], { ...state.value.libraries[1], enabled: true }] });
    expect(document.querySelector('.conversation-action-dialog')).toBeNull();
  });

  it('prompts on unsaved close, can continue editing or discard, and does not prompt after reverting', async () => {
    const state = models(); await renderMenu(state); await tick(() => named('全局设定库').click());
    await tick(() => document.querySelector('.conversation-global-row input').click());
    await tick(() => document.querySelector('[aria-label="关闭"]').click());
    expect(named('不保存')).toBeTruthy(); expect(state.global.save).not.toHaveBeenCalled();
    await tick(() => named('取消').click()); expect(document.querySelector('.conversation-global-row input').checked).toBe(false);
    await tick(() => document.querySelector('[aria-label="返回菜单"]').click()); await tick(() => named('不保存').click());
    await tick(() => named('全局设定库').click()); expect(document.querySelector('.conversation-global-row input').checked).toBe(true);
    await tick(() => document.querySelector('.conversation-global-row input').click()); await tick(() => document.querySelector('.conversation-global-row input').click());
    expect(named('保存').disabled).toBe(true); await tick(() => document.querySelector('[aria-label="关闭"]').click());
    expect(document.querySelector('.conversation-action-dialog')).toBeNull(); expect(state.global.save).not.toHaveBeenCalled();
  });

  it('keeps global draft after a failed save and retries from its original error surface', async () => {
    const state = models(); state.global.save.mockRejectedValueOnce(new Error('revision conflict diagnostic'));
    await renderMenu(state); await tick(() => named('全局设定库').click()); await tick(() => document.querySelector('.conversation-global-row input').click());
    await tick(() => named('保存').click());
    expect(document.querySelector('[role=alert]').textContent).toContain('revision conflict diagnostic');
    expect(document.querySelector('.conversation-global-row input').checked).toBe(false);
    await tick(() => named('重试').click()); expect(state.global.save).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.conversation-action-dialog')).toBeNull();
  });

  it('retains the original load failure and clears it after a successful retry', async () => {
    const state = models(), idle = { status: 'idle', value: null };
    state.global.getSnapshot = () => idle;
    state.global.read.mockRejectedValueOnce(new Error('original load diagnostic'));
    await renderMenu(state); await tick(() => named('全局设定库').click());
    expect(document.querySelector('[role=alert]').textContent).toContain('original load diagnostic');
    await tick(() => named('重试').click());
    expect(document.querySelector('[role=alert]')).toBeNull();
    expect(document.querySelectorAll('.conversation-global-row')).toHaveLength(2);
  });

  it('consumes overlay Back before the route and restores the previous menu page', async () => {
    const state = models(), route = vi.fn(); window.addEventListener('eleckoi:platform-back', route);
    try {
      await renderMenu(state); await tick(() => named('更多').click());
      await tick(() => window.dispatchEvent(new Event('eleckoi:platform-back', { cancelable: true })));
      expect(named('切换预设')).toBeTruthy(); expect(route).not.toHaveBeenCalled();
      await tick(() => named('全局设定库').click());
      await tick(() => window.dispatchEvent(new Event('eleckoi:platform-back', { cancelable: true })));
      expect(named('切换预设')).toBeTruthy(); expect(route).not.toHaveBeenCalled();
      await tick(() => window.dispatchEvent(new Event('eleckoi:platform-back', { cancelable: true })));
      expect(document.querySelector('[role=menu]')).toBeNull(); expect(document.activeElement).toBe(container.querySelector('.roleplay-menu-trigger'));
    } finally { window.removeEventListener('eleckoi:platform-back', route); }
  });
});
