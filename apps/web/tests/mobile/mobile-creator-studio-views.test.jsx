// @vitest-environment jsdom
import React, { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileCreatorStudioConversation } from '../../src/mobile/MobileCreatorStudioConversation.jsx';
import { CreatorStudioConversation } from '../../src/modules/creatorStudio/components/CreatorStudioConversation.jsx';

vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root, node, header;
afterEach(async () => { if (root) await act(() => root.unmount()); node?.remove(); header?.remove(); });
async function mount(initialView = 'chat', Component = MobileCreatorStudioConversation) {
  let store = { view: initialView, viewRequest: null };
  const listeners = new Set(), snapshot = () => store, subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const openView = vi.fn((view, focus) => { store = { view, viewRequest: { view, focus } }; listeners.forEach(listener => listener()); });
  const completeViewRequest = vi.fn(), inspectCall = vi.fn();
  let tabs = [{ id: 'chat', label: '对话' }, { id: 'trajectory', label: '轨迹' }];
  let unpinned = [];
  const pinSnapshot = () => unpinned;
  const tabSnapshot = () => tabs;
  const model = { readDefaultModel: vi.fn(async () => null), refresh: vi.fn(async () => {}), selectModel: vi.fn(), regenerate: vi.fn() };
  const models = { subscribe: () => () => {}, getSnapshot: () => modelsSnapshot }, modelsSnapshot = { configs: [] };
  const renderSlot = vi.fn((name, owner, options) => name === 'eleckoi.creator-studio.view'
    ? <div data-slot={name} data-view={options.only}>合成 {options.only}</div>
    : name === 'eleckoi.creator-studio.composer.bar' ? <input data-composer-input="" aria-label="合成输入" /> : null);
  header = document.createElement('header'); document.body.append(header);
  const headerTarget = document.createElement('span'), cornerTarget = document.createElement('span');
  header.append(headerTarget, cornerTarget);
  const renderHeaderSlot = vi.fn((name, owner) => name.endsWith('.corner') ? <button data-sidebar-right-expand="" aria-label="展开右侧栏">侧栏</button>
    : name.endsWith('.views.actions') ? <><button role="menuitem" onClick={() => { owner.onOpen('synthetic-gallery'); owner.onDismiss(); }}>浏览更多插件</button><button role="menuitem">创建你的插件</button></>
    : name.endsWith('.actions') ? <span data-studio-preset="">合成创作预设</span>
    : name.endsWith('.utilities') ? <button>下载 Session 日志</button> : null);
  const props = { sessionId: 'synthetic-studio-session', headerTarget, cornerTarget, model, models, onError: vi.fn(),
    useSession: select => select({ running: false, blank: false }), useInput: select => select({}), useSessionStatus: select => select(new Map()),
    useProjection: () => null, useInspectCall: select => select(inspectCall), useStore: select => select(useSyncExternalStore(subscribe, snapshot)),
    useConversationViews: select => select(useSyncExternalStore(subscribe, tabSnapshot)),
    useEntryPins: select => select(useSyncExternalStore(subscribe, pinSnapshot)), useEntryActions: select => select(true), setPinned: vi.fn(),
    actions: { completeViewRequest }, openView, selectView: id => openView(id),
    renderHeaderSlot,
    renderSlot, renderSlotChain: (_name, _owner, options) => options.fallback };
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  await act(() => root.render(<MainPageContext.Provider value={{ models, registerBackHandler: () => () => {} }}><Component {...props} /></MainPageContext.Provider>));
  return { openView, completeViewRequest, inspectCall, model, renderSlot, renderHeaderSlot, headerTarget, cornerTarget, getStore: snapshot,
    publishTabs(next) { tabs = next; listeners.forEach(listener => listener()); }, getTabs: tabSnapshot,
    unpin(id) { unpinned = [...unpinned, id]; listeners.forEach(listener => listener()); } };
}
async function select(label) { await act(() => [...node.querySelectorAll('[role=tab]')].find(button => button.textContent === label).click()); }
it('switches the shared Studio view while keeping the same composer and official inspection focus', async () => {
  const f = await mount(), input = node.querySelector('[data-composer-input]'); input.value = '合成草稿';
  expect([...node.querySelectorAll('[role=tab]')].map(button => button.textContent)).toEqual(['对话', '轨迹']);
  await select('轨迹');
  expect(f.openView).toHaveBeenLastCalledWith('trajectory');
  expect(node.querySelector('.creator-studio-trajectory [data-view]').dataset.view).toBe('trajectory');
  expect(node.querySelector('.creator-studio-native-detail')).toBeNull();
  expect(node.querySelector('[data-composer-input]')).toBe(input); expect(input.value).toBe('合成草稿');
  const owner = f.renderSlot.mock.calls.filter(call => call[0] === 'eleckoi.creator-studio.view').at(-1)[1];
  expect(owner).toMatchObject({ inspectCall: f.inspectCall, viewRequest: f.getStore().viewRequest, completeViewRequest: f.completeViewRequest, openView: f.openView });
  await act(() => f.openView('trajectory', 'synthetic-focus'));
  const focused = f.renderSlot.mock.calls.filter(call => call[0] === 'eleckoi.creator-studio.view').at(-1)[1];
  expect(focused.viewRequest).toEqual({ view: 'trajectory', focus: 'synthetic-focus' });
  await select('对话');
  expect(node.querySelector('[data-conversation-scroll] [data-view]').dataset.view).toBe('chat');
  expect(node.querySelector('[data-composer-input]')).toBe(input); expect(input.value).toBe('合成草稿');
  expect(f.model.selectModel).not.toHaveBeenCalled(); expect(f.model.regenerate).not.toHaveBeenCalled(); expect(f.model.refresh).toHaveBeenCalledOnce();
});
it.each([MobileCreatorStudioConversation, CreatorStudioConversation])('follows plugin view registration, restore and unload with the same composer in $name', async Component => {
  const f = await mount('synthetic-gallery', Component), input = node.querySelector('[data-composer-input]');
  input.value = '保留草稿';
  expect(document.querySelector('[data-sidebar-right-expand]')).toBeTruthy();
  await act(() => f.publishTabs([...f.getTabs(), { id: 'synthetic-gallery', label: '插件画廊' }]));
  expect(node.querySelector('[role=tab][aria-selected=true]').textContent).toBe('插件画廊');
  expect(node.querySelector('[data-view]').dataset.view).toBe('synthetic-gallery');
  expect(document.querySelector('[role=dialog]')).toBeNull();
  await select('对话'); await select('插件画廊');
  expect(f.openView).toHaveBeenLastCalledWith('synthetic-gallery');
  await act(() => f.publishTabs(f.getTabs().filter(tab => tab.id !== 'synthetic-gallery')));
  expect(node.querySelector('[role=tab][aria-selected=true]').textContent).toBe('对话');
  expect(node.querySelector('[data-view]').dataset.view).toBe('chat');
  expect(node.querySelector('[data-composer-input]')).toBe(input); expect(input.value).toBe('保留草稿');
});
it('restores and follows the official trajectory view without opening a details dialog', async () => {
  const f = await mount('trajectory');
  expect(node.querySelector('[role=tab][aria-selected=true]').textContent).toBe('轨迹');
  expect(node.querySelector('.creator-studio-native-detail')).toBeNull();
  await act(() => f.openView('chat'));
  expect(node.querySelector('[role=tab][aria-selected=true]').textContent).toBe('对话');
  expect(node.querySelector('[data-conversation-scroll] [data-view]').dataset.view).toBe('chat');
});
it('keeps preset and rightbar in the top header and uses the view menu for official plugin entries', async () => {
  const f = await mount();
  expect(f.headerTarget.textContent).toBe('合成创作预设');
  expect(f.cornerTarget.querySelector('[data-sidebar-right-expand]')).toBeTruthy();
  expect(node.querySelector('.creator-studio-view-header').textContent).toBe('对话轨迹');
  expect(f.renderHeaderSlot.mock.calls.some(([name]) => name.endsWith('.utilities'))).toBe(false);
  await act(() => f.publishTabs([...f.getTabs(), { id: 'synthetic-gallery', label: '插件画廊' }]));
  await act(() => f.unpin('synthetic-gallery'));
  expect([...node.querySelectorAll('[role=tab]')].map(el => el.textContent)).toEqual(['对话', '轨迹']);
  await act(() => node.querySelector('[aria-label="更多插件"]').click());
  expect(document.body.textContent).toContain('创建你的插件');
  const owner = f.renderHeaderSlot.mock.calls.filter(([name]) => name.endsWith('.views.actions')).at(-1)[1];
  expect(owner.entries).toEqual([{ id: 'synthetic-gallery', label: '插件画廊', active: false, pinned: false }]);
  await act(() => [...document.querySelectorAll('[role=menuitem]')].find(el => el.textContent === '浏览更多插件').click());
  expect(f.openView).toHaveBeenLastCalledWith('synthetic-gallery');
  expect(node.querySelector('[data-view]').dataset.view).toBe('synthetic-gallery');
  expect(document.querySelector('[role=menuitem]')).toBeNull();
});
