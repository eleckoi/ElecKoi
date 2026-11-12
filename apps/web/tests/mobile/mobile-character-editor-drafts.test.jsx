// @vitest-environment jsdom
import React, { act, useRef, useState } from 'react';
import { editorVersionsFixture } from '../helpers/editorLibraryVersions.js';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dshClientRequire } from '../../../../tests/helpers/dshClientPlugin';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobileCharactersPage } from '../../src/mobile/MobileCharactersPage.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { createVariableDraft } from '../../src/modules/variables/model/variableConfigEditing.js';
import { createRegexRule } from '../../src/modules/regex/model/regexRulesEditing.js';
import { normalizeSettingLibrary } from '../../../../packages/host/product-data/src/domain/settingLibraries/settingLibraryNormalization';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.mock('../../src/app/services/windowControls.js', () => ({ appWindow: { close: vi.fn() }, showCurrentWindow: async () => {} }));

let root, container, notification;
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; document.body.innerHTML = ''; vi.restoreAllMocks(); });

function modelFor(initial, normalize = value => value) {
  let stored = structuredClone(initial);
  return {
    read: async () => ({ ok: true, value: structuredClone(stored) }),
    save: async (_id, draft) => { stored = structuredClone(normalize(draft)); return { ok: true, value: structuredClone(stored) }; },
    stored: () => stored,
  };
}
const clientSource = readFileSync(resolve('packages/client/features/dsh-client-character-configuration/src/client.js'), 'utf8');
function clientModels(records) {
  let registration; const services = {};
  runInNewContext(clientSource, { window: { __ModuleLoader__: { load: value => { registration = value; } } } });
  registration.factory(dshClientRequire).apply({
    remote: { eleckoiCharacterConfiguration: {
      readSettingLibrary: records.settingLibraries.read, saveSettingLibrary: records.settingLibraries.save,
      readVariableConfig: records.variables.read, saveVariableConfig: records.variables.save,
      readRegexRules: records.regexRules.read, saveRegexRules: records.regexRules.save,
      readRegexEditor: async target => { const result = await records.regexRules.read(); return { ...result, value: { ...result.value, target, ownerRevision: '0'.repeat(64) } }; },
      saveRegexEditor: draft => records.regexRules.save(draft.target.ownerId, draft),
      saveSettingLibraryViewState: async () => ({ ok: true, value: [] }),
      saveVariableConfigViewState: async () => ({ ok: true, value: [] }),
    } },
    provide: (name, model) => { services[name] = model; }, effect: () => {},
  });
  return Object.fromEntries(Object.entries(records).map(([key, record]) => {
    const model = services[{settingLibraries:'eleckoiSettingLibraries',variables:'eleckoiVariables',regexRules:'eleckoiRegexRules'}[key]];
    if (key === 'regexRules') {
      const editorFactory = model.editor.bind(model);
      model.save = async (ownerId, draft) => editorFactory('character', ownerId).save(draft);
      model.editor = (scope, ownerId) => { const editor = editorFactory(scope, ownerId);
        return { ...editor, save: draft => model.save(ownerId, draft), versions: editorVersionsFixture('regex', () => editor.getSnapshot().value, async values => [await model.save(ownerId, values[0])], editor.subscribe) }; };
    }
    vi.spyOn(model, 'save'); model.stored = record.stored; return [key, model];
  }));
}
async function click(label, scope = document.body) {
  const button = [...scope.querySelectorAll('button')].find(node => node.textContent.trim() === label || node.getAttribute('aria-label') === label);
  expect(button, label).toBeTruthy(); await act(async () => button.click());
}
const scenarios = [
  { section: '设定库', model: 'settingLibraries', choice: '设定', newName: '新建设定', rows: '.setting-library-tree-row',
    count: value => value.entries.length },
  { section: '变量', model: 'variables', choice: '变量', newName: '新建变量', rows: '.variable-tree-row',
    count: value => value.variables.length },
  { section: '正则', model: 'regexRules', choice: '角色正则', newName: '未命名规则', rows: '.regex-rule-row',
    count: value => value.characterRules.length },
];
async function mount() {
  notification = vi.fn();
  const id = 'synthetic-character';
  const character = { id, name: '合成角色', persona: { assistant_name: '合成角色' } };
  const entries = [{ ...createEntryDraft('', 1, []), id: 'setting-a', title: '合成设定', content: '合成正文' }];
  const version = { id: 'version-a', name: '合成版本', entries, groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: false };
  const variables = [{ ...createVariableDraft({ variables: [], objects: [] }), id: 'variable-a', title: '合成变量' }];
  const variableVersion = { id: 'version-a', name: '合成版本', variables, objects: [], initialStateJson: '{}', schemaCode: '', expandedObjectIds: [] };
  const regex = createRegexRule({ globalRules: [], agentPresetRules: [], characterRules: [], versions: [] }, 'Character').collection;
  regex.characterRules[0].name = '合成正则';
  const models = clientModels({
    settingLibraries: modelFor(normalizeSettingLibrary(id, { ...version, characterId: id, activeVersionId: version.id, versions: [version] }), value => normalizeSettingLibrary(id, value)),
    variables: modelFor({ ...variableVersion, characterId: id, activeVersionId: variableVersion.id, versions: [variableVersion] }),
    regexRules: modelFor({ ...regex, characterId: id, revision: 0 }),
  });
  const catalog = { refresh: async () => ({ items: [character] }) };
  const handlers = [];
  const registerBackHandler = handler => { handlers.push(handler); return () => handlers.splice(handlers.indexOf(handler), 1); };
  function Harness() {
    const [route, setRoute] = useState({ kind: 'character-editor', characterId: id });
    const guardRef = useRef(null);
    const guarded = action => guardRef.current ? guardRef.current(action) : action();
    return <MainPageContext.Provider value={{ route, guardRef, characterConfiguration: models, characters: catalog,
      chat: { characters: { items: [character], groups: [] }, persona: {}, notify: notification }, registerBackHandler,
      goBack: () => { if (handlers.length) handlers.at(-1)(); else guarded(() => setRoute({ kind: 'root' })); },
      pushRoute: next => guarded(() => setRoute(next)), scrollPositions: new Map(),
    }}><MobileCharactersPage />{route.kind === 'root' && <button onClick={() => setRoute({ kind: 'character-editor', characterId: id })}>重新编辑</button>}</MainPageContext.Provider>;
  }
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Harness />));
  return models;
}
async function create(scenario, returnToList = true) {
  await click(scenario.section); await click('新建');
  await click(scenario.choice, document.querySelector('[role=menu]'));
  expect(container.querySelector('.editor-page-detail')).toBeTruthy();
  expect(container.querySelector('.mobile-header-actions button').textContent).toBe('保存');
  if (!returnToList) return;
  await click('返回');
  expect([...container.querySelectorAll(scenario.rows)].some(row => row.textContent.includes(scenario.newName))).toBe(true);
}

describe('Android character editor draft navigation', () => {
  it.each(scenarios)('$section keeps the draft on cancel and a failed save, without switching or committing it', async scenario => {
    const models = await mount(); const model = models[scenario.model];
    const baseline = scenario.count(model.stored());
    await create(scenario, false);
    await click(scenario.section === '正则' ? '变量' : '正则');
    await click('取消', document.querySelector('[role=alertdialog]'));
    expect(container.querySelector('.editor-page-detail')).toBeTruthy();
    expect(model.save).not.toHaveBeenCalled();
    model.save.mockRejectedValueOnce(new Error('合成写入失败'));
    await click(scenario.section === '正则' ? '变量' : '正则');
    await click('保存', document.querySelector('[role=alertdialog]'));
    expect(document.querySelector('[role=alertdialog]')).toBeTruthy();
    expect(notification).toHaveBeenCalledWith('error', '合成写入失败');
    expect(container.querySelector('.mobile-header [role=alert]')).toBeNull();
    expect(container.querySelector('.editor-page-feedback [role=alert]')).toBeNull();
    expect(container.querySelector('.setting-library-save-feedback')).toBeNull();
    expect(scenario.count(model.stored())).toBe(baseline);
    await click('不保存', document.querySelector('[role=alertdialog]'));
    await click(scenario.section);
    expect([...container.querySelectorAll(scenario.rows)].some(row => row.textContent.includes(scenario.newName))).toBe(false);
  });
  it.each(scenarios)('$section discards newly created entries when changing section and when leaving, then retains explicitly saved entries', async scenario => {
    const models = await mount(); const model = models[scenario.model]; const baseline = scenario.count(model.stored());
    await create(scenario, false);
    expect(model.save).not.toHaveBeenCalled();
    await click(scenario.section === '正则' ? '变量' : '正则');
    await click('不保存', document.querySelector('[role=alertdialog]'));
    await click(scenario.section);
    expect([...container.querySelectorAll(scenario.rows)].some(row => row.textContent.includes(scenario.newName))).toBe(false);
    expect(scenario.count(model.stored())).toBe(baseline);
    await create(scenario); await click('返回');
    await click('不保存', document.querySelector('[role=alertdialog]'));
    await click('重新编辑'); await click(scenario.section);
    expect([...container.querySelectorAll(scenario.rows)].some(row => row.textContent.includes(scenario.newName))).toBe(false);
    expect(model.save).not.toHaveBeenCalled();
    await create(scenario); await click('保存', container.querySelector('.mobile-header'));
    expect(scenario.count(model.stored())).toBe(baseline + 1);
    await click('返回'); await click('重新编辑'); await click(scenario.section);
    expect([...container.querySelectorAll(scenario.rows)].some(row => row.textContent.includes(scenario.newName))).toBe(true);
  });
});
