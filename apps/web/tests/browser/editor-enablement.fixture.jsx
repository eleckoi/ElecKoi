import { EditorView } from '@codemirror/view';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RegexRulesPanel } from '../../src/modules/regex/components/RegexRulesPanel.jsx';
import { ScriptLibrariesPanel } from '../../src/modules/scripts/components/ScriptLibrariesPanel.jsx';
import { createScriptItem } from '../../src/modules/scripts/model/scriptEditing.js';
import { createRegexRule } from '../../src/modules/regex/model/regexRulesEditing.js';
import { withLibraryVersions } from '../helpers/editorLibraryVersions.js';
import { withRegexEditor } from '../helpers/regexEditorModel.js';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/ui/styles/editor-sidebar.css';
import '../../src/modules/scripts/styles/script-libraries.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';

let saveCount = 0;
const saved = () => { document.body.dataset.saveCount = String(++saveCount); };
function service(kind, ownerScope) {
  const ownerId = `synthetic-${ownerScope}`, owners = { global: '', [ownerScope]: ownerId };
  if (kind === 'regex') {
    let stored = { globalRules: [], characterRules: [], agentPresetRules: [], versions: [], activeVersionId: '', revision: 0,
      globalEnabled: true, [ownerScope === 'preset' ? 'agentPresetEnabled' : 'characterEnabled']: true };
    for (const scope of Object.keys(owners)) {
      stored = createRegexRule(stored, scope === 'global' ? 'Global' : scope === 'preset' ? 'AgentPreset' : 'Character').collection;
      const key = scope === 'global' ? 'globalRules' : scope === 'preset' ? 'agentPresetRules' : 'characterRules';
      stored[key][0] = { ...stored[key][0], id: `synthetic-${scope}`, name: '合成规则', enabled: true };
    }
    return withRegexEditor({ getSnapshot: () => ({ status: 'ready', value: stored }), subscribe: () => () => {}, read: async () => stored,
      save: async (_ownerId, draft) => { stored = { ...draft, revision: draft.revision + 1 }; saved(); return stored; } });
  }
  const documents = Object.fromEntries(Object.entries(owners).map(([scope, id]) => [scope, {
    scope, ownerId: id, enabled: true, revision: 0,
    ...({ variables: {}, trees: [{ ...createScriptItem('folder', 'synthetic-folder'), enabled: true,
      scripts: [{ ...createScriptItem('script', 'synthetic-script'), name: '合成脚本', enabled: true }] }] }),
  }]));
  return withLibraryVersions({ read: async scope => structuredClone(documents[scope]), subscribe: () => () => {}, subscribeChanges: () => () => {},
    saveAll: async drafts => { const result = drafts.map(draft => documents[draft.scope] = { ...draft, revision: draft.revision + 1 }); saved(); return result; } },
  'scripts');
}
const services = Object.fromEntries(['character', 'preset'].flatMap(scope => ['regex', 'scripts'].map(kind => [`${kind}:${scope}`, service(kind, scope)])));
function Fixture() {
  const [address, setAddress] = useState({ kind: 'regex', scope: 'character' });
  const { kind, scope } = address, ownerId = `synthetic-${scope}`, model = services[`${kind}:${scope}`];
  const props = scope === 'preset' ? { presetId: ownerId } : { characterId: ownerId };
  return <>
    <nav>{Object.keys(services).map(key => <button key={key} data-editor={key} onClick={() => { const [kind, scope] = key.split(':'); setAddress({ kind, scope }); }}>{key}</button>)}</nav>
    <span id="text-reference" style={{ color: 'var(--text)' }} />
    <span id="muted-reference" style={{ color: 'var(--muted)' }} />
    <main key={`${kind}:${scope}`} data-current={`${kind}:${scope}`} style={{ height: 'calc(100vh - 48px)' }}>
      {kind === 'regex' ? <RegexRulesPanel {...props} regexRules={model} /> : <ScriptLibrariesPanel {...props} scriptLibraries={model} />}
    </main>
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

window.editorViewFor = label => EditorView.findFromDOM(document.querySelector(`[role="textbox"][aria-label="${label}"]`));
