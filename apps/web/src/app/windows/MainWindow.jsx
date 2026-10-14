import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatBackgroundModal, ChatWallpaperLayer, HistoryModal } from "../../modules/chat/index.js";
import { resolveChatWallpaper } from "../../modules/appearance/index.js";
import { useChatClient } from "../hooks/useChatClient.js";
import { useWindowAppearance } from "../hooks/useWindowAppearance.js";
import { AppToast } from "../../ui/ui/AppToast.jsx";
import { SidebarContent } from "./shell/components/SidebarContent.jsx";
import { CommunityDialog } from "./shell/components/CommunityDialog.jsx";
import { PluginCenterSurface, PluginListPanel } from "./shell/components/PluginCenter.jsx";
import { SidePanelResizeHandle } from "./shell/components/SidePanelResizeHandle.jsx";
import { TitleBar, WindowControls } from "./shell/components/TitleBar.jsx";
import { useRightbarLayout } from "./shell/hooks/useRightbarLayout.js";
import { useSidePanelLayout } from "./shell/hooks/useSidePanelLayout.js";
import { AppUpdateController, useAppUpdates } from "../../modules/updates/index.js";
import { openCreatorStudioWindow } from "../../modules/creatorStudio/index.js";
import { MainPageContext } from "./MainPageContext.jsx";

class MainPageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
  }
}

export function MainWindow({ conversations, characters, characterConfiguration, models, persona, presets, settingsSections = [], navigation, rightbar, renderSettingsSection, renderUserProfileEditor, renderCharacterPageSection, renderConversationList, renderPresetEditorSection, renderRoleplay }) {
  const chat = useChatClient({ conversations, characters, models, persona, navigation });
  const appearance = useWindowAppearance({ notify: chat.notify });
  const sidePanelLayout = useSidePanelLayout();
  const rightbarLayout = useRightbarLayout({
    model: rightbar,
    shellRef: sidePanelLayout.shellRef,
    sidePanelCollapsed: sidePanelLayout.sidePanelCollapsed,
    collapseSidePanel: sidePanelLayout.collapseSidePanel,
  });
  const appUpdates = useAppUpdates();
  const isPluginPanel = Boolean(navigation && !navigation.productPanelIds?.includes(chat.activeSection) && chat.activeSection !== "plugins");
  const [chatBackgroundOpen, setChatBackgroundOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState("chat");
  const [presetRequestedTab, setPresetRequestedTab] = useState("");
  const presetNavigationGuardRef = useRef(null);
  const modelNavigationGuardRef = useRef(null);

  useEffect(() => {
    document.title = "ElecKoi";
  }, []);

  useEffect(() => {
    if (globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === "android") return undefined;
    return window.dshDesktop.host?.subscribeFailure((message) => {
      chat.notify("error", message);
    });
  }, [chat.notify]);

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

  const chatWallpaper = useMemo(() => appearance.chatBackgroundLocks?.[chat.sessionId] || resolveChatWallpaper({
    character: chat.chatBackgroundCharacter,
    persona: chat.chatPersona,
    globalWallpaper: appearance.globalChatWallpaper,
  }), [appearance.chatBackgroundLocks, appearance.globalChatWallpaper, chat.sessionId, chat.chatBackgroundCharacter, chat.chatPersona]);
  const showChatWallpaper = chat.activeSection === "messages" && Boolean(chat.sessionId || chat.chatCharacter?.character_id) && Boolean(chatWallpaper.image);

  function selectConversation(chatId) {
    if (chatId === chat.sessionId) {
      chat.clearActiveChat();
      return;
    }
    chat.loadChat(chatId);
  }

  function renderWindowLayout({ sidePanel, mainPanel, overlays = null }) {
    const renderSidebarContent = (renderSidebarSlot) => <SidebarContent
          activeSection={chat.activeSection}
          navigationItems={navigation?.items}
          renderSidebarSlot={renderSidebarSlot}
          profileActive={chat.activeSection === "settings" && settingsPage === "profile"}
          onSectionChange={changeActiveSection}
          onNavigationAction={(id) => {
            if (id === "creatorStudio") return openCreatorStudioWindow();
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
      />;
    return (
      <>
        {navigation?.renderSidebar ? navigation.renderSidebar(renderSidebarContent) : renderSidebarContent(null)}

        <section className="main-panel-shell" aria-label="主功能界面">
          <TitleBar
            splitSurface
            showWindowControls={false}
            sidePanelCollapsed={sidePanelLayout.sidePanelCollapsed && !isPluginPanel}
            onToggleSidePanel={sidePanelLayout.expandSidePanel}
          />
          <div className="main-panel-content">{mainPanel}</div>
        </section>
        <div className="dsh-rightbar-column">
          {rightbar?.render?.({
            width: rightbarLayout.width,
            viewportWidth: rightbarLayout.viewportWidth,
            canShow: rightbarLayout.canShow,
          })}
        </div>
        {overlays}
      </>
    );
  }

  const pageView = {
    chat,
    appearance,
    appUpdates,
    conversations,
    characters,
    characterConfiguration,
    models,
    presets,
    settingsSections,
    renderSettingsSection,
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
      mainPanel: <div className="chat-empty-guide" role="alert">客户端插件未加载。</div>,
    });
  }
  return (
    <main
      ref={sidePanelLayout.shellRef}
      className={`qq-shell main-window-shell section-${isPluginPanel ? "plugin" : chat.activeSection}${showChatWallpaper ? " has-chat-wallpaper" : ""}${sidePanelLayout.sidePanelCollapsed || isPluginPanel ? " side-panel-collapsed" : ""}`}
      style={{
        ...(isPluginPanel ? { ...sidePanelLayout.shellStyle, "--side-panel-width": "0px" } : sidePanelLayout.shellStyle),
        ...rightbarLayout.shellStyle,
      }}
      data-side-panel-dragging={sidePanelLayout.sidePanelDragging || undefined}
      data-rightbar-animating={rightbarLayout.animating || undefined}
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
            mainPanel: <div className="chat-empty-guide" role="alert">页面加载失败：{error?.message || String(error)}</div>,
          })}
        >
          <Suspense fallback={renderWindowLayout({ sidePanel: null, mainPanel: null })}>
            {windowLayout}
          </Suspense>
        </MainPageErrorBoundary>
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
      />
      <AppToast notice={chat.notice} onDismiss={chat.dismissNotice} />
      <AppUpdateController updates={appUpdates} />
    </main>
  );
}
