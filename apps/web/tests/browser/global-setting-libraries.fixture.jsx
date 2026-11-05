import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingLibraryPanel } from '../../src/modules/settingLibraries/components/SettingLibraryPanel.jsx';
import { createEntryDraft, createGroupDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';
import '../../src/ui/styles/editor-sidebar.css';
import '../../src/mobile/mobile.css';
import '../../src/mobile/mobile-character-editor.css';

const entry = (id, title, content, strategy = 'normal') => ({ ...createEntryDraft('', 1, []), id, title, content, enabled: true, agentReadStrategy: strategy });
const roleEntry = entry('synthetic-role-entry', '角色背景', '合成角色背景正文');
const version = { id: 'synthetic-role-version', name: '角色设定', entries: [roleEntry], groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: false };
let role = { ...version, characterId: 'synthetic-role', activeVersionId: version.id, versions: [version] };
let globals = { revision: 0, libraries: [
  { id: 'synthetic-global-one', name: '通用叙事', enabled: true, entries: [entry('synthetic-setting-1', '叙事视角', '合成叙事要求：采用第三人称，保持场景连续。', 'required'),
    entry('synthetic-setting-2', '环境描写', '合成环境描写说明'), entry('synthetic-setting-3', '节奏控制', '合成节奏说明')], groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: false, createdAt: '', updatedAt: '' },
  { id: 'synthetic-global-two', name: '通用规则', enabled: true, entries: [entry('synthetic-setting-1', '行动规则', '合成行动规则'), entry('synthetic-setting-2', '物品规则', '合成物品规则')], groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: false, createdAt: '', updatedAt: '' },
] };
window.syntheticGlobals = () => globals;
const model = { getSnapshot: () => ({ status: 'ready', value: role }), subscribe: () => () => {}, read: async () => role,
  save: async (_id, value) => { role = value; return role; }, saveViewState: async () => [], listCharacters: async () => ({ items: [] }) };
const globalModel = { getSnapshot: () => ({ status: 'ready', value: globals }), subscribe: () => () => {}, read: async () => globals,
  save: async value => { globals = { ...value, revision: value.revision + 1 }; return globals; } };
const compact = new URLSearchParams(window.location.search).get('mobile') === 'true';
document.documentElement.dataset.eleckoiMobile = String(compact);
const panel = <EditorPresentationContext.Provider value={{ compact }}><SettingLibraryPanel characterId="synthetic-role" settingLibraries={model} globalSettingLibraries={globalModel} /></EditorPresentationContext.Provider>;
createRoot(document.getElementById('root')).render(compact ? <div className="mobile-shell"><div className="mobile-character-editor" style={{ marginLeft: 76, height: '100vh' }}>{panel}</div></div> : panel);
