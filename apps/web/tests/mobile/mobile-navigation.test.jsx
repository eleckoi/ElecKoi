// @vitest-environment jsdom
import React, { act, useSyncExternalStore } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMainPageView } from '../../src/app/windows/MainPageContext.jsx';
import { useMobileScroll } from '../../src/mobile/MobileChrome.jsx';
import { MobileWindow } from '../../src/mobile/MobileWindow.jsx';
import { MobileWorkspaceControls } from '../../src/mobile/MobileWorkspaceControls.jsx';
import { MobilePluginBack } from '../../src/mobile/MobilePluginBack.jsx';
import { UnsavedChangesDialog } from '../../src/ui/ui/UnsavedChangesDialog.jsx';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { loadOfficialLayout } from '../../../../tests/helpers/officialLayout.js';

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
let root, selected, listeners, navigation, guard, rightbar, catalogs, frameWidth;
let OfficialFrame;
// The shipped official shell supplies React 18.3.1. These route units use the
// workspace's React 19; preserve React 18's DOM semantics for native inert="".
// The actual Android-profile browser probe separately asserts inert on the DOM.
const nativeJsx = render => (type, props, key) => render(type,
  typeof type === 'string' && props?.inert === '' ? { ...props, inert: true } : props, key);
const officialLayout = loadOfficialLayout({ window, document, getComputedStyle,
  jsxRuntime: { ...jsxRuntime, jsx: nativeJsx(jsxRuntime.jsx), jsxs: nativeJsx(jsxRuntime.jsxs) },
  ResizeObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: callback => setTimeout(callback, 0), cancelAnimationFrame: clearTimeout });
officialLayout.apply({
  locale: { bind: () => key => key }, reflect: { provide: () => () => {} },
  slots: { provideRoot: () => () => {}, entries: () => [], subscribe: () => () => {},
    register: (_options, component) => { OfficialFrame = component; return () => {}; } },
  shortcuts: { register: () => () => {} },
  effect: (run, label) => { if (label === 'ui-layout: service + root registration') run(); },
});
const emptySidebar = { shown: false }, emptyRightbar = { shown: false };
const subscribeEmpty = () => () => {};
/** Route units control the sources; the installed AppFrame still owns composition. */
function NativeFrame() {
  const view = useMainPageView();
  const sidebar = useSyncExternalStore(navigation.sidebar.subscribe, navigation.sidebar.getSnapshot);
  const right = useSyncExternalStore(rightbar?.subscribe ?? subscribeEmpty, rightbar?.getSnapshot ?? (() => emptyRightbar));
  return <OfficialFrame useStore={select => select({ layoutInfo: { viewportWidth: frameWidth, sidebar: sidebar.shown ? 280 : 0,
    sidebarDrawer: true, narrowExpanded: sidebar.shown, rightbar: 300, rightbarShown: right.shown, rightbarTrack: false } })}
    useSessions={select => select({ byId: {} })} usePanelInfo={select => select({ activePanelId: selected === 'conversation' ? null : selected })}
    useFoldedLandscape={select => select(false)} t={key => key}
    actions={{ toggleSidebar: navigation.toggleSidebar, setViewportWidth() {} }}
    renderSlot={(name, owner, options) => {
      if (name === 'sidebar') return navigation.renderSidebar((render, workspace) => view.renderFrameSidebar(render, workspace, owner), { ...owner, workspace: true });
      if (name === 'rightbar') return rightbar?.render(owner);
      if (name !== 'main') return null;
      const panel = options.entryKey, content = navigation.renderPanel(panel);
      return ['messages', 'character', 'creatorStudio', 'presets', 'model', 'settings'].includes(panel) ? content
        : view.renderFramePage({ panelId: panel, mainPanel: content });
    }} />;
}
const originalAnimate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
function emit() { listeners.forEach(listener => listener()); }
function Page({ panel }) {
  const view = useMainPageView();
  if (view.route.kind === 'preset-editor') return <><p data-preset-editor={view.route.presetId}>预设编辑</p><button onClick={view.goBack}>返回</button></>;
  if (view.route.kind === 'model-editor') return <><p data-model-config={view.route.configId}>模型编辑</p><button onClick={view.goBack}>返回</button></>;
  if (view.route.kind === 'conversation') return <><p data-chat={view.chat.sessionId}>独立对话</p><button onClick={() => view.openCharacterEditor(view.chat.chatCharacter.character_id)}>编辑当前角色</button><button onClick={view.goBack}>返回</button></>;
  if (view.route.kind === 'character-editor') return <><p data-character-editor={view.route.characterId}>角色编辑</p><button onClick={view.goBack}>返回</button></>;
  if (view.route.kind === 'character-profile') return <><p>角色资料</p><button onClick={() => view.openCharacterConversation('character-b')}>进入对话</button><button onClick={view.goBack}>返回</button></>;
  return <ListPage panel={panel} />;
}
function ListPage({ panel }) {
  const view = useMainPageView();
  const scroll = useMobileScroll(panel);
  return <div ref={scroll} data-list={panel}><button onClick={view.openDrawer}>侧边栏</button><button onClick={view.openSearch}>搜索</button><button onClick={() => view.selectConversation('chat-b')}>打开会话乙</button><button onClick={() => view.selectConversation('chat-a')}>打开当前会话</button><button onClick={() => view.pushRoute({ kind: 'character-profile', characterId: 'character-b' })}>角色资料</button></div>;
}
function Harness() {
  const panel = useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => selected);
  return <OfficialMarkdownProvider component={({ text }) => <span>{text}</span>}><MobileWindow {...catalogs} nativeFrame={<NativeFrame />} navigation={{ ...navigation, selectedPanelId: panel }} rightbar={rightbar} />
    <UnsavedChangesDialog open={fixture.dialog} title="保存编辑" description="是否保存？" onCancel={fixture.onCancel} />
  </OfficialMarkdownProvider>;
}
async function mount() {
  const node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<Harness />));
}
async function click(label) { await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label).click()); }
beforeEach(() => {
  catalogs = {}; selected = 'messages'; listeners = new Set(); guard = null; rightbar = undefined; fixture.dialog = false; frameWidth = 390;
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
  it('keeps the tablet sidebar hidden and uses the same modal drawer as the phone', async () => {
    frameWidth = 800;
    let snapshot = { shown: false, drawer: true };
    const subscribers = new Set();
    navigation.sidebar = { subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener); }, getSnapshot: () => snapshot };
    navigation.toggleSidebar = () => { snapshot = { shown: !snapshot.shown, drawer: true }; subscribers.forEach(listener => listener()); };
    navigation.closeSidebar = () => { snapshot = { shown: false, drawer: true }; subscribers.forEach(listener => listener()); };
    navigation.items = [{ id: 'extension-panel', label: '扩展页面' }];
    navigation.renderSidebar = render => render((_name, owner) => owner.content);
    await mount();
    expect(document.querySelector('[data-sidebar-drawer][data-sidebar-collapsed]')).not.toBeNull();
    expect(document.querySelector('.mobile-drawer').parentElement.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.mobile-drawer .rail-nav-button').getAttribute('aria-label')).toBe('扩展页面');
    await click('侧边栏');
    expect(document.querySelector('.mobile-drawer .qq-rail.expanded')).not.toBeNull();
    expect(document.querySelector('.mobile-bottom-nav').hasAttribute('inert')).toBe(true);
    const control = document.querySelector('.mobile-drawer button');
    control.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => control.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    await click('收起侧边栏');
    expect(document.querySelector('.mobile-bottom-nav').hasAttribute('inert')).toBe(false);
    await click('角色');
    expect(document.querySelector('[data-list=character]')).not.toBeNull();
    expect(snapshot.shown).toBe(false);
  });
  it('opens the current conversation character editor and returns to that conversation', async () => {
    await mount();
    await click('打开会话乙');
    await click('编辑当前角色');
    expect(selected).toBe('character');
    expect(document.querySelector('[data-character-editor]').dataset.characterEditor).toBe('character-b');
    await click('返回');
    expect(selected).toBe('messages');
    expect(document.querySelector('[data-chat]').dataset.chat).toBe('chat-b');
    expect(fixture.chat.loadChat).toHaveBeenCalledTimes(1);
  });
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
    expect(document.querySelector('.app-update-modal')).toBeNull();
    fixture.updates.status = { phase: 'available', availableVersion: '1.2.3', currentVersion: '1.2.2',
      manualCheck: false, releaseUrl: 'https://github.com/eleckoi/ElecKoi/releases/tag/v1.2.3', releaseNotes: '合成更新说明' };
    await act(async () => root.render(<Harness />));
    expect(document.querySelector('.app-update-modal').textContent).toContain('v1.2.3');
    expect(document.querySelector('.app-update-release-link').href).toBe(fixture.updates.status.releaseUrl);
    await act(async () => [...document.querySelectorAll('.app-update-modal button')].find(button => button.textContent.includes('下载')).click());
    expect(fixture.updates.download).toHaveBeenCalledOnce();
    expect(fixture.updates.install).not.toHaveBeenCalled();
    fixture.updates.status = { ...fixture.updates.status, phase: 'error', message: '合成网络错误' };
    await act(async () => root.render(<Harness />));
    expect(document.querySelector('.app-update-modal')).toBeNull();
  });

  it('searches all four catalogs without filtering the source page and returns through the source route', async () => {
    const items = [{ id: 'character-a', name: '合成对象甲', persona: {} }];
    const modelSnapshot = { status: 'ready', error: '', configs: [
      { id: 'config-a', name: '合成对象甲', provider: 'custom', model: 'synthetic-model' },
      { id: 'config-b', name: '合成对象乙', provider: 'custom', model: 'synthetic-model' },
    ] };
    const characterSnapshot = { status: 'ready', error: '', collection: { items } };
    const presetSnapshot = { status: 'ready', error: '', catalog: { presets: [
      { id: 'preset-roleplay', name: '合成对象扮演', purpose: 'roleplay', profile: { authorName: '合成作者' } },
      { id: 'preset-creator', name: '合成对象创作', purpose: 'creator', profile: { authorName: '合成作者' } },
    ] } };
    catalogs = {
      models: { subscribe: () => () => {}, getSnapshot: () => modelSnapshot },
      characters: { subscribe: () => () => {}, getSnapshot: () => characterSnapshot },
      presets: { subscribe: () => () => {}, getSnapshot: () => presetSnapshot, refresh: vi.fn() },
    };
    fixture.chat = { ...fixture.chat, characters: { items }, selectCharacter: vi.fn(),
      visibleConversationSessions: [{ id: 'chat-a', character_name: '合成对象甲' }],
      sessions: [{ id: 'hidden-session', character_name: '隐藏入口' }], setKeyword: vi.fn() };
    await mount(); document.querySelector('[data-list]').scrollTop = 156;
    await click('搜索');
    expect(document.querySelector('.mobile-bottom-nav').getAttribute('aria-hidden')).toBe('true');
    const input = document.querySelector('input[aria-label="会话、角色、预设、模型"]');
    const fill = async value => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await fill('合成对象');
    expect(document.querySelectorAll('.mobile-search-result')).toHaveLength(6);
    expect(catalogs.presets.refresh).not.toHaveBeenCalled();
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
    await click('搜索'); await click('合成对象');
    const creatorPreset = [...document.querySelectorAll('[aria-label="预设结果"] button')].find(button => button.querySelector('strong').textContent === '合成对象创作');
    await act(async () => creatorPreset.click());
    expect(document.querySelector('[data-preset-editor]').dataset.presetEditor).toBe('preset-creator');
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
    const show = shown => { snapshot = { shown, drawer: true }; subscribers.forEach(listener => listener()); };
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
  it('retains the shared sidebar across official drawer navigation and restores the source route', async () => {
    let snapshot = { shown: false };
    const subscribers = new Set();
    const show = shown => { snapshot = { shown, drawer: true }; subscribers.forEach(listener => listener()); };
    navigation.sidebar = { subscribe: listener => { subscribers.add(listener); return () => subscribers.delete(listener); }, getSnapshot: () => snapshot };
    navigation.toggleSidebar = () => show(!snapshot.shown);
    navigation.closeSidebar = () => show(false);
    const select = navigation.selectPanel;
    navigation.selectPanel = id => { select(id); show(false); };
    navigation.items = ['messages', 'character', 'creatorStudio', 'presets', 'model', 'extension-panel'].map(id => ({ id, label: id }));
    navigation.hasSidebarFooterActions = true;
    navigation.renderSidebar = render => render((name, owner) => name === 'sidebar.footer.action' ? <button>扩展操作</button> : owner.content);
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
    expect(document.querySelector('[data-sidebar-drawer]')).not.toBeNull();
    expect(document.querySelector('.mobile-drawer').parentElement.hasAttribute('inert')).toBe(false);
    await click('extension-panel');
    expect(document.querySelector('.mobile-shell').dataset.mobilePanel).toBe('extension-panel');
    expect(document.querySelector('.mobile-drawer')).not.toBeNull();
    expect(navigation.sidebar.getSnapshot()).toMatchObject({ shown: false });
    expect(document.querySelector('.mobile-drawer').parentElement.hasAttribute('inert'),
      document.querySelector('[data-shell-bottom]').parentElement.outerHTML.slice(0, 900)).toBe(true);
    expect(document.querySelector('.mobile-page-seat').hasAttribute('inert')).toBe(false);
    await click('返回');
    expect(document.querySelector('[data-list]').scrollTop).toBe(160);
    await click('侧边栏');
    const retained = document.querySelector('.mobile-drawer');
    await click('收起侧边栏');
    expect(document.querySelector('.mobile-drawer')).toBe(retained);
    expect(retained.parentElement.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.mobile-front-surface')).toBeNull();
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
    await mount(); await click('角色'); await click('角色资料'); await click('进入对话');
    expect(document.querySelector('[data-chat]').dataset.chat).toBe('chat-b');
    await click('返回'); expect(document.body.textContent).toContain('角色资料');
    expect(document.querySelector('.mobile-shell').dataset.mobilePanel).toBe('character');
    await click('返回'); expect(document.querySelector('[data-list]').dataset.list).toBe('character');
  });
  it('preserves the source when loading fails and allows another conversation while generating', async () => {
    fixture.chat.loadChat = vi.fn(async () => {});
    await mount(); await click('打开会话乙');
    expect(document.querySelector('[data-chat]')).toBeNull();
    // 打开失败面同时给用户话与码：码不再是隐藏信息（状态里存的是失败本身，不是一句话）。
    expect(document.querySelector('[role="alert"]').textContent).toContain('对话未能打开，请重试');
    expect(document.querySelector('[role="alert"]').textContent).toContain('eleckoi/internal');
    await click('关闭');
    fixture.chat.isSending = true;
    fixture.chat.loadChat = vi.fn(async id => {
      fixture.chat = { ...fixture.chat, sessionId: id, chatCharacter: { character_id: 'character-b' }, isSending: false };
      root.render(<Harness />);
    });
    await act(async () => root.render(<Harness />));
    await click('打开会话乙');
    expect(fixture.chat.loadChat).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-chat]').dataset.chat).toBe('chat-b');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
  it('enters another character profile conversation while the previous one is generating', async () => {
    fixture.chat.isSending = true;
    await mount(); await click('角色'); await click('角色资料'); await click('进入对话');
    expect(fixture.chat.openCharacterChat).toHaveBeenCalledWith('character-b');
    expect(document.querySelector('[data-chat]').dataset.chat).toBe('chat-b');
    expect(document.querySelector('[role="alert"]')).toBeNull();
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
  it('leaves the plugin page header to the official page and returns with Android Back', async () => {
    navigation.renderPanel = id => <>{id === 'plugins' && <MobilePluginBack />}<Page panel={id} /></>;
    await mount();
    await act(async () => navigation.selectPanel('plugins'));
    expect(document.querySelector('.mobile-shell').dataset.mobilePanel).toBe('plugins');
    expect(document.querySelector('.mobile-header')).toBeNull();
    await click('返回');
    expect(document.querySelector('[data-list]').dataset.list).toBe('messages');
    await act(async () => navigation.selectPanel('plugins'));
    await act(async () => window.dispatchEvent(new Event('eleckoi:platform-back', { cancelable: true })));
    expect(document.querySelector('[data-list]').dataset.list).toBe('messages');
  });
  it('dismisses the shared unsaved dialog with native Back while preserving the source route', async () => {
    await mount(); await click('角色资料');
    fixture.dialog = true;
    await act(async () => root.render(<Harness />));
    [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === '取消').focus();
    const event = new Event('eleckoi:platform-back', { cancelable: true });
    await act(async () => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(fixture.onCancel).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.textContent).toContain('角色资料');
  });
  it('closes an official modal with Android Back without leaving the source route', async () => {
    await mount(); await click('角色资料');
    const modalHost = document.createElement('div'); document.body.append(modalHost); const modalRoot = createRoot(modalHost);
    const onClose = vi.fn(() => modalRoot.render(null));
    try {
      await act(async () => modalRoot.render(<Modal open title="合成官方弹窗" closeLabel="关闭" onClose={onClose}><button data-modal-autofocus>合成操作</button></Modal>));
      const event = new Event('eleckoi:platform-back', { cancelable: true });
      await act(async () => window.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true); expect(onClose).toHaveBeenCalledOnce();
      expect(document.querySelector('[aria-label="合成官方弹窗"]')).toBeNull();
      expect(document.body.textContent).toContain('角色资料');
    } finally { await act(async () => modalRoot.unmount()); modalHost.remove(); }
  });
  it('hands native Back to a focused official menu before returning from its page', async () => {
    await mount(); await click('角色资料');
    const menu = document.createElement('div'); menu.dataset.menuMaterial = 'translucent';
    const control = document.createElement('button'); menu.append(control); document.body.append(menu);
    control.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); menu.remove(); } });
    control.focus();
    const event = new Event('eleckoi:platform-back', { cancelable: true });
    await act(async () => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true); expect(menu.isConnected).toBe(false);
    expect(document.body.textContent).toContain('角色资料');
    await act(async () => window.dispatchEvent(new Event('eleckoi:platform-back', { cancelable: true })));
    expect(document.querySelector('[data-list=messages]')).not.toBeNull();
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
    expect(rightbar.getSnapshot().shown).toBe(false);
    expect(document.querySelector('[data-rightbar-col]')).not.toBeNull();
    expect(document.querySelector('[data-chat]').dataset.chat).toBe('chat-a');
    expect(document.querySelector('[data-rightbar-compact]').dataset.rightbarCompact).toBe('true');
  });
});
