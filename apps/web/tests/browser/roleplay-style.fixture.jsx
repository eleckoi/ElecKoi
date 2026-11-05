import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { ChatPanel } from '../../src/modules/chat/components/ChatPanel.jsx';
import { ChatWallpaperLayer } from '../../src/modules/chat/components/ChatWallpaperLayer.jsx';
import { ChatDisplaySettings } from '../../src/modules/settings/components/ChatDisplaySettings.jsx';
import { MobileSettingsPage } from '../../src/mobile/MobileSettingsPage.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from '../../../../packages/shared/src/contracts/settings/schemas.ts';
import appIcon from '../../src/assets/eleckoi-app-icon.png';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

const noop = () => {};
const persona = { user_name: '你', assistant_name: '鲸鱼娘', user_portrait: appIcon, assistant_cover: appIcon };
const messages = Array.from({ length: 20 }, (_, index) => ({ id: `style-${index}`, role: index % 2 ? 'user' : 'assistant',
  content: index === 1 ? '“好啊。”' : '雨停在放学前，窗边的光落进教室。\n\n“今天的故事，要不要从你来写第一句？”',
  status: 'complete', runtimeSessionId: 'style-runtime', sessionEventSeq: index + 1,
  renderKey: `dsh-reply-style-runtime-${index + 1}`, created_at: '2026-11-04T16:30:00+08:00' }));
function Fixture() {
  const [preferences, update] = useState(structuredClone(DEFAULT_CHAT_DISPLAY_PREFERENCES));
  const [view, setView] = useState('chat');
  const [page, setPage] = useState('chat:style');
  const [activeView, selectView] = useState('chat');
  const [mobileChat, setMobileChat] = useState(false);
  const [wallpaper, setWallpaper] = useState({ image: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><path fill="#283c50" d="M0 0h1600v1000H0z"/></svg>')}`, opacity: .72, blur: 2, scrim: .5 });
  const scrollRef = useRef(null), scrollPositions = useRef(new Map());
  window.roleplayStyleFixture = { preferences, update, setView, setPage, selectView, setMobileChat, setWallpaper, wallpaper };
  const renderSlot = (slot, owner) => {
    if (slot === 'eleckoi.roleplay.chat') return <div data-chat-view=""><div><div data-chat-scroll=""><div data-chat-column=""><div data-slot="eleckoi.roleplay.chat.flow">{messages.map((message, index) => <div data-chat-flow-key={message.id} key={message.id}>{owner.renderChatNode({
      node: index % 2 ? { kind: 'user', key: message.id, data: { seq: message.sessionEventSeq, content: [{ type: 'text', text: message.content }] } }
        : { kind: 'turn-process', key: message.id, location: { turn: { turn: index + 1 } } },
    })}</div>)}</div></div></div></div></div>;
    if (slot === 'eleckoi.roleplay.conversation.composer.bar') return <div className="inputbar" style={{ margin: '12px auto 8px', width: 'min(680px, calc(100% - 32px))' }}><div className="composer-card" data-composer-card=""><textarea aria-label="合成输入框" placeholder="输入消息" /></div></div>;
    return null;
  };
  const model = { settingsPage: page, setSettingsPage: setPage, settingsSections: [],
    appearance: { chatDisplay: preferences, changeChatDisplay: update }, chat: { persona },
    goBack: () => false, registerBackHandler: () => noop, guardRef: { current: null }, scrollPositions: scrollPositions.current };
  const panel = <ChatPanel hasActiveChat hasCharacters currentTitle="鲸鱼娘" persona={persona}
    chatDisplay={preferences} messages={messages} conversationId="style-conversation" runtimeSessionId="style-runtime" input="" setInput={noop} modelConfigs={[]} scrollRef={scrollRef}
    dshConversation={{ activeView, selectView, tabs: [{ id: 'chat', label: '对话' }, { id: 'gallery', label: '画廊' }], renderView: () => <p>合成画廊</p> }}
    renderRoleplaySlot={renderSlot} />;
  return <OfficialMarkdownProvider component={MarkdownText}>
    {view === 'settings' ? <div className="app-settings-content"><ChatDisplaySettings persona={persona} chatDisplay={preferences} onChatDisplayChange={update} /></div>
      : view === 'mobile' ? <div className="mobile-shell"><MainPageContext.Provider value={model}><MobileSettingsPage /></MainPageContext.Provider></div>
        : <div className={`qq-shell has-chat-wallpaper style-chat-fixture${mobileChat ? ' mobile-conversation-page' : ' main-window-shell'}`} style={{ '--rail-column-width': '0px', '--side-panel-width': '0px' }}><ChatWallpaperLayer wallpaper={wallpaper} />
          {mobileChat ? panel : <section className="main-panel-shell"><div className="client-titlebar" /><div className="main-panel-content">{panel}</div></section>}</div>}
  </OfficialMarkdownProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
