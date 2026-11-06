import { useEffect, useState } from "react";
import { ChatBackgroundModal, ChatWallpaperLayer, HistoryModal } from "../../modules/chat/index.js";
import { RoleplayPanel } from "./RoleplayPanel.jsx";
import { resolveChatWallpaper } from "../../modules/appearance/index.js";
import { AppToast } from "../../ui/ui/AppToast.jsx";
import { BugReportDialog } from "./shell/components/BugReportDialog.jsx";
import { useReportProblem } from "./shell/hooks/useReportProblem.js";
import { showCurrentWindow } from "../services/windowControls.js";
import { useChatClient } from "../hooks/useChatClient.js";
import { useWindowAppearance } from "../hooks/useWindowAppearance.js";
import { TitleBar } from "./shell/components/TitleBar.jsx";
import { MainPageContext } from "./MainPageContext.jsx";
import { subscribeAppFailure } from "../../utils/appFailureOutlet.js";
import { bestEffort } from "../../utils/swallowedFailure.js";

const CHAT_WINDOW_STYLE = {
  "--side-panel-width": "0px",
};

export function ChatWindow({ conversations, characters, characterConfiguration, models, persona, presets, renderRoleplay }) {
  const chat = useChatClient({ conversations, characters, models, persona });
  const appearance = useWindowAppearance({ notify: chat.notify });
  const [chatBackgroundOpen, setChatBackgroundOpen] = useState(false);
  // 独立聊天窗口里的错误同样要能一键报告（ADR 0042 决定 17）：报告对话框挂在这个窗口里。
  const reportProblem = useReportProblem({ onDismissNotice: chat.dismissNotice });

  useEffect(() => {
    showCurrentWindow().catch(bestEffort);
  }, []);

  useEffect(() => {
    if (chat.currentTitle) {
      document.title = `${chat.currentTitle} - ElecKoi`;
    }
  }, [chat.currentTitle]);

  // 应用级失败不留在角落：功能内失败面把这类失败送到窗口级错误对话框（码与详情仍然可见）。
  useEffect(() => subscribeAppFailure((resolved) => {
    chat.notify("error", resolved.text, resolved);
  }), [chat.notify]);

  const chatWallpaper = resolveChatWallpaper({
    character: chat.chatBackgroundCharacter,
    persona: chat.chatPersona,
    globalWallpaper: appearance.globalChatWallpaper,
  });
  const showChatWallpaper = Boolean(chat.sessionId || chat.chatCharacter?.character_id) && Boolean(chatWallpaper.image);

  const pageView = { chat, conversations, characters, characterConfiguration, models, presets };

  return <MainPageContext.Provider value={pageView}>
    <main className={`qq-shell qq-chat-window-shell${showChatWallpaper ? " has-chat-wallpaper" : ""}`} style={CHAT_WINDOW_STYLE}>
      {showChatWallpaper ? <ChatWallpaperLayer wallpaper={chatWallpaper} /> : null}
      <TitleBar />
      <section className="chat-window-body">
        <RoleplayPanel
          renderRoleplay={renderRoleplay}
          hasActiveChat={Boolean(chat.sessionId || chat.chatCharacter?.character_id)}
          conversationId={chat.sessionId}
          presetCatalog={presets}
          isSwitchingChat={chat.isSwitchingChat}
          conversationTransitionRevision={chat.conversationTransitionRevision}
          runtimeSessionId={chat.runtimeSessionId}
          hasCharacters={Boolean(chat.characters?.items?.length)}
          currentTitle={chat.currentTitle}
          characterId={chat.chatCharacter?.character_id || ""}
          persona={chat.chatPersona}
          messages={chat.messages}
          input={chat.input}
          setInput={chat.setInput}
          inputImages={chat.inputImages}
          inputFiles={chat.inputFiles}
          filesUploading={chat.filesUploading}
          fileUploadProgress={chat.fileUploadProgress}
          onAddImages={chat.addInputImages}
          onAddFiles={chat.addInputFiles}
          onRemoveImage={chat.removeInputImage}
          onRemoveFile={chat.removeInputFile}
          isSending={chat.isSending}
          modelConfigs={chat.chatModelConfigs}
          selectedModelConfigId={chat.selectedChatModelConfigId}
          selectedModel={chat.selectedChatModel}
          modelOptionsByKey={chat.modelOptionsByKey}
          onLoadModelOptions={chat.loadModelOptions}
          onSelectModel={chat.selectChatModel}
          onNotify={chat.notify}
          onSend={chat.sendMessage}
          onStop={chat.stopSend}
          onCreateChat={chat.createChat}
          onOpenHistory={chat.openHistory}
          onOpenChatBackground={() => {
            setChatBackgroundOpen(true);
          }}
          onRegenerate={chat.regenerateReply}
          onDeleteMessages={chat.deleteMessagesFrom}
          onEditMessage={chat.editMessage}
          onEditOpening={chat.editOpening}
          onSelectOpening={chat.selectOpening}
          onGoCharacterSettings={() => {}}
          scrollRef={chat.scrollRef}
          scrollRequest={chat.scrollRequest}
          hasOlderMessages={chat.hasOlderMessages}
          isLoadingOlderMessages={chat.isLoadingOlderMessages}
          onLoadOlderMessages={chat.loadOlderMessages}
          chatDisplay={appearance.chatDisplay}
        />
      </section>
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
    </main>
  </MainPageContext.Provider>;
}
