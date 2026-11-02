import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { SettingsPanel } from '../../src/modules/settings/components/SettingsPanel.jsx';
import { OfficialMarkdownProvider } from '../../src/ui/messages/OfficialMarkdown.jsx';
import { DEFAULT_CHAT_DISPLAY_PREFERENCES } from '../../../../packages/shared/src/contracts/settings/schemas.ts';
import appIcon from '../../src/assets/eleckoi-app-icon.png';
import { SidebarContent } from '../../src/app/windows/shell/components/SidebarContent.jsx';
import { TitleBar, WindowControls } from '../../src/app/windows/shell/components/TitleBar.jsx';
import { MessageNavIcon, PersonNavIcon, PresetNavIcon, ModelNavIcon } from '../../src/ui/icons/navIcons.jsx';
import '../../src/app/windows/styles/index.css';

const fixture = { calls: [], preferences: null };
window.chatSettingsFixture = fixture;
const companion = { saves: [], failSave: false };
window.settingsCompanionFixture = companion;
function Fixture() {
  const [preferences, setPreferences] = useState(() => structuredClone(DEFAULT_CHAT_DISPLAY_PREFERENCES));
  const [page, setPage] = useState(() => new URLSearchParams(location.search).get('page') || 'chat');
  const [appearance, setAppearance] = useState('system');
  const [artwork, setArtwork] = useState('cover');
  const [persona, setPersona] = useState({ user_name: '访客', user_avatar: appIcon, user_square: appIcon, user_portrait: appIcon,
    assistant_name: '示例角色', assistant_avatar: appIcon, assistant_cover: appIcon });
  Object.assign(companion, { persona, appearance, artwork });
  fixture.preferences = preferences;
  return <OfficialMarkdownProvider component={MarkdownText}>
    <SettingsPanel settingsSections={[{id:'plugins',label:'内置插件'}]}
      renderSettingsSection={() => <header className="app-settings-heading"><h1>内置插件</h1></header>}
      activePage={page} persona={persona} appearanceMode={appearance} onAppearanceModeChange={setAppearance}
      sidebarCharacterArtwork={artwork} onSidebarCharacterArtworkChange={setArtwork}
      onUpdateUserProfile={async ({ name, avatars }) => {
        companion.saves.push({ name, avatars });
        if (companion.failSave) throw new Error('合成保存失败');
        const saved = { ...persona, user_name: name, user_avatar: avatars.circle, user_square: avatars.square, user_portrait: avatars.portrait };
        setPersona(saved); return saved;
      }}
      chatDisplay={preferences} onChatDisplayChange={next => { fixture.calls.push(next); setPreferences(next); }}
      onPageChange={setPage} renderLayout={({ sidePanel, mainPanel }) => new URLSearchParams(location.search).has('shell') ?
        <main id="eleckoi-root" className="qq-shell main-window-shell section-settings" style={{ '--side-panel-width': '328px', '--rightbar-track-width': '0px' }}>
          <SidebarContent activeSection="settings" collapsed={false} onCollapse={() => {}} onOpenSettings={() => {}}
            onOpenProfile={() => {}} onSectionChange={() => {}} sidePanel={sidePanel}
            navigationItems={['messages', 'characters', 'presets', 'models'].map(id => ({ id, label: { messages: '消息', characters: '角色', presets: '预设', models: '模型' }[id], productIcon: true }))}
            renderSidebarSlot={(slot, props, filter) => slot === 'sidebar.panellist' ?
              ({ messages: <MessageNavIcon />, characters: <PersonNavIcon />, presets: <PresetNavIcon />, models: <ModelNavIcon /> }[filter.only]) : props.content} />
          <section className="main-panel-shell"><TitleBar splitSurface showWindowControls={false} /><div className="main-panel-content">{mainPanel}</div></section>
          <div className="main-window-controls"><WindowControls /></div>
        </main> : <main id="eleckoi-root" className="settings-browser-fixture">
        {new URLSearchParams(location.search).has('sidebar') && sidePanel}{mainPanel}
      </main>} />
  </OfficialMarkdownProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
