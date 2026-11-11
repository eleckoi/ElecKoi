import React from 'react';
import { createRoot } from 'react-dom/client';
import { SidebarRail } from '../../src/app/windows/shell/components/SidebarRail.jsx';
import { HistoryModal } from '../../src/modules/chat/components/HistoryModal.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

installBrowserIconSprite();
document.documentElement.dataset.eleckoiMobile = 'true';
const query = new URLSearchParams(location.search), noop = () => {};
const avatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#7890a0"/><circle cx="20" cy="16" r="7" fill="#eee"/><path d="M7 40v-8a13 13 0 0 1 26 0v8" fill="#eee"/></svg>');
createRoot(document.querySelector('#root')).render(
  <MainPageContext.Provider value={{ registerBackHandler: () => noop }}>
    <main className="mobile-shell" style={{ height: '100dvh' }}>
      {query.has('drawer') ? <div className="mobile-drawer" style={{ transform: 'none' }}>
        <SidebarRail expanded compactAccount persona={{ user_name: '合成用户', user_avatar: avatar }}
          onOpenProfile={() => { window.profileOpened = true; }} onOpenSettings={noop} onCollapse={noop} />
      </div> : <HistoryModal open sessions={[{ id: 'synthetic-session', character_id: 'synthetic-character', character_name: '合成角色', summary: '合成聊天记录', updated_at: '2026-11-11T10:00:00Z' }]}
        sessionId="synthetic-session" onClose={noop} onLoadChat={noop} onDeleteChat={() => { window.historyDeleted = true; }} />}
    </main>
  </MainPageContext.Provider>,
);
