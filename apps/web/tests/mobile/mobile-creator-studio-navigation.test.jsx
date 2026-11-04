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
  const view = { creatorStudio: { sessions: model }, characters: { subscribe: () => () => {}, getSnapshot: () => characterSnapshot },
    renderCreatorStudioConversation: vi.fn(() => <div>合成会话内容</div>), goBack: vi.fn(), registerBackHandler: () => () => {} };
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node);
  await act(async () => root.render(<MainPageContext.Provider value={view}><MobileCreatorStudioPage /></MainPageContext.Provider>));
  cleanups.push(async () => { await act(async () => root.unmount()); node.remove(); });
  const click = async label => { const button = [...node.querySelectorAll('button')].find(item => item.getAttribute('aria-label') === label || item.textContent.trim() === label); expect(button, label).toBeTruthy(); await act(async () => button.click()); };
  return { node, model, view, click };
}
describe('Android AI creator studio navigation', () => {
  it('places the selected character in the sidebar without taking space above the conversation', async () => {
    const f = await mount(true);
    expect(f.node.querySelector('.creator-studio-target')).toBeNull();
    expect(f.node.textContent).not.toContain('合成角色');
    await f.click('工作室侧边栏');
    const choice = f.node.querySelector('.creator-studio-sidebar-character');
    expect(choice.lastElementChild.textContent).toBe('合成角色');
    expect(choice.querySelector('.avatar')).not.toBeNull();
    await f.click('选择角色 合成角色');
    expect(f.node.querySelector('.creator-studio-character-picker')).not.toBeNull();
  });
  it('restores history with its list toggle after Back and new-chat in the trailing actions', async () => {
    const f = await mount();
    expect(f.model.restoreRecent).toHaveBeenCalledOnce();
    expect(f.node.textContent).not.toContain('正在打开');
    const actions = [...f.node.querySelectorAll('.mobile-header-actions button')].map(button => button.getAttribute('aria-label'));
    expect(actions).toEqual(['新建工作室对话']);
    expect([...f.node.querySelectorAll('.mobile-header > button')].map(button => button.getAttribute('aria-label'))).toEqual(['返回', '工作室侧边栏']);
    expect(f.node.querySelector('.creator-studio-heading-preset')).toBeTruthy();
    expect(f.node.querySelector('.mobile-header-actions').lastElementChild.className).toBe('creator-studio-heading-corner');
    const headerProps = f.view.renderCreatorStudioConversation.mock.calls.at(-1)[0].props;
    expect(headerProps.headerTarget).toBe(f.node.querySelector('.creator-studio-heading-preset'));
    expect(headerProps.cornerTarget).toBe(f.node.querySelector('.creator-studio-heading-corner'));
    await f.click('新建工作室对话');
    expect(f.model.create).toHaveBeenCalledWith('');
    expect(f.view.renderCreatorStudioConversation.mock.calls[0][0].component.name).toBe('MobileCreatorStudioConversation');
  });
  it('keeps the conversation visible and creates without a target after its selected character is deleted', async () => {
    const f = await mount(true, false);
    expect(f.node.textContent).toContain('合成会话内容');
    await f.click('新建工作室对话');
    expect(f.model.create).toHaveBeenCalledWith('');
    await f.click('工作室侧边栏');
    await f.click('选择角色');
    expect([...f.node.querySelectorAll('.creator-studio-character-picker button')].find(button => button.textContent === '不选择角色').getAttribute('aria-pressed')).toBe('true');
  });
  it('offers row management and selects conversations before enabling the pin/delete footer', async () => {
    const f = await mount();
    await f.click('工作室侧边栏');
    const manage = f.node.querySelector('[aria-label="管理对话"]');
    expect(manage.closest('.creator-studio-group-heading').textContent).toContain('30 天内');
    expect(f.node.querySelector('.creator-studio-sidebar-actions').contains(manage)).toBe(false);
    await f.click('管理 合成对话');
    expect(f.node.querySelector('[role=menu]').textContent).toContain('重命名对话');
    expect(f.node.querySelector('[role=menu]').textContent).toContain('删除对话');
    await f.click('删除对话');
    const confirmation = f.node.querySelector('.creator-studio-confirmation');
    expect([...confirmation.querySelectorAll('.confirmation-actions button')].map(button => button.textContent)).toEqual(['取消', '删除']);
    await f.click('取消');
    expect(f.node.querySelector('.creator-studio-confirmation')).toBeNull();
    expect(f.model.delete).not.toHaveBeenCalled();
    await f.click('管理对话');
    const footer = f.node.querySelector('.creator-studio-selection-footer');
    expect([...footer.querySelectorAll('button')].every(button => button.disabled)).toBe(true);
    const checkbox = f.node.querySelector('input[type=checkbox]');
    await act(async () => checkbox.click());
    expect([...footer.querySelectorAll('button')].every(button => !button.disabled)).toBe(true);
    await f.click('置顶');
    expect(f.model.pin).toHaveBeenCalledWith('synthetic-current', true);
    expect(f.node.querySelector('input[type=checkbox]')).toBeNull();
  });
});
