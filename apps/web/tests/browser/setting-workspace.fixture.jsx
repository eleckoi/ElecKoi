import { EditorView } from '@codemirror/view';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { CharacterEditorWindow } from '../../src/app/windows/CharacterEditorWindow.jsx';
import { MobileHeader } from '../../src/mobile/MobileChrome.jsx';
import { createEntryDraft, createGroupDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { createCharacterOpenings } from '@shared/contracts/characterOpenings/schemas';
import { createVariableDraft } from '../../src/modules/variables/model/variableConfigEditing.js';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import { initialLibrary } from '../helpers/editorWorkspaceSamples.js';
import { editorVersionsFixture, withLibraryVersions } from '../helpers/editorLibraryVersions.js';
import '../../src/app/windows/styles/base.css';
import '../../src/app/windows/styles/tokens.css';
import '../../src/app/windows/styles/dsh-theme-bridge.css';
import '../../src/app/windows/shell/styles/titlebar.css';
import '../../src/app/windows/shell/styles/client-shell.css';
import '../../src/ui/styles/editor-sidebar.css';
import '../../src/ui/styles/avatar.css';
import '../../src/modules/persona/styles/character-editor.css';
import '../../src/modules/presets/styles/preset-panel.css';
import '../../src/modules/settingLibraries/styles/setting-library.css';
import '../../src/mobile/mobile.css';
import '../../src/mobile/mobile-character-editor.css';

installBrowserIconSprite();
const q = new URLSearchParams(location.search), theme = q.get('theme') || 'light';
const preview = q.get('preview');
const compact = q.has('mobile');
document.documentElement.dataset.eleckoiMobile = String(compact);
const entry = (id, title, extra = {}) => ({ ...createEntryDraft('', 1, []), id, title, content: '# 合成设定\n\n这是用于界面验证的合成正文。', enabled: true, position: 'instructions', ...extra });
const groups = [{ ...createGroupDraft('', 1, new Set()), id: 'characters', name: '角色设定' }, { ...createGroupDraft('', 2, new Set()), id: 'world', name: '世界设定' }];
const entries = [entry('persona', '合成人设', { groupId: 'characters', agentReadStrategy: 'required' }), entry('speech', '合成对话', { groupId: 'characters', treeViewOrder: 2, triggerMode: 'always', order: 3, iconId: 'note' }),
  entry('relation', '合成关系', { groupId: 'characters', treeViewOrder: 3, iconId: 'relation', agentSelectionHint: '涉及其他人物时读取。' }),
  entry('worldview', '合成世界', { groupId: 'world', iconId: 'world' }), entry('bookshop', '合成书店', { groupId: 'world', treeViewOrder: 2, iconId: 'place', agentReadStrategy: 'keyword', keywords: ['书店', '雨巷', '打烊'], keywordScanDepth: 3 })];
const version = { id: 'synthetic-version', name: '合成角色', entries, groups, expandedGroupIds: ['characters', 'world'], promptPositions: [], listAllExpanded: false };
let role = { ...version, characterId: 'synthetic-role', activeVersionId: version.id, versions: [structuredClone(version)] };
role.versions.push({ ...structuredClone(role.versions[0]), id: 'alternate', name: '合成版本', entries: [entry('alternate-entry', '另一版本条目')] });
const fixtureRoles = [
  '灯塔守夜人', '海岸邮差', '旧城图书员', '雨巷杂货铺', '山间旅店', '渡口', '街角书店', '钟楼观测站',
  ...Array.from({ length: 24 }, (_, index) => `示例角色 ${String(index + 1).padStart(2, '0')}`),
].map((name, index) => ({ id: `synthetic-source-${index}`, name }));
const fixtureVersions = [
  ...['当前整理稿', '旧城初稿', '雨夜剧情', '码头分支', '冬季特辑', '校对版'].map(name => ({ name })),
  ...Array.from({ length: 18 }, (_, index) => ({ name: `存档版本 ${String(index + 1).padStart(2, '0')}` })),
].map(({ name }, index) => ({ ...version, id: `synthetic-draft-${index}`, name, entries: [
  ...entries, ...Array.from({ length: 48 }, (_, offset) => entry(`fixture-entry-${offset}`, `旧城街道设定 ${offset + 1}`,
    { groupId: 'world', treeViewOrder: offset + 10 })),
] }));
if (preview) role.versions.push(...fixtureVersions);
let globals = { revision: 0, libraries: [{ id: 'global-one', name: '合成共享库', enabled: true, groups: [], entries: [entry('global-entry', '共享条目')], promptPositions: [], expandedGroupIds: [] }] };
window.workspaceCalls = { role: 0, global: 0 }; window.workspaceSaveFails = false;
const roleModel = { getSnapshot: () => ({ status: 'ready', value: role }), read: async () => role, subscribe: () => () => {},
  save: async (_id, value) => { window.workspaceCalls.role++; if (window.workspaceSaveFails) throw Error('合成保存失败'); role = structuredClone(value); return role; },
  saveViewState: async () => [], listCharacters: async () => ({ items: preview ? fixtureRoles : [{ id: 'synthetic-source', name: '合成来源角色' }] }),
  readUntracked: async id => preview ? { ...role, characterId: id, activeVersionId: fixtureVersions[0].id, versions: fixtureVersions } : role };
const globalModel = { getSnapshot: () => ({ status: 'ready', value: globals }), read: async () => globals, subscribe: () => () => {},
  save: async value => { window.workspaceCalls.global++; globals = structuredClone({ ...value, revision: globals.revision + 1 }); return globals; } };
const characterId = 'synthetic-role';
function documentModel(initial) {
  let value = initial;
  return { getSnapshot: () => ({ status: 'ready', value }), read: async () => value, subscribe: () => () => {},
    saveViewState: async () => [], save: async (_id, next) => { value = structuredClone(next); return value; } };
}
const variableVersion = { id: 'variable-v1', name: '合成版本', variables: [
  { ...createVariableDraft({ variables: [], objects: [] }), id: 'synthetic-weather', title: '天气' },
], objects: [], initialStateJson: '{}', schemaCode: '', expandedObjectIds: [] };
const openings = documentModel({ ...createCharacterOpenings(characterId), defaultOpeningMessageId: 'synthetic-opening',
  openingMessages: [{ id: 'synthetic-opening', title: '书店开门了', content: '雨巷里的书店刚刚开门。' }] });
const variables = documentModel({ ...variableVersion, characterId, activeVersionId: variableVersion.id, versions: [variableVersion] });
let regexData = { globalRules: initialLibrary('regex', 'global').rules, characterRules: initialLibrary('regex', 'character').rules,
  agentPresetRules: [], globalEnabled: true, characterEnabled: true, versions: [], activeVersionId: '', revision: 0, ownerRevision: 0 };
const regexEditor = { getSnapshot: () => ({ status: 'ready', value: regexData }), subscribe: () => () => {}, read: async () => regexData,
  save: async next => { regexData = structuredClone({ ...next, revision: regexData.revision + 1 }); return regexData; } };
regexEditor.versions = editorVersionsFixture('regex', () => regexEditor.read(), async values => [await regexEditor.save(values[0])]);
const scriptData = Object.fromEntries(['character', 'global'].map(scope => [scope, {
  ...initialLibrary('scripts', scope), ownerId: scope === 'character' ? characterId : '', revision: 0,
}]));
const scripts = withLibraryVersions({ read: async scope => structuredClone(scriptData[scope]), subscribe: () => () => {},
  subscribeChanges: () => () => {}, saveAll: async values => values.map(next => scriptData[next.scope] = structuredClone(next)) }, 'scripts');
const configuration = { settingLibraries: roleModel, globalSettingLibraries: globalModel, openings, variables,
  regexRules: { editor: () => regexEditor, test: async text => ({ output: text }) }, scripts };
window.workspaceSaved = () => ({ role, globals });
window.editorViewFor = label => EditorView.findFromDOM(document.querySelector(`[role="textbox"][aria-label="${label}"]`));
if (q.has('long')) {
  const text = q.get('long') === 'single' ? '超长行内容'.repeat(250000) : Array.from({ length: 100000 }, (_, i) => `${i} 创作内容，保留完整文字。\n`).join('');
  role.entries[0].content = text; role.versions[0].entries[0].content = text;
}
document.documentElement.dataset.theme = theme; document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark'); document.documentElement.style.colorScheme = theme;
const catalog = { refresh: async () => ({ items: [{ id: 'synthetic-role', name: '合成角色', persona: {} }] }) };
createRoot(document.getElementById('root')).render(<MainPageContext.Provider value={{ routeBusy: false }}>
  <div id="eleckoi-root" className={compact ? 'mobile-shell mobile-character-editor' : ''}><CharacterEditorWindow compact={compact}
  embeddedCharacterId={characterId} characterCatalog={catalog} characterConfiguration={configuration}
  renderHeader={({ saving, dirty, save, subpage }) => compact ?
    <MobileHeader title={subpage?.title || '编辑角色'} back={subpage?.back || (() => {})}>
      {subpage?.actions}<button type="button" disabled={saving || !dirty} onClick={save}>保存</button>
    </MobileHeader> : <header className="client-titlebar split-surface"><div className="title-spacer" /></header>}
  renderCharacterEditorSection={(section, _owner, fallback) => ['lore', 'openings', 'variables', 'regex', 'scripts'].includes(section) ? fallback : <div data-fixture-section={section} />}
/></div></MainPageContext.Provider>);

if (preview) {
  const clickWhenReady = async find => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const target = find();
      if (target) { target.click(); return; }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error('Preview control was not available');
  };
  const byText = (selector, label) => [...document.querySelectorAll(selector)].find(node => node.textContent.trim() === label);
  void (async () => {
    const sections = { openings: '开场白', variables: '变量', regex: '正则', scripts: '脚本' };
    if (sections[preview]) {
      await clickWhenReady(() => byText('.character-editor-navigation button', sections[preview]));
      return;
    }
    await clickWhenReady(() => byText('button', '设定库'));
    if (preview === 'character') return;
    if (preview === 'global' || preview === 'global-toolbar') {
      await clickWhenReady(() => byText('[role="tab"]', '全局'));
      if (preview === 'global') await clickWhenReady(() => document.querySelector('[aria-label="导入全局设定库"]'));
    } else if (preview === 'merge' || preview === 'entries' || preview === 'role-import') {
      await clickWhenReady(() => document.querySelector('[aria-label="导入角色设定库"]'));
      if (preview === 'role-import') return;
      await clickWhenReady(() => byText('[role="menuitem"]', '并入设定库'));
      if (preview === 'entries') {
        await clickWhenReady(() => byText('button.editor-picker-row', '灯塔守夜人'));
        await clickWhenReady(() => byText('button.editor-picker-row', '雨夜剧情'));
      }
    } else {
      await clickWhenReady(() => document.querySelector('[aria-label="设定库管理"]'));
      await clickWhenReady(() => byText('[role="menuitem"]', '版本管理'));
      if (preview === 'versions') await clickWhenReady(() => document.querySelector('[aria-label="当前版本"]'));
    }
  })();
}
