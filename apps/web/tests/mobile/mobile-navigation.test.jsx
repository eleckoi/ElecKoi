// @vitest-environment jsdom
import React, { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMainPageView } from '../../src/app/windows/MainPageContext.jsx';
import { useMobileScroll } from '../../src/mobile/MobileChrome.jsx';
import { MobileWindow } from '../../src/mobile/MobileWindow.jsx';
import { MobileWorkspaceControls } from '../../src/mobile/MobileWorkspaceControls.jsx';
import { UnsavedChangesDialog } from '../../src/ui/ui/UnsavedChangesDialog.jsx';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';

const fixture = vi.hoisted(() => ({ chat: null, dialog: false, onCancel: null, updates: null }));
vi.mock('../../src/app/hooks/useChatClient.js', () => ({ useChatClient: () => fixture.chat }));
vi.mock('../../src/app/hooks/useWindowAppearance.js', () => ({ useWindowAppearance: () => ({}) }));
vi.mock('../../src/modules/updates/index.js', async importOriginal => ({
  ...await importOriginal(), useAppUpdates: () => fixture.updates,
}));
vi.mock('../../src/modules/chat/index.js', () => ({ ChatBackgroundModal: () => null, HistoryModal: () => null }));
vi.mock('../../src/ui/ui/AppToast.jsx', () => ({ AppToast: () => null }));

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, selected, listeners, navigation, guard, rightbar, catalogs;
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
function emit() { listeners.forEach(listener => listener()); }
function Page({ panel }) {
  const view = useMainPageView();
  if (view.route.kind === 'model-editor') return <><p data-model-config={view.route.configId}>模型编辑</p><button onClick={view.goBack}>返回</button></>;
  if (view.route.kind === 'conversation') return <><p data-chat={view.chat.sessionId}>独立对话</p><button onClick={view.goBack}>返回</button></>;
  if (view.route.kind === 'character-profile') return <><p>角色资料</p><button onClick={() => view.openCharacterConversation('character-b')}>开始对话</button><button onClick={view.goBack}>返回</button></>;
  return <ListPage panel={panel} />;
}
function ListPage({ panel }) {
  const view = useMainPageView();
  const scroll = useMobileScroll(panel);
  return <div ref={scroll} data-list={panel}><button onClick={view.openDrawer}>侧边栏</button><button onClick={view.openSearch}>搜索</button><button onClick={() => view.selectConversation('chat-b')}>打开会话乙</button><button onClick={() => view.selectConversation('chat-a')}>打开当前会话</button><button onClick={() => view.pushRoute({ kind: 'character-profile', characterId: 'character-b' })}>角色资料</button></div>;
}
function Harness() {
  const panel = useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => selected);
  return <OfficialMarkdownProvider component={({ text }) => <span>{text}</span>}><MobileWindow {...catalogs} navigation={{ ...navigation, selectedPanelId: panel }} rightbar={rightbar} />
    <UnsavedChangesDialog open={fixture.dialog} title="保存编辑" description="是否保存？" onCancel={fixture.onCancel} />
  </OfficialMarkdownProvider>;
}
async function mount() {
  const node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<Harness />));
}
async function click(label) { await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label).click()); }
beforeEach(() => {
  catalogs = {}; selected = 'messages'; listeners = new Set(); guard = null; rightbar = undefined; fixture.dialog = false;
  fixture.updates = { status: null, download: vi.fn(), install: vi.fn() };
  fixture.onCancel = vi.fn(() => { fixture.dialog = false; root.render(<Harness />); });
  const sidebar = { shown: false };
  navigation = {
    items: [], sidebar: { subscribe: () => () => {}, getSnapshot: () => sidebar },
    toggleSidebar: vi.fn(), closeSidebar: vi.fn(), renderSidebar: () => null,
    setPanelGuard: callback => { guard = callback; return () => { guard = null; }; },
    selectPanel: id => { const commit = () => { selected = id; emit(); }; guard ? guard(commit) : commit(); },
    renderPanel: id => <Page panel={id} />,
  };
  fixture.chat = { sessionId: 'chat-a', chatCharacter: { character_id: 'character-a' }, isSending: false,
    notice: null, status: '就绪', notify: vi.fn(), loadChat: vi.fn(async id => {
      fixture.chat = { ...fixture.chat, sessionId: id, chatCharacter: { character_id: 'character-b' } };
      root.render(<Harness />);
    }), openCharacterChat: vi.fn(async () => {
      fixture.chat = { ...fixture.chat, sessionId: 'chat-b', chatCharacter: { character_id: 'character-b' } };
      navigation.selectPanel('messages'); root.render(<Harness />);
    }) };
});
afterEach(async () => {
  if (root) await act(async () => root.unmount()); root = undefined; document.body.replaceChildren();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (originalAnimate) Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
  else delete HTMLElement.prototype.animate;
});
describe('Android independent conversation navigation', () => {
  it('opens the Workspace through More and keeps navigation in the native header without a duplicate title', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    let shown = false;
    const subscribers = new Set();
    let sidebar = { shown };
    const show = value => { shown = value; sidebar = { shown }; subscribers.forEach(listener => listener()); };
    navigation.sidebar = { subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener); }, getSnapshot: () => sidebar };
    navigation.toggleSidebar = () => show(!shown);
    navigation.closeSidebar = () => show(false);
    navigation.renderSidebar = (render, owner) => render((_name, value) => value?.content,
      owner.workspace ? <section aria-label="工作区列表"><button onClick={() => show(false)}>收起工作区</button><span>默认工作区</span><span>未分组</span></section> : null);
    navigation.hasSidebarEntryActions = true;
    navigation.renderSidebarEntryActions = (_render, dismiss) => <button role="menuitem" onClick={() => { dismiss(); navigation.selectPanel('conversation'); show(false); }}>进入工作区界面</button>;
    navigation.renderPanel = panel => panel === 'conversation'
      ? <div data-phase="active"><header data-window-drag=""><MobileWorkspaceControls /><h2>合成工作区会话</h2></header><textarea aria-label="工作区草稿" /></div> : <Page panel={panel} />;
    await mount(); await click('侧边栏'); await click('更多插件'); await click('进入工作区界面');
    expect(document.querySelector('.mobile-workspace-page')).toBeTruthy();
    expect(document.querySelector('.mobile-workspace-page > .mobile-header')).toBeNull();
    expect(document.querySelector('.mobile-workspace-controls').closest('[data-window-drag]')).toBeTruthy();
    await click('打开工作区侧边栏');
    const drawer = document.querySelector('[aria-label="工作区会话管理"]');
    expect(drawer.textContent).toContain('默认工作区');
    expect(drawer.textContent).toContain('未分组');
    expect(drawer.querySelector('.side-rail')).toBeNull();
    expect(drawer.querySelector('[aria-label="更多插件"]')).toBeNull();
    await click('收起工作区'); await click('返回');
    expect(document.querySelector('[data-list="messages"]')).toBeTruthy();
    expect(fixture.chat.loadChat).not.toHaveBeenCalled();
  });
  it('shows an automatic update from the mobile root and opens the Android download action', async () => {
    vi.stubGlobal('__ELECKOI_CLIENT_PLATFORM__', { kind: 'android' });
    await mount();
    expect(document.querySelector('.app-update-dialog')).toBeNull();
    fixture.updates.status = { phase: 'available', availableVersion: '1.2.3', currentVersion: '1.2.2',
      manualCheck: false, releaseUrl: 'https://github.com/eleckoi/ElecKoi/releases/tag/v1.2.3', releaseNotes: '合成更新说明' };
    await act(async () => root.render(<Harness />));
    expect(document.querySelector('.app-update-dialog').textContent).toContain('v1.2.3');
    expect(document.querySelector('.app-update-release-link').href).toBe(fixture.updates.status.releaseUrl);
    await act(async () => document.querySelector('.app-update-actions .is-primary').click());
    expect(fixture.updates.download).toHaveBeenCalledOnce();
    expect(fixture.updates.install).not.toHaveBeenCalled();
    fixture.updates.status = { ...fixture.updates.status, phase: 'error', message: '合成网络错误' };
    await act(async () => root.render(<Harness />));
    expect(document.querySelector('.app-update-dialog')).toBeNull();
  });

  it('searches all three catalogs without filtering the source page and returns through the source route', async () => {
    const items = [{ id: 'character-a', name: '合成对象甲', persona: {} }];
    const modelSnapshot = { status: 'ready', error: '', configs: [
      { id: 'config-a', name: '合成对象甲', provider: 'custom', model: 'synthetic-model' },
      { id: 'config-b', name: '合成对象乙', provider: 'custom', model: 'synthetic-model' },
    ] };
    const characterSnapshot = { status: 'ready', error: '', collection: { items } };
    catalogs = {
      models: { subscribe: () => () => {}, getSnapshot: () => modelSnapshot },
      characters: { subscribe: () => () => {}, getSnapshot: () => characterSnapshot },
    };
    fixture.chat = { ...fixture.chat, characters: { items }, selectCharacter: vi.fn(),
      visibleConversationSessions: [{ id: 'chat-a', character_name: '合成对象甲' }],
      sessions: [{ id: 'hidden-session', character_name: '隐藏入口' }], setKeyword: vi.fn() };
    await mount(); document.querySelector('[data-list]').scrollTop = 156;
    await click('搜索');
    expect(document.querySelector('.mobile-bottom-nav').getAttribute('aria-hidden')).toBe('true');
    const input = document.querySelector('input[aria-label="会话、角色、模型"]');
    const fill = async value => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await fill('合成对象');
    expect(document.querySelectorAll('.mobile-search-result')).toHaveLength(4);
    expect(fixture.chat.setKeyword).not.toHaveBeenCalled();
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await click('取消');
    expect(document.querySelector('.mobile-home-search')).toBeNull();
    expect(document.querySelector('[data-list]').scrollTop).toBe(156);
    await click('搜索'); expect(document.querySelector('.mobile-search-history').textContent).toContain('合成对象');
    await click('合成对象');
    const config = [...document.querySelectorAll('[aria-label="模型结果"] button')].find(button => button.textContent.includes('合成对象乙'));
    await act(async () => config.click());
    expect(document.querySelector('[data-model-config]').dataset.modelConfig).toBe('config-b');
    await click('返回'); expect(document.querySelector('[data-list]').dataset.list).toBe('messages');
    await click('搜索');
    const backEvent = new Event('eleckoi:platform-back', { cancelable: true });
    await act(async () => window.dispatchEvent(backEvent));
    expect(backEvent.defaultPrevented).toBe(true); expect(document.querySelector('.mobile-home-search')).toBeNull();
  });

  it('waits for the edit guard before the sidebar resets the settings subpage', async () => {
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: () => ({ finished: Promise.resolve(), cancel: vi.fn() }) });
    let settingsView, pending;
    function SettingsProbe() {
      settingsView = useMainPageView();
      return <><p data-settings-page>{settingsView.settingsPage}</p><button onClick={() => settingsView.setSettingsPage('profile')}>编辑合成资料</button><button onClick={settingsView.openDrawer}>侧边栏</button></>;
    }
    navigation.renderPanel = id => id === 'settings' ? <SettingsProbe /> : <Page panel={id} />;
    let snapshot = { shown: false };
    const subscribers = new Set();
    const show = shown => { snapshot = { shown }; subscribers.forEach(listener => listener()); };
    navigation.sidebar = { subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener); }, getSnapshot: () => snapshot };
    navigation.toggleSidebar = () => show(!snapshot.shown);
    navigation.closeSidebar = () => show(false);
    navigation.renderSidebar = render => render((_name, owner) => owner?.content);
    const select = navigation.selectPanel;
    navigation.selectPanel = id => { select(id); show(false); };
    await mount(); await click('侧边栏'); await click('打开设置'); await click('编辑合成资料');
    const protect = vi.fn(action => { pending = action; });
    settingsView.guardRef.current = protect;
    await click('侧边栏'); await click('打开设置');
    expect(settingsView.settingsPage).toBe('profile');
    expect(protect).toHaveBeenCalledTimes(1);
    await act(async () => pending());
    expect(settingsView.settingsPage).toBe('home');
    expect(protect).toHaveBeenCalledTimes(1);
    settingsView.guardRef.current = null;
    await click('侧边栏'); await click('打开用户资料设置');
    expect(settingsView.settingsPage).toBe('profile');
  });
  it('uses the shared sidebar, keeps plugin routes, and finishes both opening and closing motion', async () => {
    let snapshot = { shown: false };
    const subscribers = new Set(), animations = [];
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: () => {} });
    vi.spyOn(HTMLElement.prototype, 'animate').mockImplementation(function (keyframes, options) {
      let resolve, reject;
      const animation = { currentTime: 0, keyframes, options, element: this,
        finished: new Promise((done, fail) => { resolve = done; reject = fail; }),
        finish: () => resolve(), cancel: vi.fn(() => reject(new Error('cancelled'))) };
      animations.push(animation); return animation;
    });
    const show = shown => { snapshot = { shown }; subscribers.forEach(listener => listener()); };
    navigation.sidebar = { subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener); }, getSnapshot: () => snapshot };
    navigation.toggleSidebar = () => show(!snapshot.shown);
    navigation.closeSidebar = () => show(false);
    const select = navigation.selectPanel;
    navigation.selectPanel = id => { select(id); show(false); };
    navigation.items = ['messages', 'character', 'creatorStudio', 'presets', 'model', 'extension-panel'].map(id => ({ id, label: id }));
    navigation.hasSidebarFooterActions = true;
    navigation.renderSidebar = render => render((name, owner) => name === 'sidebar.footer.action' ? <button>扩展操作</button> : owner.content);
    const finish = async () => { await act(async () => animations.filter(animation => !animation.cancel.mock.calls.length).forEach(animation => animation.finish())); };
    await mount();
    document.querySelector('[data-list]').scrollTop = 160;
    await click('侧边栏');
    expect(document.querySelector('.mobile-drawer .qq-rail.expanded')).not.toBeNull();
    expect([...document.querySelectorAll('.mobile-drawer .rail-nav-button')].map(button => button.getAttribute('aria-label'))).toEqual(['extension-panel']);
    expect(document.querySelector('.rail-footer-actions').textContent).toBe('扩展操作');
    const account = document.querySelector('.rail-account-row');
    expect(account.querySelector('.rail-user-trigger')).not.toBeNull();
    expect(account.querySelector('.rail-settings-trigger').textContent).toBe('');
    expect(account.querySelector('.rail-settings-trigger').getAttribute('aria-label')).toBe('打开设置');
    expect(account.querySelector('.rail-footer-actions')).toBeNull();
    expect(animations).toHaveLength(4);
    expect(animations.map(animation => Object.keys(animation.keyframes[0]).sort())).toEqual([
      ['offset', 'transform'], ['offset', 'transform'], ['offset', 'opacity'], ['offset', 'opacity']
    ]);
    expect(document.querySelector('.mobile-shell').dataset.drawerMoving).toBe('true');
    await finish();
    expect(document.querySelector('.mobile-shell').dataset.drawerMoving).toBe('false');
    await click('extension-panel');
    expect(document.querySelector('.mobile-shell').dataset.mobilePanel).toBe('extension-panel');
    expect(document.querySelector('.mobile-drawer')).not.toBeNull();
    expect(document.querySelector('.mobile-page-seat').hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.mobile-drawer')).not.toBeNull();
    await finish();
    expect(document.querySelector('.mobile-drawer')).toBeNull();
    expect(document.querySelector('.mobile-page-seat').hasAttribute('inert')).toBe(false);
    await click('返回');
    expect(document.querySelector('[data-list]').scrollTop).toBe(160);
    await click('侧边栏'); await finish();
    await click('关闭侧边栏'); await finish();
    expect(document.querySelector('.mobile-drawer')).toBeNull();
    expect(document.querySelector('.mobile-front-surface').style.transform).toBe('none');
    expect(animations.every(animation => animation.cancel.mock.calls.length === 1)).toBe(true);
  });
  it('waits for the actual selected session and restores the list scroll on native Back', async () => {
    await mount(); document.querySelector('[data-list]').scrollTop = 240;
    let resolve;
    fixture.chat.loadChat = vi.fn(() => new Promise(done => { resolve = () => {
      fixture.chat = { ...fixture.chat, sessionId: 'chat-b' }; root.render(<Harness />); done();
    }; }));
    await click('打开会话乙');
    expect(document.querySelector('[data-chat]')).toBeNull();
    await click('角色');
    expect(document.querySelector('.mobile-shell').dataset.mobilePanel).toBe('messages');
    await act(async () => resolve());
    expect(document.querySelector('[data-chat]').dataset.chat).toBe('chat-b');
    expect(document.querySelector('.mobile-bottom-nav')).toBeNull();
    const event = new Event('eleckoi:platform-back', { cancelable: true });
    await act(async () => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('[data-list]').scrollTop).toBe(240);
    expect(document.querySelector('.mobile-bottom-nav')).not.toBeNull();
  });
  it('returns from a character conversation to its source profile and then its list', async () => {
    await mount(); await click('角色'); await click('角色资料'); await click('开始对话');
    expect(document.querySelector('[data-chat]').dataset.chat).toBe('chat-b');
    await click('返回'); expect(document.body.textContent).toContain('角色资料');
    expect(document.querySelector('.mobile-shell').dataset.mobilePanel).toBe('character');
    await click('返回'); expect(document.querySelector('[data-list]').dataset.list).toBe('character');
  });
  it('preserves the current conversation when loading fails or generation blocks a switch', async () => {
    fixture.chat.loadChat = vi.fn(async () => {});
    await mount(); await click('打开会话乙');
    expect(document.querySelector('[data-chat]')).toBeNull();
    // 打开失败面同时给用户话与码：码不再是隐藏信息（状态里存的是失败本身，不是一句话）。
    expect(document.querySelector('[role="alert"]').textContent).toContain('对话未能打开，请重试');
    expect(document.querySelector('[role="alert"]').textContent).toContain('eleckoi/internal');
    await click('关闭');
    fixture.chat.isSending = true; await act(async () => root.render(<Harness />));
    await click('打开会话乙');
    expect(fixture.chat.loadChat).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]').textContent).toContain('正在生成');
  });
  it('opens the already running conversation without resetting its input or calling the loader', async () => {
    fixture.chat.isSending = true;
    await mount(); await click('打开当前会话');
    expect(document.querySelector('[data-chat]').dataset.chat).toBe('chat-a');
    expect(fixture.chat.loadChat).not.toHaveBeenCalled();
  });
  it('opens a sidebar plugin panel through the official panel action and returns to the source list', async () => {
    await mount();
    document.querySelector('[data-list]').scrollTop = 180;
    await act(async () => navigation.selectPanel('extension-panel'));
    expect(document.querySelector('.mobile-shell').dataset.mobilePanel).toBe('extension-panel');
    expect(document.querySelector('.mobile-bottom-nav')).toBeNull();
    await click('返回');
    expect(document.querySelector('[data-list]').dataset.list).toBe('messages');
    expect(document.querySelector('[data-list]').scrollTop).toBe(180);
  });
  it('dismisses the shared unsaved dialog with native Back while preserving the source route', async () => {
    await mount(); await click('角色资料');
    fixture.dialog = true;
    await act(async () => root.render(<Harness />));
    [...document.querySelectorAll('[role="alertdialog"] button')].find(button => button.textContent === '取消').focus();
    const event = new Event('eleckoi:platform-back', { cancelable: true });
    await act(async () => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.onCancel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.body.textContent).toContain('角色资料');
  });
  it('closes the official rightbar before returning from a conversation', async () => {
    let snapshot = { shown: true };
    const subscribers = new Set();
    rightbar = {
      subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener); },
      getSnapshot: () => snapshot,
      setViewportWidth: vi.fn(), render: vi.fn(owner => <p data-rightbar-compact={String(!owner.canShow)}>官方右栏</p>),
      close: vi.fn(() => { snapshot = { shown: false }; subscribers.forEach(listener => listener()); }),
    };
    await mount(); await click('打开当前会话');
    const event = new Event('eleckoi:platform-back', { cancelable: true });
    await act(async () => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(rightbar.close).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.mobile-rightbar-seat').hidden).toBe(true);
    expect(document.querySelector('[data-chat]').dataset.chat).toBe('chat-a');
    expect(document.querySelector('[data-rightbar-compact]').dataset.rightbarCompact).toBe('true');
  });
});
