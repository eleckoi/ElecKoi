import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PluginListPanel } from '../../src/app/windows/shell/components/PluginCenter.jsx';
import { PresetProvider, PresetListPanel } from '../../src/modules/presets/components/PresetPanel.jsx';
import { ModelProviderSidebar } from '../../src/modules/models/components/ModelProviderSidebar.jsx';
import { ConversationList } from '../../src/modules/chat/components/ConversationList.jsx';
import { DisplayPreferencesProvider } from '../../src/modules/settings/model/DisplayPreferencesContext.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/styles/base.css';
import '../../src/ui/styles/avatar.css';
import '../../src/modules/persona/styles/character-list.css';
import '../../src/modules/presets/styles/preset-panel.css';
import '../../src/modules/models/styles/model-config.css';
import '../../src/modules/chat/styles/conversation-list.css';
import '../../src/app/windows/styles/dark-theme.css';

const kind = new URLSearchParams(location.search).get('kind');
const noop = () => {};
const items = Array.from({ length: new URLSearchParams(location.search).has('short') ? 2 : 90 }, (_, n) => ({ id: `synthetic-${n}`, name: `合成条目 ${n + 1}` }));
const catalog = { groups: [{ id: 'a', name: '合成分组甲', purpose: 'roleplay' }], activePresetIds: { roleplay: items[0].id },
  presets: items.map(item => ({ ...item, purpose: 'roleplay', libraryGroupId: 'a', profile: { authorName: '', usageInstructions: '', authorAvatarPath: '' } })) };
const catalogSnapshot = { status: 'ready', catalog, error: '' };
const catalogModel = { subscribe: () => noop, getSnapshot: () => catalogSnapshot, refresh: async () => catalog, adopt: noop };
const preferencesSnapshot = { status: 'ready', ui: { list_collapse_state: {
  presets: { '全部预设': true, a: true }, plugins: { official: true, eleckoi: true, installed: true },
} } };
const preferences = { subscribe: () => noop, getSnapshot: () => preferencesSnapshot, updateUi: async () => {} };
const pluginEntries = items.map((item, n) => ({ ...item, kind: 'plugin', group: n < 45 ? 'official' : 'eleckoi' }));
window.addEventListener('eleckoi:dsh-plugins:request', () => window.dispatchEvent(new CustomEvent('eleckoi:dsh-plugins:state', { detail: { entries: pluginEntries } })));
window.addEventListener('eleckoi:dsh-plugins:select', event => { event.detail.opened = true; });
function Models() {
  const [collapsed, setCollapsed] = useState({ general: true, image: true });
  const [selected, select] = useState(items[0].id);
  return <ModelProviderSidebar providerItems={items.map((item, n) => ({ ...item, label: item.name, searchText: item.name, section: n < 45 ? 'general' : 'image', initials: 'M', summary: '' }))}
    createProviderItems={[]} activeProviderId={selected} collapsedGroups={collapsed} collapseStateReady
    onToggle={id => setCollapsed(value => ({ ...value, [id]: !value[id] }))} onSelect={select} onCreate={noop} />;
}
function Messages() {
  const [keyword, setKeyword] = useState('');
  const [selected, select] = useState('');
  const sessions = items.filter(item => item.name.includes(keyword)).map(item => ({ ...item, character_name: item.name, updated_at: 1800000000000 }));
  return <ConversationList keyword={keyword} setKeyword={setKeyword} sessions={sessions} sessionId={selected} pinnedIds={[]}
    characters={{ items: [] }} artworkMode="avatar" onLoadChat={select} />;
}
createRoot(document.querySelector('#root')).render(<DisplayPreferencesProvider model={preferences}>
  {kind === 'plugins' ? <PluginListPanel onNotify={noop} /> : kind === 'presets' ? <PresetProvider catalogModel={catalogModel}><PresetListPanel /></PresetProvider>
    : kind === 'models' ? <Models /> : <Messages />}
</DisplayPreferencesProvider>);
