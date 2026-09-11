import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatBackgroundModal, ChatPanel, ChatWallpaperLayer, ConversationList, HistoryModal } from "../../modules/chat/index.js";
import { SettingsPanel } from "../../modules/settings/index.js";
import { ModelConfigPanel } from "../../modules/models/index.js";
import { CharacterListPanel, CharacterProfilePanel, openCharacterEditorWindow } from "../../modules/persona/index.js";
import { PresetListPanel, PresetProvider, PresetWorkspace } from "../../modules/presets/index.js";
import { resolveChatWallpaper } from "../../modules/appearance/index.js";
import { useChatClient } from "../hooks/useChatClient.js";
import { useWindowAppearance } from "../hooks/useWindowAppearance.js";
import { AppToast } from "../../ui/ui/AppToast.jsx";
import { UnsavedChangesDialog } from "../../ui/ui/UnsavedChangesDialog.jsx";
import { SidebarRail } from "./shell/components/SidebarRail.jsx";
import { CommunityDialog } from "./shell/components/CommunityDialog.jsx";
import { SidePanelShell } from "./shell/components/SidePanelShell.jsx";
import { SidePanelResizeHandle } from "./shell/components/SidePanelResizeHandle.jsx";
import { TitleBar } from "./shell/components/TitleBar.jsx";
import { useSidePanelLayout } from "./shell/hooks/useSidePanelLayout.js";
import { AppUpdateController, useAppUpdates } from "../../modules/updates/index.js";

export function MainWindow() {
  const chat = useChatClient();
  const appearance = useWindowAppearance({ notify: chat.notify });
  const sidePanelLayout = useSidePanelLayout();
  const appUpdates = useAppUpdates();
  const isCharacterSection = chat.activeSection === "character";
  const [chatBackgroundOpen, setChatBackgroundOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState("chat");
  const [modelConfigDirty, setModelConfigDirty] = useState(false);
  const [pendingSection, setPendingSection] = useState(null);
  const [savingPendingModelChanges, setSavingPendingModelChanges] = useState(false);
  const [presetRequestedTab, setPresetRequestedTab] = useState("");
  const modelConfigPanelRef = useRef(null);
  const presetNavigationGuardRef = useRef(null);

  useEffect(() => {
    document.title = "ElecKoi";
  }, []);

  const changeActiveSection = useCallback((section) => {
    if (chat.activeSection === "presets" && section !== "presets" && presetNavigationGuardRef.current) {
      presetNavigationGuardRef.current(() => chat.setActiveSection(section));
      return;
    }
    if (chat.activeSection === "model" && section !== "model" && modelConfigDirty) {
      setPendingSection(section);
      return;
    }
    chat.setActiveSection(section);
  }, [chat, modelConfigDirty]);

  const discardModelChangesAndLeave = useCallback(() => {
    const section = pendingSection;
    setPendingSection(null);
    setModelConfigDirty(false);
    if (section) chat.setActiveSection(section);
  }, [chat, pendingSection]);

  const saveModelChangesAndLeave = useCallback(async () => {
    if (savingPendingModelChanges) return;
    setSavingPendingModelChanges(true);
    try {
      const saved = await modelConfigPanelRef.current?.save();
      if (!saved) return;
      const section = pendingSection;
      setPendingSection(null);
      setModelConfigDirty(false);
      if (section) chat.setActiveSection(section);
    } finally {
      setSavingPendingModelChanges(false);
    }
  }, [chat, pendingSection, savingPendingModelChanges]);

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

  const characterPanel = (
    <CharacterProfilePanel
      characters={chat.characters}
      selectedCharacterId={chat.selectedCharacterId}
      onSelectCharacter={chat.selectCharacter}
      onStartConversation={chat.openCharacterChat}
      onEditCharacter={openCharacterEditorWindow}
      onCreateFirstCharacter={() => chat.createCharacter()}
    />
  );

  function renderWindowLayout({ sidePanel, mainPanel, overlays = null }) {
    return (
      <>
        <section className="navigation-rail-shell" aria-label="功能导航栏">
          <div className="navigation-rail-title" data-tauri-drag-region />
          <SidebarRail
            activeSection={chat.activeSection}
            profileActive={chat.activeSection === "settings" && settingsPage === "profile"}
            onSectionChange={changeActiveSection}
            onOpenCommunity={() => setCommunityOpen(true)}
            persona={chat.persona}
            onOpenProfile={() => {
              setSettingsPage("profile");
              changeActiveSection("settings");
            }}
            onOpenSettings={() => {
              setSettingsPage("chat");
              changeActiveSection("settings");
            }}
          />
        </section>

        <SidePanelShell collapsed={sidePanelLayout.sidePanelCollapsed} onCollapse={sidePanelLayout.collapseSidePanel}>
          {sidePanel}
        </SidePanelShell>

        <section className="main-panel-shell" aria-label="主功能界面">
          <TitleBar
            splitSurface
            sidePanelCollapsed={sidePanelLayout.sidePanelCollapsed}
            onToggleSidePanel={sidePanelLayout.expandSidePanel}
          />
          <div className="main-panel-content">{mainPanel}</div>
        </section>
        {overlays}
      </>
    );
  }

  let windowLayout;
  if (chat.activeSection === "settings") {
    windowLayout = (
      <SettingsPanel
        activePage={settingsPage}
        onPageChange={setSettingsPage}
        persona={chat.persona}
        onUpdateUserProfile={chat.updateUserProfile}
        chatDisplay={appearance.chatDisplay}
        onChatDisplayChange={appearance.changeChatDisplay}
        appearanceMode={appearance.appearanceMode}
        onAppearanceModeChange={appearance.changeAppearanceMode}
        composerStyle={appearance.composerStyle}
        onComposerStyleChange={appearance.changeComposerStyle}
        sidebarCharacterArtwork={appearance.sidebarCharacterArtwork}
        onSidebarCharacterArtworkChange={appearance.changeSidebarCharacterArtwork}
        appUpdates={appUpdates}
        renderLayout={renderWindowLayout}
      />
    );
  } else if (chat.activeSection === "model") {
    windowLayout = (
      <ModelConfigPanel
        ref={modelConfigPanelRef}
        config={chat.modelConfig}
        configs={chat.modelConfigs}
        providers={chat.meta?.providers || []}
        modelOptionsByKey={chat.modelOptionsByKey}
        onSave={chat.saveModelConfig}
        onDeleteConfig={chat.deleteModelConfig}
        onDeleteProvider={chat.deleteModelProvider}
        onFetchModels={chat.loadModelOptions}
        onProbeModels={chat.probeModelOptions}
        onTestConnection={chat.testModelConnection}
        onNotify={chat.notify}
        onDirtyChange={setModelConfigDirty}
        renderLayout={renderWindowLayout}
      />
    );
  } else if (chat.activeSection === "presets") {
    windowLayout = (
      <PresetProvider navigationGuardRef={presetNavigationGuardRef}>
        {renderWindowLayout({
          sidePanel: <PresetListPanel />,
          mainPanel: <PresetWorkspace
            modelConfigs={chat.chatModelConfigs}
            modelOptionsByKey={chat.modelOptionsByKey}
            onLoadModels={chat.loadModelOptions}
            onSaveModelConfig={chat.saveModelConfig}
            onNotify={chat.notify}
            requestedTab={presetRequestedTab}
            onRequestedTabHandled={() => setPresetRequestedTab("")}
          />,
        })}
      </PresetProvider>
    );
  } else {
    const sidePanel = isCharacterSection ? (
      <CharacterListPanel
        characters={chat.characters}
        activeCharacterId={chat.selectedCharacterId || chat.characters.active_character_id}
        artworkMode={appearance.sidebarCharacterArtwork}
        onSelectCharacter={chat.selectCharacter}
        onOpenCharacterChat={chat.openCharacterChat}
        onSaveCharacterGroups={chat.saveCharacterGroups}
        onImportPreparedCharacters={chat.importPreparedCharacters}
        onCreateCharacter={chat.createCharacter}
        onDeleteCharacters={chat.deleteCharacterIds}
      />
    ) : (
      <ConversationList
        keyword={chat.keyword}
        setKeyword={chat.setKeyword}
        sessions={chat.filteredSessions}
        sessionId={chat.sessionId}
        pinnedIds={chat.pinnedIds}
        characters={chat.characters}
        artworkMode={appearance.sidebarCharacterArtwork}
        onLoadChat={selectConversation}
        onOpenCharacterChat={chat.openCharacterChat}
        onGoCharacterSettings={() => chat.setActiveSection("character")}
        onTogglePinChat={chat.togglePinChat}
        onOpenChatWindow={chat.openChatWindow}
        onRemoveChat={chat.removeChat}
      />
    );
    const mainPanel = isCharacterSection ? (
      characterPanel
    ) : (
      <ChatPanel
        hasActiveChat={Boolean(chat.sessionId || chat.chatCharacter?.character_id)}
        conversationId={chat.sessionId}
        hasCharacters={Boolean(chat.characters?.items?.length)}
        currentTitle={chat.currentTitle}
        persona={chat.chatPersona}
        messages={chat.messages}
        input={chat.input}
        setInput={chat.setInput}
        inputImages={chat.inputImages}
        onAddImages={chat.addInputImages}
        onRemoveImage={chat.removeInputImage}
        isSending={chat.isSending}
        modelConfigs={chat.chatModelConfigs}
        selectedModelConfigId={chat.selectedChatModelConfigId}
        selectedModel={chat.selectedChatModel}
        modelParameters={chat.chatModelParameters}
        modelOptionsByKey={chat.modelOptionsByKey}
        onLoadModelOptions={chat.loadModelOptions}
        onSelectModel={chat.selectChatModel}
        onSaveModelConfig={chat.saveModelConfig}
        onNotify={chat.notify}
        onSend={chat.sendMessage}
        onStop={chat.stopSend}
        onCreateChat={chat.createChat}
        onOpenHistory={chat.openHistory}
        onOpenChatBackground={() => setChatBackgroundOpen(true)}
        onOpenPresetTools={() => {
          setPresetRequestedTab("tools");
          changeActiveSection("presets");
        }}
        onRegenerate={chat.regenerateReply}
         onEditMessage={(message, replacementMessage) => chat.regenerateReply({
          targetMessageId: message.id,
          replacementMessage,
         })}
         onEditOpening={chat.editOpening}
        onSelectOpening={chat.selectOpening}
        onGoCharacterSettings={() => chat.setActiveSection("character")}
        scrollRef={chat.scrollRef}
        scrollRequest={chat.scrollRequest}
        hasOlderMessages={chat.hasOlderMessages}
        isLoadingOlderMessages={chat.isLoadingOlderMessages}
        onLoadOlderMessages={chat.loadOlderMessages}
        chatDisplay={appearance.chatDisplay}
        composerStyle={appearance.composerStyle}
      />
    );
    windowLayout = renderWindowLayout({ sidePanel, mainPanel });
  }

  return (
    <main
      ref={sidePanelLayout.shellRef}
      className={`qq-shell main-window-shell section-${chat.activeSection}${showChatWallpaper ? " has-chat-wallpaper" : ""}${sidePanelLayout.sidePanelCollapsed ? " side-panel-collapsed" : ""}`}
      style={sidePanelLayout.shellStyle}
      data-side-panel-dragging={sidePanelLayout.sidePanelDragging || undefined}
    >
      {showChatWallpaper ? <ChatWallpaperLayer wallpaper={chatWallpaper} /> : null}
      {windowLayout}
      {!sidePanelLayout.sidePanelCollapsed ? (
        <SidePanelResizeHandle
          onStart={sidePanelLayout.startSidePanelResize}
          onDrag={sidePanelLayout.resizeSidePanel}
          onEnd={sidePanelLayout.endSidePanelResize}
        />
      ) : null}
      <HistoryModal
        open={chat.historyOpen}
        sessions={chat.sessions}
        sessionId={chat.sessionId}
        chatCharacter={chat.chatCharacter}
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
      <UnsavedChangesDialog
        open={Boolean(pendingSection)}
        title="保存修改？"
        description="离开前是否保存当前模型配置的修改？"
        saving={savingPendingModelChanges}
        onCancel={() => setPendingSection(null)}
        onSave={saveModelChangesAndLeave}
        onDiscard={discardModelChangesAndLeave}
      />
      <AppToast notice={chat.notice} />
      <AppUpdateController updates={appUpdates} />
    </main>
  );
}
