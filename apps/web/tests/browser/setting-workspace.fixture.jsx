import { EditorView } from '@codemirror/view';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterEditorWindow } from '../../src/app/windows/CharacterEditorWindow.jsx';
import { createEntryDraft, createGroupDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/shell/styles/titlebar.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/ui/styles/editor-sidebar.css';
import '../../src/modules/persona/styles/character-editor.css';
import '../../src/modules/presets/styles/preset-panel.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';

installBrowserIconSprite();
const entry = (id, title, extra = {}) => ({ ...createEntryDraft('', 1, []), id, title, content: '# 合成设定\n\n这是用于界面验证的合成正文。', enabled: true, position: 'instructions', ...extra });
const groups = [{ ...createGroupDraft('', 1, new Set()), id: 'characters', name: '角色设定' }, { ...createGroupDraft('', 2, new Set()), id: 'world', name: '世界设定' }];
const entries = [entry('persona', '合成人设', { groupId: 'characters', agentReadStrategy: 'required' }), entry('speech', '合成对话', { groupId: 'characters', treeViewOrder: 2, triggerMode: 'always', order: 3, iconId: 'note' }),
  entry('relation', '合成关系', { groupId: 'characters', treeViewOrder: 3, iconId: 'relation', agentSelectionHint: '涉及其他人物时读取。' }),
  entry('worldview', '合成世界', { groupId: 'world', iconId: 'world' }), entry('bookshop', '合成书店', { groupId: 'world', treeViewOrder: 2, iconId: 'place', agentReadStrategy: 'keyword', keywords: ['书店', '雨巷', '打烊'], keywordScanDepth: 3 })];
const version = { id: 'synthetic-version', name: '合成角色', entries, groups, expandedGroupIds: ['characters', 'world'], promptPositions: [], listAllExpanded: false };
let role = { ...version, characterId: 'synthetic-role', activeVersionId: version.id, versions: [structuredClone(version)] };
role.versions.push({ ...structuredClone(role.versions[0]), id: 'alternate', name: '合成版本', entries: [entry('alternate-entry', '另一版本条目')] });
let globals = { revision: 0, libraries: [{ id: 'global-one', name: '合成共享库', enabled: true, groups: [], entries: [entry('global-entry', '共享条目')], promptPositions: [], expandedGroupIds: [] }] };
window.workspaceCalls = { role: 0, global: 0 }; window.workspaceSaveFails = false;
const roleModel = { getSnapshot: () => ({ status: 'ready', value: role }), read: async () => role, subscribe: () => () => {},
  save: async (_id, value) => { window.workspaceCalls.role++; if (window.workspaceSaveFails) throw Error('合成保存失败'); role = structuredClone(value); return role; },
  saveViewState: async () => [], listCharacters: async () => ({ items: [{ id: 'synthetic-source', name: '合成来源角色' }] }), readUntracked: async () => role };
const globalModel = { getSnapshot: () => ({ status: 'ready', value: globals }), read: async () => globals, subscribe: () => () => {},
  save: async value => { window.workspaceCalls.global++; globals = structuredClone({ ...value, revision: globals.revision + 1 }); return globals; } };
window.workspaceSaved = () => ({ role, globals });
const q = new URLSearchParams(location.search), theme = q.get('theme') || 'light';
window.editorViewFor = label => EditorView.findFromDOM(document.querySelector(`[role="textbox"][aria-label="${label}"]`));
if (q.has('long')) {
  const text = q.get('long') === 'single' ? '超长行内容'.repeat(250000) : Array.from({ length: 100000 }, (_, i) => `${i} 创作内容，保留完整文字。\n`).join('');
  role.entries[0].content = text; role.versions[0].entries[0].content = text;
}
document.documentElement.dataset.theme = theme; document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark'); document.documentElement.style.colorScheme = theme;
const catalog = { refresh: async () => ({ items: [{ id: 'synthetic-role', name: '合成角色', persona: {} }] }) };
createRoot(document.getElementById('root')).render(<div id="eleckoi-root"><CharacterEditorWindow
  embeddedCharacterId="synthetic-role" characterCatalog={catalog} characterConfiguration={{ settingLibraries: roleModel, globalSettingLibraries: globalModel }}
  renderHeader={() => <header className="client-titlebar split-surface"><div className="title-spacer" /></header>}
  renderCharacterEditorSection={(section, _owner, fallback) => section === 'lore' ? fallback : <div data-fixture-section={section} />}
/></div>);
