import React from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { CharacterEditorWindow } from '../../src/app/windows/CharacterEditorWindow.jsx';
import { initialLibrary } from '../helpers/editorWorkspaceSamples.js';
import { editorVersionsFixture, withLibraryVersions } from '../helpers/editorLibraryVersions.js';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/shell/styles/titlebar.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/ui/styles/editor-sidebar.css';
import '../../src/modules/persona/styles/character-editor.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';

installBrowserIconSprite();
const q = new URLSearchParams(location.search), theme = q.get('theme') || 'light', kind = q.get('kind') || 'regex';
document.documentElement.dataset.theme = theme; document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark'); document.documentElement.style.colorScheme = theme;
const owner = 'design-character', a = initialLibrary('regex', 'character'), b = initialLibrary('regex', 'global');
let collection = { globalRules: b.rules, characterRules: a.rules, agentPresetRules: [], globalEnabled: b.enabled, characterEnabled: a.enabled, versions: [], activeVersionId: '', revision: 0, ownerRevision: 0 };
window.workspaceCalls = 0; window.workspaceFails = false;
window.workspaceSaved = () => kind === 'regex' ? collection : libraries;
const regexEditor = { getSnapshot: () => ({ status: 'ready', value: collection }), subscribe: () => () => {}, read: async () => collection,
  save: async value => { window.workspaceCalls++; if (window.workspaceFails) throw Error('合成保存失败'); collection = structuredClone({ ...value, revision: value.revision + 1 }); return collection; } };
regexEditor.versions = editorVersionsFixture('regex', () => regexEditor.read(), async values => [await regexEditor.save(values[0])]);
const libraries = Object.fromEntries(['global', 'character'].map(scope => [scope, { ...initialLibrary('scripts', scope), scope, ownerId: scope === 'global' ? '' : owner, revision: 0 }]));
if (q.has('long')) {
  const text = Array.from({ length: 100000 }, (_, i) => `// ${i} 创作内容，保留完整文字。\n`).join('');
  libraries.character.trees[0].scripts[0].content = text; a.rules[0].replacement = text;
}
const scriptService = withLibraryVersions({ read: async scope => structuredClone(libraries[scope]), subscribe: () => () => {}, subscribeChanges: () => () => {}, openDirectory: async () => { window.openDirectoryCalls = (window.openDirectoryCalls || 0) + 1; },
  saveAll: async values => { window.workspaceCalls++; if (window.workspaceFails) throw Error('合成保存失败'); return values.map(value => libraries[value.scope] = structuredClone({ ...value, revision: value.revision + 1 })); } }, 'scripts');
window.editorViewFor = label => EditorView.findFromDOM(document.querySelector(`[role="textbox"][aria-label="${label}"]`));
const catalog = { refresh: async () => ({ items: [{ id: owner, name: '合成角色', persona: {} }] }) };
createRoot(document.getElementById('root')).render(<div id="eleckoi-root"><CharacterEditorWindow embeddedCharacterId={owner} characterCatalog={catalog}
  characterConfiguration={{ regexRules: { editor: () => regexEditor, test: async (text, rule, _target, _options, signal) => { window.regexTestSignal = signal; if (signal.aborted) throw Error('aborted'); const match = rule.pattern.match(/^\/(.*)\/([a-z]*)$/s); return { output: text.replace(new RegExp(match[1], match[2]), rule.replacement), validationMessage: '' }; } }, scripts: scriptService }}
  renderHeader={() => <header className="client-titlebar split-surface"><div className="title-spacer" /></header>}
  renderCharacterEditorSection={(section, _owner, fallback) => ['regex', 'scripts'].includes(section) ? fallback : <div data-fixture-section={section} />}
/></div>);
