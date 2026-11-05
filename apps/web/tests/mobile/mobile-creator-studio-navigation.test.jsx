// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileCreatorStudioPage } from '../../src/mobile/MobileCreatorStudioPage.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.React = React;
const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function mount(selectedCharacter = false, characterExists = selectedCharacter) {
  const current = { sessionId: 'synthetic-current', characterId: selectedCharacter ? 'synthetic-character' : '', presetId: 'synthetic-creator' };
  let snapshot = { status: 'ready', active: current, reference: {}, error: '', items: [
    { ...current, title: '合成对话', updatedAt: Date.now(), pinned: false, pinIndex: -1 },
  ] };
  const listeners = new Set();
  const model = {
    getSnapshot: () => snapshot, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    restoreRecent: vi.fn(async () => current), refresh: vi.fn(async () => snapshot.items), release: vi.fn(),
    create: vi.fn(async () => current), open: vi.fn(async () => current),
    pin: vi.fn(async id => { snapshot = { ...snapshot, items: snapshot.items.map(item => item.sessionId === id ? { ...item, pinned: true, pinIndex: 0 } : item) }; listeners.forEach(listener => listener()); }),
    rename: vi.fn(async () => {}), delete: vi.fn(async () => {}), search: vi.fn(async () => ({ items: [], hasMore: false })),
  };
  const characterSnapshot = { collection: { items: characterExists ? [{ id: 'synthetic-character', name: '合成角色', avatar: '' }] : [], groups: [] }, status: 'ready', error: '' };
  const drawerSnapshot = { shown: false };
  const view = { navigation: { sidebar: { subscribe: () => () => {}, getSnapshot: () => drawerSnapshot }, closeSidebar: vi.fn() }, openWorkspaceDrawer: vi.fn(), creatorStudio: { sessions: model }, characters: { subscribe: () => () => {}, getSnapshot: () => characterSnapshot },
    renderCreatorStudioConversation: vi.fn(() => <div>合成会话内容</div>), goBack: vi.fn(), registerBackHandler: () => () => {} };
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(<MainPageContext.Provider value={view}><MobileCreatorStudioPage /></MainPageContext.Provider>));
  cleanups.push(async () => { await act(async () => root.unmount()); node.remove(); });
  const click = async label => { const button = [...node.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent.trim() === label); expect(button, label).toBeTruthy(); await act(async () => button.click()); };
  return { node, model, view, click };
}
describe('Android AI creator studio navigation', () => {
  it('opens the official workspace drawer from the list button', async () => {
    const f = await mount(true);
    expect(f.node.querySelector('.creator-studio-target')).toBeNull();
    await f.click('工作室侧边栏');
    expect(f.view.openWorkspaceDrawer).toHaveBeenCalledOnce();
    expect(f.node.querySelector('.creator-studio-sidebar')).toBeNull();
    const props = f.view.renderCreatorStudioConversation.mock.calls.at(-1)[0].props;
    await act(async () => props.onSelectCharacter());
    expect(f.node.querySelector('.creator-studio-character-picker')).toBeTruthy();
  });
  it('keeps history after Back and the new-chat action before the right sidebar', async () => {
    const f = await mount();
    expect(f.model.restoreRecent).toHaveBeenCalledOnce();
    expect([...f.node.querySelectorAll('.mobile-header > button')].map(button => button.getAttribute('aria-label'))).toEqual(['返回', '工作室侧边栏']);
    const props = f.view.renderCreatorStudioConversation.mock.calls.at(-1)[0].props;
    expect(props.headerTarget).toBe(f.node.querySelector('.creator-studio-heading-preset'));
    expect(props.cornerTarget).toBe(f.node.querySelector('.creator-studio-heading-corner'));
    await f.click('新建工作室对话');
    expect(f.model.create).toHaveBeenCalledWith('');
  });
  it('keeps conversation creation available after the selected character was deleted', async () => {
    const f = await mount(true, false);
    expect(f.node.textContent).toContain('合成会话内容');
    await f.click('新建工作室对话');
    expect(f.model.create).toHaveBeenCalledWith('');
    const props = f.view.renderCreatorStudioConversation.mock.calls.at(-1)[0].props;
    await act(async () => props.onSelectCharacter());
    expect([...f.node.querySelectorAll('.creator-studio-character-picker button')].find(button => button.textContent === '不选择角色').getAttribute('aria-pressed')).toBe('true');
  });
});
