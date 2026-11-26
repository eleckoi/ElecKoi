import { localizeUiCopy } from "../app/i18n/productCopy.js";
import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { FailureReportContext } from '../ui/ui/FailureReportContext.js';
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StarFour } from '@phosphor-icons/react';
import { MainPageContext } from '../app/windows/MainPageContext.jsx';
import { useChatClient } from '../app/hooks/useChatClient.js';
import { useWindowAppearance } from '../app/hooks/useWindowAppearance.js';
import { AppToast } from '../ui/ui/AppToast.jsx';
import { FailureAlert } from '../ui/ui/FailureAlert.jsx';
import { subscribeAppFailure } from '../utils/appFailureOutlet.js';
import { ChatBackgroundModal, HistoryModal } from '../modules/chat/index.js';
import { AppUpdateController, useAppUpdates } from '../modules/updates/index.js';
import { MobileDialog, MobileHeader } from './MobileChrome.jsx';
import { SidebarContent } from '../app/windows/shell/components/SidebarContent.jsx';
import { BugReportDialog } from '../app/windows/shell/components/BugReportDialog.jsx';
import { useReportProblem } from '../app/windows/shell/hooks/useReportProblem.js';
import { MobileHomeSearch } from './MobileHomeSearch.jsx';
import { MobileRouteMotion } from './MobileRouteMotion.jsx';
import './mobile.css';

const ROOT_TABS = [ ['messages', '消息'], ['character', '角色'], ['creatorStudio', 'AI创作'], ['presets', '预设'], ['model', '模型'] ];
const EMPTY_RIGHTBAR = Object.freeze({ shown: false });
const subscribeEmpty = () => () => {};
const getEmptyRightbar = () => EMPTY_RIGHTBAR;

export function MobileWindow(props) {
  const tUi = useProductTranslation();
  const { navigation } = props;
  const chat = useChatClient(props);
  const appearance = useWindowAppearance({ notify: chat.notify });
  const appUpdates = useAppUpdates();
  const [settingsPage, setSettingsPage] = useState('home');
  const [drawerKind, setDrawerKind] = useState('main');
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const selectedPanel = navigation.selectedPanelId;
  const [routes, setRoutes] = useState(() => selectedPanel === 'creatorStudio' ? [{ panel: 'messages', kind: 'root' }, { panel: 'creatorStudio', kind: 'creator-studio' }] : [{ panel: selectedPanel, kind: 'root' }]);
  const route = routes.at(-1);
  const [routeBusy, setRouteBusy] = useState(false);
  const [pendingConversation, setPendingConversation] = useState(null);
  const conversationBusyRef = useRef(false);
  const [failure, setFailure] = useState(null);
  // 安卓没有独立窗口，错误对话框出现在任意页面上，所以报告对话框挂在窗口这一层（ADR 0042 决定 17）。
  // 社区页自己那份对话框保留不动：它只属于那一个页面。
  const reportProblem = useReportProblem({ onDismissNotice: chat.dismissNotice });
  const drawerState = useSyncExternalStore(navigation.sidebar.subscribe, navigation.sidebar.getSnapshot);
  const drawerOpen = Boolean(drawerState.shown && drawerState.drawer);
  const rightbarState = useSyncExternalStore(props.rightbar?.subscribe || subscribeEmpty, props.rightbar?.getSnapshot || getEmptyRightbar);
  const guardRef = useRef(null);
  const skipPanelGuard = useRef(false);
  const scrollPositions = useRef(new Map()).current;
  const backHandlers = useRef([]);
  const drawerRef = useRef(null);
  const drawerFocusRef = useRef(null);
  const routeRef = useRef(routes);
  routeRef.current = routes;
  const pageRef = useRef(null);
  useEffect(() => {
    document.documentElement.dataset.eleckoiMobile = 'true';
    return () => { delete document.documentElement.dataset.eleckoiMobile; };
  }, []);
  // 应用级失败不留在角落里：功能内失败面把这类失败送到窗口级错误对话框（码与详情仍然可见）。
  useEffect(() => subscribeAppFailure(resolved => {
    chat.notify('error', resolved.text, resolved);
  }), [chat.notify]);
  const registerBackHandler = useCallback(handler => {
    backHandlers.current.push(handler);
    return () => { backHandlers.current = backHandlers.current.filter(item => item !== handler); };
  }, []);
  const guarded = useCallback(action => {
    if (guardRef.current) guardRef.current(action);
    else action();
  }, []);
  const selectPanel = useCallback(id => {
    if (conversationBusyRef.current) return;
    guarded(() => {
      const to = { panel: id, kind: id === 'creatorStudio' ? 'creator-studio' : 'root' };
      skipPanelGuard.current = true;
      try {
        navigation.selectPanel(id);
        setRoutes(current => to.kind === 'creator-studio' ? current.at(-1).panel === id ? current : [...current, to] : [to]);
      }
      finally { skipPanelGuard.current = false; }
    });
  }, [guarded, navigation]);
  const openSettings = page => guarded(() => {
    skipPanelGuard.current = true;
    try { setSettingsPage(page); navigation.selectPanel('settings'); }
    finally { skipPanelGuard.current = false; }
  });
  const back = useCallback(() => {
    if (drawerState.shown) { navigation.closeSidebar(); return true; }
    const handler = backHandlers.current.at(-1);
    if (handler && handler() !== false) return true;
    if (rightbarState.shown) { props.rightbar.close(); return true; }
    if (conversationBusyRef.current) return true;
    if (routeRef.current.length <= 1) return false;
    guarded(() => {
      const next = routeRef.current.slice(0, -1);
      skipPanelGuard.current = true;
      try { navigation.selectPanel(next.at(-1).panel); setRoutes(next); }
      finally { skipPanelGuard.current = false; }
    });
    return true;
  }, [drawerState.shown, guarded, navigation, props.rightbar, rightbarState.shown]);
  useEffect(() => navigation.setPanelGuard(commit => {
    if (skipPanelGuard.current) commit();
    else guarded(commit);
  }), [guarded, navigation.setPanelGuard]);
  const enterConversation = useCallback(source => {
    skipPanelGuard.current = true;
    try {
      navigation.selectPanel('messages');
      setRoutes([...source, { panel: 'messages', kind: 'conversation' }]);
    }
    finally { skipPanelGuard.current = false; }
  }, [navigation]);
  useLayoutEffect(() => {
    if (routeRef.current.at(-1).panel === selectedPanel) return;
    if (selectedPanel === 'creatorStudio') setRoutes(current => [...current, { panel: selectedPanel, kind: 'creator-studio' }]);
    else if (selectedPanel === 'conversation') setRoutes(current => [...current, { panel: 'conversation', kind: 'official-conversation' }]);
    else if (!localizeUiCopy(ROOT_TABS, tUi).some(([id]) => id === selectedPanel)) setRoutes(current => [...current, { panel: selectedPanel, kind: 'root' }]);
    else setRoutes([{ panel: selectedPanel, kind: 'root' }]);
  }, [selectedPanel]);
  useEffect(() => {
    const focusedDialog = () => document.activeElement?.closest('[aria-modal="true"]');
    function onBack(event) {
      const focused = document.activeElement;
      if (focused?.closest('[data-menu-material], [aria-haspopup="menu"][aria-expanded="true"]')) {
        const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        Object.defineProperty(escape, 'eleckoiPlatformBack', { value: true });
        focused.dispatchEvent(escape);
        if (escape.defaultPrevented) { event.preventDefault(); return; }
      }
      const dialog = focusedDialog();
      if (dialog && !dialog.dataset.mobileBackOwner) {
        const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        Object.defineProperty(escape, 'eleckoiPlatformBack', { value: true });
        focused.dispatchEvent(escape);
        event.preventDefault();
      } else if (back()) event.preventDefault();
    }
    function onKey(event) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.eleckoiPlatformBack) return;
      const dialog = focusedDialog();
      if (dialog && !dialog.dataset.mobileBackOwner) return;
      if (back()) event.preventDefault();
    }
    window.addEventListener('eleckoi:platform-back', onBack);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('eleckoi:platform-back', onBack); window.removeEventListener('keydown', onKey); };
  }, [back]);
  useEffect(() => {
    if (drawerOpen) {
      drawerFocusRef.current ??= document.activeElement;
      drawerRef.current?.querySelector('button')?.focus();
    } else if (drawerFocusRef.current?.isConnected) {
      drawerFocusRef.current.focus({ preventScroll: true });
      drawerFocusRef.current = null;
    }
  }, [drawerOpen]);
  useLayoutEffect(() => {
    if (!pendingConversation?.complete) return;
    const { target, source } = pendingConversation;
    const matches = Boolean(chat.sessionId) && (target.sessionId
      ? chat.sessionId === target.sessionId
      : chat.chatCharacter.character_id === target.characterId);
    if (matches) enterConversation(source);
    else setFailure(chat.notice?.type === 'error' ? chat.notice.failure || chat.notice.message : chat.status && chat.status !== '就绪' ? chat.status : tUi("对话未能打开，请重试"));
    setPendingConversation(null);
    conversationBusyRef.current = false;
    setRouteBusy(false);
  }, [pendingConversation, chat.sessionId, chat.chatCharacter.character_id, chat.notice, chat.status, enterConversation]);
  async function openConversation(target, load) {
    if (conversationBusyRef.current) return;
    const source = [...routeRef.current];
    const alreadyOpen = Boolean(chat.sessionId) && (target.sessionId
      ? chat.sessionId === target.sessionId
      : chat.chatCharacter.character_id === target.characterId);
    if (alreadyOpen) {
      enterConversation(source);
      return;
    }
    conversationBusyRef.current = true;
    setRouteBusy(true);
    setPendingConversation({ target, source, complete: false });
    try {
      await load();
      setPendingConversation({ target, source, complete: true });
    } catch (error) {
      setFailure(error);
      setPendingConversation(null); conversationBusyRef.current = false; setRouteBusy(false);
    }
  }
  const effectiveRoute = route.panel === selectedPanel ? route : { panel: selectedPanel, kind: 'root' };
  const openingSessionId = pendingConversation?.target.sessionId;
  const view = {
    ...props, chat, appearance, route: effectiveRoute, routeBusy, openingSessionId,
    renderFrameSidebar,
    renderFramePage: ({ mainPanel, overlays, panelId }) => <>{panelId !== 'conversation' && panelId !== 'plugins' && <MobileHeader title={navigation.items.find(item => item.id === panelId)?.label || panelId} back={routes.length > 1 ? back : undefined} />}{mainPanel}{overlays}</>,
    scrollPositions, registerBackHandler, guardRef,
    modelNavigationGuardRef: guardRef, presetNavigationGuardRef: guardRef,
    appUpdates, settingsPage, setSettingsPage, changeActiveSection: selectPanel,
    goBack: back, selectPanel,
    openSearch: () => setSearchOpen(true),
    openSearchRoute: next => guarded(() => {
      skipPanelGuard.current = true;
      try { navigation.selectPanel(next.panel); setRoutes(current => [...current, next]); }
      finally { skipPanelGuard.current = false; }
    }),
    replaceRoute: next => { if (!conversationBusyRef.current) guarded(() => setRoutes(current => [...current.slice(0, -1), { ...current.at(-1), ...next }])); },
    pushRoute: next => { if (!conversationBusyRef.current) guarded(() => setRoutes(current => [...current, { panel: selectedPanel, ...next }])); },
    openDrawer: () => { if (!conversationBusyRef.current) { setDrawerKind('main'); navigation.toggleSidebar(); } },
    openWorkspaceDrawer: () => { if (!conversationBusyRef.current) { setDrawerKind('workspace'); navigation.toggleSidebar(); } },
    selectConversation: id => openConversation({ sessionId: id }, () => chat.loadChat(id, { keepSection: true })),
    openCharacterConversation: id => openConversation({ characterId: id }, () => chat.openCharacterChat(id, { keepSection: true })),
    openCharacterSection: () => selectPanel('character'),
    openCharacterEditor: characterId => {
      if (conversationBusyRef.current) return;
      guarded(() => {
        skipPanelGuard.current = true;
        try {
          navigation.selectPanel('character');
          setRoutes(current => [...current, { panel: 'character', kind: 'character-editor', characterId }]);
        } finally { skipPanelGuard.current = false; }
      });
    },
    openPresetTools: () => selectPanel('presets'),
    openChatBackground: () => setBackgroundOpen(true),
    renderLayout: ({ mainPanel, overlays }) => <>{mainPanel}{overlays}</>,
  };
  const isRootTab = effectiveRoute.kind === 'root' && localizeUiCopy(ROOT_TABS, tUi).some(([id]) => id === selectedPanel);
  const renderSidebarContent = renderSidebarSlot => <SidebarContent expanded compactAccount
    activeSection={selectedPanel}
    navigationItems={navigation.items.filter(item => !localizeUiCopy(ROOT_TABS, tUi).some(([id]) => id === item.id))}
    renderEntryActions={navigation.hasSidebarEntryActions && renderSidebarSlot
      ? onDismiss => navigation.renderSidebarEntryActions(renderSidebarSlot, onDismiss) : undefined}
    renderSidebarSlot={renderSidebarSlot} hasFooterActions={navigation.hasSidebarFooterActions}
    profileActive={selectedPanel === 'settings' && settingsPage === 'profile'}
    onSectionChange={navigation.selectPanel} onNavigationAction={navigation.selectPanel} persona={chat.persona}
    onOpenProfile={() => openSettings('profile')}
    onOpenSettings={() => openSettings('home')}
    onCollapse={navigation.closeSidebar} />;
  function renderFrameSidebar(renderSidebarSlot, workspaceSidebar, { collapsed = false, drawer = true } = {}) {
    return <aside className={`mobile-drawer official-mobile-sidebar${drawerKind === 'workspace' ? ' mobile-workspace-drawer' : ''}`} ref={drawerRef}
      aria-label={drawerKind === 'workspace' ? tUi("工作区会话管理") : tUi("侧边导航")} onKeyDown={event => {
        if (!drawer || collapsed || event.key !== 'Tab') return;
        const items = [...drawerRef.current.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')];
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }}>
      {drawerKind === 'workspace' ? workspaceSidebar : renderSidebarContent(renderSidebarSlot)}
    </aside>;
  }
  return <FailureReportContext.Provider value={reportProblem.available ? reportProblem.openReport : null}><MainPageContext.Provider value={view}>
    <main className="main-window-shell mobile-shell" data-mobile-route={effectiveRoute.kind} data-mobile-panel={selectedPanel} data-mobile-rightbar={rightbarState.shown} data-drawer-present={drawerOpen}
      data-opening-message={isRootTab && selectedPanel === 'messages' && Boolean(openingSessionId) || undefined}>
      <section ref={pageRef} className={`mobile-page-seat${selectedPanel === 'conversation' ? ' mobile-workspace-page' : ''}`} inert={searchOpen ? true : undefined} aria-hidden={searchOpen || undefined}>
        <Suspense fallback={isRootTab ? <MobileHeader title={localizeUiCopy(ROOT_TABS, tUi).find(([id]) => id === selectedPanel)?.[1]} /> : null}>
          {props.nativeFrame}
          <MobileRouteMotion seat={pageRef} routes={routes} panel={selectedPanel} settingsPage={selectedPanel === 'settings' ? settingsPage : null}
            drawerOpen={drawerOpen} searchOpen={searchOpen} routeBusy={routeBusy} isRootTab={isRootTab} />
        </Suspense>
      </section>
      {isRootTab && <nav className="mobile-bottom-nav" aria-label={tUi("主导航")} inert={drawerOpen || searchOpen ? true : undefined} aria-hidden={searchOpen || undefined} style={searchOpen ? { visibility: 'hidden' } : undefined}>
        {localizeUiCopy(ROOT_TABS, tUi).map(([id, label]) => <button key={id} type="button" aria-label={label} disabled={routeBusy} aria-current={selectedPanel === id ? 'page' : undefined} className={id === 'creatorStudio' ? 'mobile-create-tab' : ''} onClick={() => { if (selectedPanel !== id) selectPanel(id); }}>
          {id === 'creatorStudio' ? <span className="mobile-create-mark"><StarFour size={15} weight="fill" /></span> : <span>{label}</span>}
        </button>)}
      </nav>}
      {searchOpen && <MobileHomeSearch history={searchHistory}
        onCommit={term => { if (term) setSearchHistory(current => [term, ...current.filter(item => item !== term)].slice(0, 10)); }}
        onForget={term => setSearchHistory(current => current.filter(item => item !== term))}
        onClear={() => setSearchHistory([])} onClose={action => { setSearchOpen(false); action?.(); }} />}
      <AppToast
        notice={chat.notice}
        onDismiss={chat.dismissNotice}
        onReportProblem={reportProblem.available ? reportProblem.openReport : undefined}
      />
      <BugReportDialog
        open={reportProblem.dialogProps.open}
        onClose={reportProblem.dialogProps.onClose}
        initialNotes={reportProblem.dialogProps.initialNotes}
        onNotify={chat.notify}
      />
      <AppUpdateController updates={appUpdates} />
      <HistoryModal open={chat.historyOpen} sessions={chat.sessions} sessionId={chat.sessionId} chatCharacter={chat.chatCharacter} conversationModel={props.conversations}
        onClose={chat.closeHistory} onLoadChat={chat.loadChat} onDeleteChat={chat.removeHistoryChat} onHistoryImported={() => chat.refreshSessionsOnly({ keepSection: true })} />
      <ChatBackgroundModal open={backgroundOpen} character={chat.chatBackgroundCharacter} persona={chat.chatPersona} messages={chat.messages} chatDisplay={appearance.chatDisplay}
        globalWallpaper={appearance.globalChatWallpaper} newCharacterBackground={appearance.newCharacterBackground} onClose={() => setBackgroundOpen(false)} onSaveCharacter={chat.updateChatBackground}
        onSaveGlobal={appearance.saveGlobalChatWallpaper} onSaveNewCharacterBackground={appearance.saveNewCharacterBackground} onNotify={chat.notify} />
      {failure && <MobileDialog title={tUi("打开失败")} onClose={() => setFailure(null)}><FailureAlert failure={failure} /></MobileDialog>}
    </main>
  </MainPageContext.Provider></FailureReportContext.Provider>;
}
