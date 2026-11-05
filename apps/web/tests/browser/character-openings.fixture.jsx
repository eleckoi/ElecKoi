import { createCharacterOpenings, characterOpeningsSchema } from '../../../../packages/shared/src/contracts/characterOpenings/schemas';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterEditorWindow } from '../../src/app/windows/CharacterEditorWindow.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/shell/styles/titlebar.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/modules/persona/styles/character-editor.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';
import '../../src/ui/styles/editor-sidebar.css';
import '../../src/mobile/mobile.css';
import '../../src/mobile/mobile-character-editor.css';

const character = { id: 'synthetic-character', name: '合成角色', persona: {} };
const opening = { ...createEntryDraft('', 0, []), id: 'fixed-opening-assistant', kind: 'opening', title: '开场白', enabled: true,
  defaultOpeningMessageId: 'synthetic-opening', openingMessages: [{ id: 'synthetic-opening', title: '合成主开场白', content: '合成开场正文。'.repeat(200) }] };
const version = { id: 'synthetic-version', name: '合成版本', entries: [{ ...createEntryDraft('', 1, []), id: 'synthetic-setting', title: '合成设定' }], groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: false };
let stored = { ...version, characterId: character.id, activeVersionId: version.id, versions: [version] };
const settings = { getSnapshot: () => ({ status: 'ready', value: stored }), subscribe: () => () => {}, read: async () => stored,
  save: async (_id, draft) => { stored = structuredClone(draft); return stored; } };
let openingStored = characterOpeningsSchema.parse({ ...createCharacterOpenings(character.id), openingMessages: opening.openingMessages, defaultOpeningMessageId: opening.defaultOpeningMessageId });
const openings = { getSnapshot: () => ({ status: 'ready', value: openingStored }), subscribe: () => () => {}, read: async () => openingStored,
  save: async (_id, draft) => { openingStored = characterOpeningsSchema.parse(draft); window.syntheticSaveCount++; return openingStored; } };
const variables = { getSnapshot: () => ({ status: 'ready', value: { versions: [{ id: 'synthetic-variables', name: '合成变量版本' }] } }),
  subscribe: () => () => {}, read: async () => {} };
window.syntheticSaveCount = 0;
const compact = new URLSearchParams(location.search).has('compact');
createRoot(document.getElementById('root')).render(<div className={compact ? 'mobile-shell' : ''} style={{ height: '100vh' }}><div className={compact ? 'mobile-character-editor' : ''} style={{ height: '100vh' }}>
  <CharacterEditorWindow compact={compact} embeddedCharacterId={character.id} characterCatalog={{ refresh: async () => ({ items: [character] }) }}
    characterConfiguration={{ settingLibraries: settings, openings, variables }}
    renderHeader={({ dirty, saving, save }) => <header style={{ height: 40, gridColumn: '1 / -1', padding: 10, display: 'flex', justifyContent: 'space-between' }}>
      合成角色编辑器
      {compact && <button className="setting-library-save-button" disabled={!dirty || saving} onClick={save}>{saving ? '保存中…' : '保存'}</button>}
    </header>} />
</div></div>);
