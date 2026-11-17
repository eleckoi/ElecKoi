import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConversationList } from '../../src/modules/chat/components/ConversationList.jsx';
import { MobileMessageList } from '../../src/mobile/MobileMessagesPage.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';
const noop = () => {};
const sessions = Array.from({ length: 10001 }, (_, index) => ({ id: `chat-${index}`, character_id: `character-${index}`, character_name: `Sample ${index}`, summary: `Summary ${index}`, updated_at: '2026-11-17T00:00:00Z' }));
const model = { scrollPositions: new Map() };
function Fixture() {
  const [platform, setPlatform] = useState('mobile'), [visible, setVisible] = useState(true), [cover, setCover] = useState(true);
  window.listProbe = { setPlatform, setVisible, setCover, actions: window.listProbe?.actions || [], model };
  const action = name => item => window.listProbe.actions.push([name, item?.id || item]);
  return <MainPageContext.Provider value={model}><main style={{ height: '100vh', width: '100%', display: 'flex', flexDirection: 'column' }}>
    {visible && (platform === 'mobile' ? <MobileMessageList sessions={sessions} characters={new Map()} pinnedIds={['chat-0']} artworkMode={cover ? 'cover' : 'avatar'} onOpen={action('open')} onMenu={action('menu')} onPin={action('pin')} onHide={action('hide')} />
      : <ConversationList keyword="" setKeyword={noop} sessions={sessions} sessionId="chat-0" pinnedIds={['chat-0']} characters={{ items: [], groups: [] }} artworkMode={cover ? 'cover' : 'avatar'} onLoadChat={action('open')} onTogglePinChat={action('pin')} onOpenChatWindow={action('window')} onHideChat={action('hide')} />)}
  </main></MainPageContext.Provider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
