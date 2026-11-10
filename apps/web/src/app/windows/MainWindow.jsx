import { useProductTranslation } from "../i18n/ProductLocaleContext.jsx";
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ChatBackgroundModal, ChatWallpaperLayer, HistoryModal } from "../../modules/chat/index.js";
import { resolveChatWallpaper } from "../../modules/appearance/index.js";
import { useChatClient } from "../hooks/useChatClient.js";
import { useWindowAppearance } from "../hooks/useWindowAppearance.js";
import { AppToast } from "../../ui/ui/AppToast.jsx";
import { FailureAlert } from "../../ui/ui/FailureAlert.jsx";
import { subscribeAppFailure } from "../../utils/appFailureOutlet.js";
import { resolveFailure } from "../../utils/failureText.js";
import { bestEffort } from "../../utils/swallowedFailure.js";
import { SidebarContent } from "./shell/components/SidebarContent.jsx";
import { CommunityDialog } from "./shell/components/CommunityDialog.jsx";
import { BugReportDialog } from "./shell/components/BugReportDialog.jsx";
import { bugReportBridge, isBugReportAvailable } from "./shell/components/bugReportBridge.js";
import { useReportProblem } from "./shell/hooks/useReportProblem.js";
import { FailureReportContext } from '../../ui/ui/FailureReportContext.js';
import { PluginCenterSurface, PluginListPanel } from "./shell/components/PluginCenter.jsx";
import { SidePanelResizeHandle } from "./shell/components/SidePanelResizeHandle.jsx";
import { TitleBar, WindowControls } from "./shell/components/TitleBar.jsx";
import { useRightbarLayout } from "./shell/hooks/useRightbarLayout.js";
import { useSidePanelLayout } from "./shell/hooks/useSidePanelLayout.js";
import { useColumnTransition } from "./shell/hooks/useColumnTransition.js";
import { AppUpdateController, useAppUpdates } from "../../modules/updates/index.js";
import { MainPageContext } from "./MainPageContext.jsx";

const emptySidebarSnapshot = { shown: false };
const emptySidebar = { subscribe: () => () => {}, getSnapshot: () => emptySidebarSnapshot };

/**
 * 「上次没送出去的报告」只提示一次（ADR 0042 决定 14：不偷偷重发，也不反复打扰）。
 * 提示按份数说话；模块级标记：窗口重新挂载也算同一次运行。
 */
let bugReportDraftPrompted = false;

class MainPageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

export function MainWindow({ conversations, characters, characterConfiguration, models, persona, presets, creatorStudio, renderCreatorStudioConversation, settingsSections = [], navigation, rightbar, renderSettingsSection, renderLanguageSettings, renderTypographySettings, renderUserProfileEditor, renderCharacterPageSection, renderConversationList, renderPresetEditorSection, renderRoleplay }) {
  const tUi = useProductTranslation();
  const chat = useChatClient({ conversations, characters, models, persona, navigation });
  const appearance = useWindowAppearance({ notify: chat.notify });
  const sidePanelLayout = useSidePanelLayout();
  const nativeConversation = ["conversation", "creatorStudio", "schedules"].includes(chat.activeSection);
  const sidebarModel = navigation?.sidebar ?? emptySidebar;
  const sidebar = useSyncExternalStore(sidebarModel.subscribe, sidebarModel.getSnapshot);
  const rightbarLayout = useRightbarLayout({
    model: rightbar,
    shellRef: sidePanelLayout.shellRef,
    sidePanelCollapsed: nativeConversation ? !sidebar.shown : sidePanelLayout.sidePanelCollapsed,
    collapseSidePanel: nativeConversation ? navigation.closeSidebar : sidePanelLayout.collapseSidePanel,
  });
  const appUpdates = useAppUpdates();
  const nativeSidebarWidth = sidebar.shown ? 280 : 0;
  const isPluginPanel = Boolean(navigation && !navigation.productPanelIds?.includes(chat.activeSection) && chat.activeSection !== "plugins");
  const columnAnimating = useColumnTransition({
    shellRef: sidePanelLayout.shellRef,
    sidebarCollapsed: nativeConversation ? !sidebar.shown : sidePanelLayout.sidePanelCollapsed || isPluginPanel,
    rightbarTrack: rightbarLayout.track,
    viewportWidth: sidePanelLayout.viewportWidth,
  });
  const [chatBackgroundOpen, setChatBackgroundOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const reportProblem = useReportProblem({ onDismissNotice: chat.dismissNotice });
  const [settingsPage, setSettingsPage] = useState("chat");
  const [presetRequestedTab, setPresetRequestedTab] = useState("");
  const presetNavigationGuardRef = useRef(null);
  const modelNavigationGuardRef = useRef(null);

  useEffect(() => {
    document.title = "ElecKoi";
  }, []);

  useEffect(() => {
    const action = event => {
      if (event.detail === 'creatorStudio') navigation.selectPanel('creatorStudio');
      if (event.detail === 'community') setCommunityOpen(true);
    };
    window.addEventListener('eleckoi:shell-action', action);
    return () => window.removeEventListener('eleckoi:shell-action', action);
  }, []);

  useEffect(() => {
    if (globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === "android") return undefined;
    return window.dshDesktop?.host?.subscribeFailure((notice) => {
      // 宿主送的是失败对象（边界⑤），用户可见文案只在这里产生一次。
      const resolved = resolveFailure(notice, { fallback: tUi("插件服务意外退出，请重新打开插件中心。") });
      chat.notify("error", resolved.text, resolved);
    });
  }, [chat.notify]);

  // 应用级失败（插件装载 / 库结构 / 存储 / 调用来源 / 生命周期）不留在界面的角落：
  // 功能内失败面把这类失败送到这里，接窗口级错误对话框（码与详情在对话框里可见）。
  useEffect(() => subscribeAppFailure((resolved) => {
    chat.notify("error", resolved.text, resolved);
  }), [chat.notify]);

  // 上次没发出去的报告：每次运行最多提示一次，送不送由用户点（ADR 0042 决定 14）。
  // 只查一次、不轮询、不重发——草稿的处置全在「报告问题」对话框里。提示按份数说话。
  useEffect(() => {
    if (bugReportDraftPrompted || !isBugReportAvailable()) return;
    const bridge = bugReportBridge();
    if (typeof bridge?.drafts !== "function") return;
    bugReportDraftPrompted = true;
    bridge.drafts()
      .then((result) => {
        const count = Array.isArray(result?.drafts) ? result.drafts.length : 0;
        if (count === 0) return;
        chat.notify("info", tUi("上次有 {value0} 份没送出去的报告，打开「报告问题」可以重发。", {value0: count}));
      })
      // 草稿列表问不到不是用户能处理的事：不提示，等下次启动再问。
      .catch(bestEffort);
  }, []);

  const changeActiveSection = useCallback((section) => {
    if (chat.activeSection === "model" && section !== "model" && modelNavigationGuardRef.current) {
      modelNavigationGuardRef.current(() => chat.setActiveSection(section));
      return;
    }
    if (chat.activeSection === "presets" && section !== "presets" && presetNavigationGuardRef.current) {
      presetNavigationGuardRef.current(() => chat.setActiveSection(section));
      return;
    }
    chat.setActiveSection(section);
  }, [chat]);

  useEffect(() => window.dshDesktop?.menu?.subscribe((command) => {
    if (command === 'about') { setSettingsPage('about'); changeActiveSection('settings'); }
    if (command === 'check-updates') void appUpdates.check().catch((cause) => {
      const failure = resolveFailure(cause, { fallback: tUi("检查更新失败。") });
      chat.notify('error', failure.text, failure);
    });
  }), [changeActiveSection, appUpdates.check, chat.notify]);

  const chatWallpaper = useMemo(() => resolveChatWallpaper({
    character: chat.chatBackgroundCharacter,
    persona: chat.chatPersona,
    globalWallpaper: appearance.globalChatWallpaper,
  }), [appearance.globalChatWallpaper, chat.chatBackgroundCharacter, chat.chatPersona]);
  const showChatWallpaper = chat.activeSection === "messages" && Boolean(chat.sessionId || chat.chatCharacter?.character_id) && Boolean(chatWallpaper.image);

  function selectConversation(chatId) {
    if (chatId === chat.sessionId) {
      chat.clearActiveChat();
      return;
    }
    chat.loadChat(chatId);
  }

  function renderWindowLayout({ sidePanel, mainPanel, overlays = null }) {
    const renderSidebarContent = (renderSidebarSlot, workspaceSidebar) => <SidebarContent
          desktopMenu
          activeSection={communityOpen ? "community" : chat.activeSection}
          navigationItems={navigation?.items}
          renderEntryActions={navigation?.hasSidebarEntryActions && renderSidebarSlot
            ? onDismiss => navigation.renderSidebarEntryActions(renderSidebarSlot, onDismiss) : undefined}
          renderSidebarSlot={renderSidebarSlot}
          profileActive={chat.activeSection === "settings" && settingsPage === "profile"}
          onSectionChange={changeActiveSection}
          onNavigationAction={(id) => {
            if (id === "creatorStudio") return changeActiveSection("creatorStudio");
            if (id === "community") setCommunityOpen(true);
          }}
          persona={chat.persona}
          onOpenProfile={() => {
            setSettingsPage("profile");
            changeActiveSection("settings");
          }}
          onOpenSettings={() => {
            setSettingsPage("chat");
            changeActiveSection("settings");
          }}
        collapsed={sidePanelLayout.sidePanelCollapsed || isPluginPanel}
        onCollapse={sidePanelLayout.collapseSidePanel}
        hasFooterActions={navigation?.hasSidebarFooterActions}
        sidePanel={sidePanel}
        workspaceSidebar={workspaceSidebar}
        workspaceCollapsed={!sidebar.shown}
      />;
    return (
      <>
        {navigation?.renderSidebar ? navigation.renderSidebar(renderSidebarContent,
          { workspace: nativeConversation, collapsed: !sidebar.shown, width: 280 }) : renderSidebarContent(null)}

        <section className="main-panel-shell" aria-label={tUi("主功能界面")}>
          <TitleBar
            splitSurface
            desktopMenu={nativeConversation ? !sidebar.shown : sidePanelLayout.sidePanelCollapsed || isPluginPanel}
            showWindowControls={false}
            sidePanelCollapsed={nativeConversation ? !sidebar.shown : sidePanelLayout.sidePanelCollapsed && !isPluginPanel}
            onToggleSidePanel={nativeConversation ? navigation.toggleSidebar : sidePanelLayout.expandSidePanel}
          />
          <div className="main-panel-content">{mainPanel}</div>
        </section>
        {overlays}
      </>
    );
  }

  const pageView = {
    chat,
    appearance,
    appUpdates,
    conversations,
    creatorStudio,
    renderCreatorStudioConversation,
    characters,
    characterConfiguration,
    models,
    presets,
    settingsSections,
    renderSettingsSection,
    renderLanguageSettings,
    renderTypographySettings,
    renderUserProfileEditor,
    renderCharacterPageSection,
    renderConversationList,
    renderPresetEditorSection,
    renderRoleplay,
    settingsPage,
    setSettingsPage,
    presetNavigationGuardRef,
    modelNavigationGuardRef,
    presetRequestedTab,
    setPresetRequestedTab,
    changeActiveSection,
    renderLayout: renderWindowLayout,
    selectConversation,
    openChatBackground: () => setChatBackgroundOpen(true),
    openPresetTools: () => {
      setPresetRequestedTab("tools");
      changeActiveSection("presets");
    },
    openCharacterSection: () => chat.setActiveSection("character"),
  };

  let windowLayout;
  if (chat.activeSection === "plugins") {
    windowLayout = renderWindowLayout({
      sidePanel: <PluginListPanel onNotify={chat.notify} />,
      mainPanel: <PluginCenterSurface>{navigation?.renderPanel("plugins")}</PluginCenterSurface>,
    });
  } else if (isPluginPanel) {
    windowLayout = renderWindowLayout({
      sidePanel: null,
      mainPanel: navigation.renderPanel(chat.activeSection),
    });
  } else if (navigation) {
    windowLayout = navigation.renderPanel(chat.activeSection);
  } else {
    windowLayout = renderWindowLayout({
      sidePanel: null,
      mainPanel: <div className="chat-empty-guide" role="alert">{tUi("客户端插件未加载。")}</div>,
    });
  }
  return (
    <FailureReportContext.Provider value={reportProblem.available ? reportProblem.openReport : null}>
    <main
      ref={sidePanelLayout.shellRef}
      className={`qq-shell main-window-shell section-${isPluginPanel ? "plugin" : chat.activeSection}${nativeConversation ? " has-native-workspace-sidebar" : ""}${showChatWallpaper ? " has-chat-wallpaper" : ""}${(nativeConversation ? !sidebar.shown : sidePanelLayout.sidePanelCollapsed || isPluginPanel) ? " side-panel-collapsed" : ""}`}
      style={{
        ...(isPluginPanel ? { ...sidePanelLayout.shellStyle, "--side-panel-width": "0px" } : sidePanelLayout.shellStyle),
        ...(nativeConversation ? { "--side-panel-width": `${nativeSidebarWidth}px` } : {}),
        ...rightbarLayout.shellStyle,
      }}
      data-side-panel-dragging={sidePanelLayout.sidePanelDragging || undefined}
      data-columns-animating={columnAnimating || undefined}
      data-rightbar-dragging={rightbarLayout.dragging || undefined}
      data-rightbar-fullscreen={rightbarLayout.fullscreen || undefined}
      data-rightbar-instant={rightbarLayout.instant || undefined}
    >
      {showChatWallpaper ? <ChatWallpaperLayer wallpaper={chatWallpaper} /> : null}
      <MainPageContext.Provider value={pageView}>
        <MainPageErrorBoundary
          key={chat.activeSection}
          fallback={(error) => renderWindowLayout({
            sidePanel: null,
            // 页面级失败也走唯一解析点：用户句按码给，码与参数化详情一起可见。
            // 直接显示 `error.message` 会把开发者诊断丢给用户，还把码丢掉。
            mainPanel: <FailureAlert failure={error} context={tUi("页面加载失败")} className="chat-empty-guide" />,
          })}
        >
          <Suspense fallback={renderWindowLayout({ sidePanel: null, mainPanel: null })}>
            {windowLayout}
          </Suspense>
        </MainPageErrorBoundary>
        <div className="dsh-rightbar-column">
          {rightbar?.render?.({
            width: rightbarLayout.width,
            viewportWidth: rightbarLayout.viewportWidth,
            canShow: rightbarLayout.canShow,
          })}
        </div>
      </MainPageContext.Provider>
      {!sidePanelLayout.sidePanelCollapsed && !isPluginPanel ? (
        <SidePanelResizeHandle
          onStart={sidePanelLayout.startSidePanelResize}
          onDrag={sidePanelLayout.resizeSidePanel}
          onEnd={sidePanelLayout.endSidePanelResize}
        />
      ) : null}
      {rightbarLayout.showResizeHandle ? rightbarLayout.resizeHandle : null}
      <div className="main-window-controls">
        <WindowControls />
      </div>
      <HistoryModal
        open={chat.historyOpen}
        sessions={chat.sessions}
        sessionId={chat.sessionId}
        chatCharacter={chat.chatCharacter}
        conversationModel={conversations}
        onClose={chat.closeHistory}
        onLoadChat={chat.loadChat}
        onDeleteChat={chat.removeHistoryChat}
        onHistoryPolicyChange={() => chat.refreshSessionsOnly({ keepSection: true })}
      />
      <ChatBackgroundModal
        open={chatBackgroundOpen}
        character={chat.chatBackgroundCharacter}
        persona={chat.chatPersona}
        messages={chat.messages}
        chatDisplay={appearance.chatDisplay}
        globalWallpaper={appearance.globalChatWallpaper}
        newCharacterBackground={appearance.newCharacterBackground}
        onClose={() => setChatBackgroundOpen(false)}
        onSaveCharacter={chat.updateChatBackground}
        onSaveGlobal={appearance.saveGlobalChatWallpaper}
        onSaveNewCharacterBackground={appearance.saveNewCharacterBackground}
        onNotify={chat.notify}
      />
      <CommunityDialog
        open={communityOpen}
        onClose={() => setCommunityOpen(false)}
        onNotify={chat.notify}
        onReportProblem={reportProblem.available ? () => {
          setCommunityOpen(false);
          reportProblem.openReport();
        } : undefined}
      />
      <BugReportDialog
        open={reportProblem.dialogProps.open}
        onClose={reportProblem.dialogProps.onClose}
        initialNotes={reportProblem.dialogProps.initialNotes}
        onNotify={chat.notify}
      />
      {/* 出错的那一刻也能报告（决定 17）：没有报告服务时不传，按钮不渲染。 */}
      <AppToast
        notice={chat.notice}
        onDismiss={chat.dismissNotice}
        onReportProblem={reportProblem.available ? reportProblem.openReport : undefined}
      />
      <AppUpdateController updates={appUpdates} />
    </main>
    </FailureReportContext.Provider>
  );
}
