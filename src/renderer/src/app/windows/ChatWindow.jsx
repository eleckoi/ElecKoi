import { useEffect, useState } from "react";
import { ChatBackgroundModal, ChatPanel, ChatWallpaperLayer, HistoryModal } from "../../modules/chat/index.js";
import { resolveChatWallpaper } from "../../modules/appearance/index.js";
import { AppToast } from "../../ui/ui/AppToast.jsx";
import { showCurrentWindow } from "../services/windowControls.js";
import { useChatClient } from "../hooks/useChatClient.js";
import { useWindowAppearance } from "../hooks/useWindowAppearance.js";
import { TitleBar } from "./shell/components/TitleBar.jsx";

const CHAT_WINDOW_STYLE = {
  "--side-panel-width": "0px",
};

export function ChatWindow() {
  const chat = useChatClient();
  const appearance = useWindowAppearance({ notify: chat.notify });
  const [chatBackgroundOpen, setChatBackgroundOpen] = useState(false);

  useEffect(() => {
    showCurrentWindow().catch(() => {});
  }, []);

  useEffect(() => {
    if (chat.currentTitle) {
      document.title = `${chat.currentTitle} - ElecKoi`;
    }
  }, [chat.currentTitle]);

  const chatWallpaper = resolveChatWallpaper({
    character: chat.chatBackgroundCharacter,
    persona: chat.chatPersona,
    globalWallpaper: appearance.globalChatWallpaper,
  });
  const showChatWallpaper = Boolean(chat.sessionId || chat.chatCharacter?.character_id) && Boolean(chatWallpaper.image);

  return (
    <main className={`qq-shell qq-chat-window-shell${showChatWallpaper ? " has-chat-wallpaper" : ""}`} style={CHAT_WINDOW_STYLE}>
      {showChatWallpaper ? <ChatWallpaperLayer wallpaper={chatWallpaper} /> : null}
      <TitleBar />
      <section className="chat-window-body">
        <ChatPanel
          hasActiveChat={Boolean(chat.sessionId || chat.chatCharacter?.character_id)}
          hasCharacters={Boolean(chat.characters?.items?.length)}
          currentTitle={chat.currentTitle}
          characterId={chat.chatCharacter?.character_id || ""}
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
          onOpenChatBackground={() => {
            setChatBackgroundOpen(true);
          }}
          onRegenerate={chat.regenerateReply}
          onEditMessage={(message, replacementMessage) => chat.regenerateReply({
            targetMessageId: message.id,
            replacementMessage,
          })}
          onEditOpening={chat.editOpening}
          onSelectOpening={chat.selectOpening}
          onGoCharacterSettings={() => {}}
          scrollRef={chat.scrollRef}
          scrollRequest={chat.scrollRequest}
          hasOlderMessages={chat.hasOlderMessages}
          isLoadingOlderMessages={chat.isLoadingOlderMessages}
          onLoadOlderMessages={chat.loadOlderMessages}
          chatDisplay={appearance.chatDisplay}
          composerStyle={appearance.composerStyle}
        />
      </section>
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
      <AppToast notice={chat.notice} />
    </main>
  );
}
