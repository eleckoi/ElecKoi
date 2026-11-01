import '../../src/modules/scripts/styles/script-libraries.css';
import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScriptLibrariesPanel } from '../../src/modules/scripts/components/ScriptLibrariesPanel.jsx';
import { RegexRulesPanel } from '../../src/modules/regex/components/RegexRulesPanel.jsx';
import { SettingLibraryPanel } from '../../src/modules/settingLibraries/components/SettingLibraryPanel.jsx';
import { SettingLibraryManager } from '../../src/modules/settingLibraries/components/SettingLibraryManager.jsx';
import { VariableConfigPanel } from '../../src/modules/variables/components/VariableConfigPanel.jsx';
import { PresetPromptEditor } from '../../src/modules/presets/components/PresetPromptEditor.jsx';
import { PresetToolsEditor } from '../../src/modules/presets/components/PresetToolsEditor.jsx';
import { DynamicSettingsPanel } from '../../src/modules/settingLibraries/components/DynamicSettingsPanel.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';
import { Input, Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { editorCollectionService } from '../helpers/editorCollectionServices.js';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/base.css';
import '../../src/ui/styles/editor-sidebar.css';
import '../../src/modules/regex/styles/regex-rules.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';
import '../../src/modules/variables/styles/variable-config.css';
import '../../src/modules/presets/styles/preset-panel.css';
import '../../src/modules/settingLibraries/styles/dynamic-settings.css';
import '../../src/mobile/mobile.css';
import '../../src/mobile/mobile-preset-editor.css';

const kinds = ['settings', 'variables', 'regex', 'scripts', 'merge', 'prompts', 'tools', 'branches'];
function PresetFixture({ kind }) {
  const [preset, setPreset] = useState(() => ({ id: 'synthetic-preset', name: '合成预设', groups: [], expandedGroupIds: [], promptPositions: [],
    entries: [{ ...createEntryDraft('', 1, []), id: 'synthetic-prompt', title: '合成提示词' }],
    toolGroups: [{ id: 'synthetic-tool', name: '合成工具', description: '', source: 'built_in', included: true, enabled: true, members: [] }] }));
  return kind === 'prompts' ? <PresetPromptEditor preset={preset} onChange={setPreset} /> : <PresetToolsEditor preset={preset} onChange={setPreset} />;
}
function treeService(kind) {
  if (kind === 'branches') return { subscribe: () => () => {}, readConversations: async () => [] };
  if (kind === 'merge') {
    const entries = [0, 1].map(index => ({ id: `synthetic-entry-${index}`, title: `合成设定${index}`, kind: 'normal', groupId: 'synthetic-group', treeViewOrder: index + 1 }));
    const current = { id: 'synthetic-current', name: '当前版本', entries: [], groups: [], promptPositions: [], expandedGroupIds: [] };
    const source = { ...current, id: 'synthetic-source', name: '来源版本', entries, groups: [{ id: 'synthetic-group', name: '合成文件夹', parentId: '', treeViewOrder: 0 }] };
    const value = { ...current, characterId: 'synthetic-character', activeVersionId: current.id, versions: [current, source] };
    return { value, listCharacters: async () => ({ items: [] }) };
  }
  const version = kind === 'settings' ? { id: 'synthetic-version', name: '合成版本', entries: [], groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: true }
    : { id: 'synthetic-version', name: '合成版本', variables: [], objects: [], initialStateJson: '{}', schemaCode: '', expandedObjectIds: [] };
  const value = { ...version, characterId: 'synthetic-character', activeVersionId: version.id, versions: [version] };
  return { getSnapshot: () => ({ status: 'ready', value }), subscribe: () => () => {}, read: async () => value, saveViewState: async () => {} };
}
function Fixture() {
  const [address, setAddress] = useState({ kind: 'regex', scope: 'character', compact: true });
  const { kind, scope, compact } = address;
  const service = useMemo(() => ['settings', 'variables', 'merge', 'branches'].includes(kind) ? treeService(kind)
    : ['prompts', 'tools'].includes(kind) ? null : editorCollectionService(kind, scope), [kind, scope]);
  const presentation = useMemo(() => ({ compact }), [compact]);
  const ownerProps = { [scope === 'preset' ? 'presetId' : 'characterId']: `synthetic-${scope}` };
  return <>
    <div className="setting-library-save-control" data-official-controls style={{ position: 'fixed', top: -2000 }}><Input /><Button variant="outline">操作</Button><Button variant="primary">操作</Button></div>
    <nav hidden>{kinds.flatMap(kind => ['character', 'preset'].flatMap(scope => [true, false].map(compact =>
      <button key={`${kind}:${scope}:${compact}`} data-editor={`${kind}:${scope}:${compact}`} onClick={() => setAddress({ kind, scope, compact })}>fixture</button>)))}</nav>
    <main data-current={`${kind}:${scope}:${compact}`} className={compact ? 'mobile-shell' : ''} style={{ height: '100vh', overflow: 'hidden' }}>
      <header style={{ flex: 'none', height: 60, padding: 16 }}>编辑{scope === 'preset' ? '预设' : '角色'}</header>
      <div className={compact ? scope === 'preset' ? 'mobile-preset-editor' : 'mobile-character-editor' : ''}
        style={{ height: 'calc(100vh - 60px)', minHeight: 0, marginLeft: compact && scope === 'character' ? 76 : 0 }}>
        <EditorPresentationContext.Provider key={`${kind}:${scope}:${compact}`} value={presentation}>
          {['prompts', 'tools'].includes(kind) ? <PresetFixture kind={kind} />
            : kind === 'branches' ? <DynamicSettingsPanel characterId="synthetic-character" settingLibraries={service} />
            : kind === 'merge' ? <SettingLibraryManager characterId="synthetic-character" settingLibraries={service} library={service.value} onChange={() => {}} onClose={() => {}} onError={error => { throw new Error(error); }} />
            : kind === 'settings' ? <SettingLibraryPanel characterId="synthetic-character" settingLibraries={service} />
            : kind === 'variables' ? <VariableConfigPanel characterId="synthetic-character" variables={service} />
            : kind === 'regex' ? <RegexRulesPanel {...ownerProps} regexRules={service} />
            : <ScriptLibrariesPanel {...ownerProps} scriptLibraries={service} />}
        </EditorPresentationContext.Provider>
      </div>
    </main>
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
