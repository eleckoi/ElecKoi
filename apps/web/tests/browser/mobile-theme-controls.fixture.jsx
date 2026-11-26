import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SidebarRail } from '../../src/app/windows/shell/components/SidebarRail.jsx';
import { HistoryModal } from '../../src/modules/chat/components/HistoryModal.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { DisplayPreferencesProvider } from '../../src/ui/state/DisplayPreferencesContext.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';

const query = new URLSearchParams(location.search), noop = () => {};
installBrowserIconSprite();
if (!query.has('desktop')) document.documentElement.dataset.eleckoiMobile = 'true';
const avatar = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#7890a0"/><circle cx="20" cy="16" r="7" fill="#eee"/><path d="M7 40v-8a13 13 0 0 1 26 0v8" fill="#eee"/></svg>');
const oldPreference = { status: 'ready', ui: { history_save_mode: 'recent10' } };
const displayPreferences = { getSnapshot: () => oldPreference, subscribe: () => noop };

function HistoryFixture() {
  const [opened, setOpened] = useState('a');
  const sessions = ['a', 'b'].flatMap(character => Array.from({ length: 12 }, (_, index) => ({
    id: `${character}-${index}`, character_id: character, character_name: `合成角色 ${character}`,
    summary: `合成记录 ${character}-${index}`, updated_at: new Date(Date.UTC(2026, 10, index + 1)).toISOString(),
  })));
  return <main onClick={event => { if (event.target.type === 'file') { event.preventDefault(); window.historyChooserOpened = true; } }}>
    <button type="button" id="open-other-history" onClick={() => setOpened('b')}>打开另一个角色</button>
    <DisplayPreferencesProvider model={displayPreferences}>
      <HistoryModal open={Boolean(opened)} sessions={sessions} sessionId={`${opened}-0`} onClose={() => setOpened('')}
        onLoadChat={id => { window.historyLoaded = id; }} onDeleteChat={() => { window.historyDeleted = true; }}
        conversationModel={{ importArchive: async (id, json) => { window.historyImport = { id, json }; return 'imported-session'; } }} />
    </DisplayPreferencesProvider>
  </main>;
}

createRoot(document.querySelector('#root')).render(
  <MainPageContext.Provider value={{ registerBackHandler: () => noop }}>
    {query.has('drawer') ? <main className="mobile-shell" style={{ height: '100dvh' }}>
      <div className="mobile-drawer" style={{ transform: 'none' }}>
        <SidebarRail expanded compactAccount persona={{ user_name: '合成用户', user_avatar: avatar }}
          onOpenProfile={() => { window.profileOpened = true; }} onOpenSettings={noop} onCollapse={noop} />
      </div>
    </main> : <HistoryFixture />}
  </MainPageContext.Provider>,
);
