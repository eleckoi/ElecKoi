import { switchIsOn } from '../helpers/editorText.js';
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegexRulesPanel } from '../../src/modules/regex/components/RegexRulesPanel.jsx';
import { ScriptLibrariesPanel } from '../../src/modules/scripts/components/ScriptLibrariesPanel.jsx';
import { PresetIntroductionEditor } from '../../src/modules/presets/components/PresetIntroductionEditor.jsx';
import { createScriptItem } from '../../src/modules/scripts/model/scriptEditing.js';
import { createRegexRule } from '../../src/modules/regex/model/regexRulesEditing.js';
import { withLibraryVersions } from '../helpers/editorLibraryVersions.js';
import { withRegexEditor } from '../helpers/regexEditorModel.js';

vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let root, node;
afterEach(async () => { if (root) await act(() => root.unmount()); node?.remove(); root = null; });

const scenarios = [
  { kind: 'regex', noun: '正则', directory: '.rs-directory-content', row: '.regex-rule-row', name: '.regex-rule-main', inspector: '.setting-document-heading' },
  { kind: 'scripts', noun: '脚本', directory: '.rs-directory-content', row: '.script-list-row', name: '.script-list-name', inspector: '.setting-document-heading' },
];
const labels = { global: '全局', character: '角色', preset: '预设' };
const switchScope = async scope => act(() => [...node.querySelectorAll('.setting-scope-switch [role=tab]')].find(tab => tab.textContent === labels[scope]).click());
async function mount(scenario, ownerScope = 'character', empty = false, trees, pendingVersions = false) {
  const ownerId = `synthetic-${ownerScope}`;
  const owners = { global: '', [ownerScope]: ownerId };
  let service, write;
  if (scenario.kind === 'regex') {
    let stored = { globalRules: [], characterRules: [], agentPresetRules: [], versions: [], activeVersionId: '', revision: 0 };
    if (!empty) for (const scope of Object.keys(owners)) {
      const result = createRegexRule(stored, scope === 'global' ? 'Global' : scope === 'preset' ? 'AgentPreset' : 'Character');
      stored = result.collection;
      const key = scope === 'global' ? 'globalRules' : scope === 'preset' ? 'agentPresetRules' : 'characterRules';
      stored[key][0] = { ...stored[key][0], id: `synthetic-${scope}`, name: `合成${labels[scope]}条目`, enabled: false };
    }
    write = vi.fn(async (_ownerId, draft) => { stored = { ...draft, revision: draft.revision + 1 }; return stored; });
    service = withRegexEditor({ getSnapshot: () => ({ status: 'ready', value: stored }), subscribe: () => () => {}, read: async () => stored, save: write, test: vi.fn() });
  } else {
    const documents = Object.fromEntries(Object.entries(owners).map(([scope, id]) => [scope, {
      scope, ownerId: id, enabled: false, revision: 0,
      ...({ variables: {}, trees: trees?.[scope] || (empty ? [] : [{ ...createScriptItem('script', 'synthetic-item'), name: `合成${labels[scope]}条目` }]) }),
    }]));
    write = vi.fn(async drafts => drafts.map(draft => documents[draft.scope] = { ...draft, revision: draft.revision + 1 }));
    service = withLibraryVersions({ read: async scope => structuredClone(documents[scope]), subscribe: () => () => {}, subscribeChanges: () => () => {}, saveAll: write }, 'scripts');
  }
  if (pendingVersions) {
    if (scenario.kind === 'regex') {
      const editor = service.editor;
      service.editor = (...args) => { const result = editor(...args); result.versions.read = () => new Promise(() => {}); return result; };
    } else service.versions.read = () => new Promise(() => {});
  }
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  const ownerProps = ownerScope === 'preset' ? { presetId: ownerId } : { characterId: ownerId };
  await act(async () => root.render(scenario.kind === 'regex' ? <RegexRulesPanel {...ownerProps} regexRules={service} /> : <ScriptLibrariesPanel {...ownerProps} scriptLibraries={service} />));
  return { write, group: scope => node.querySelector(`section[aria-label="${labels[scope]}${scenario.noun}"]`) };
}
async function rightClick(element) {
  expect(element).toBeTruthy();
  await act(() => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })));
}
const menu = () => document.querySelector('.editor-context-menu');
const menuLabels = () => [...menu().querySelectorAll('[role=menuitem]')].map(button => button.textContent);
async function action(label) {
  const button = [...menu().querySelectorAll('[role=menuitem]')].find(button => button.textContent === label);
  expect(button).toBeTruthy(); expect(button.disabled).toBe(false);
  await act(async () => button.click());
}
async function save() { await act(async () => node.querySelector('.setting-directory .setting-library-save-button').click()); }

describe('editor context menus', () => {
  it.each(scenarios.flatMap(scenario => ['character', 'preset'].map(ownerScope => ({ ...scenario, ownerScope }))))('$kind $ownerScope right-clicks keep the editor closed or preserve the current editor', async scenario => {
    const { group } = await mount(scenario, scenario.ownerScope);
    await rightClick(group(scenario.ownerScope).querySelector(scenario.row));
    expect(node.querySelector(scenario.inspector)).toBeNull();
    await act(() => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true })));
    await act(() => group(scenario.ownerScope).querySelector(scenario.name).click());
    const inspector = node.querySelector(scenario.inspector); expect(inspector).toBeTruthy();
    const directory = node.querySelector(scenario.directory);
    await act(() => directory.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })));
    await rightClick(directory);
    expect(node.querySelector(scenario.inspector)).toBe(inspector);
    expect(node.querySelector('.is-closing')).toBeNull();
  });
  it.each(scenarios.flatMap(scenario => ['character', 'preset'].map(ownerScope => ({ ...scenario, ownerScope }))))('$kind $ownerScope toggles all item switches with the scope, saves their states and dims disabled entries', async scenario => {
    const { group, write } = await mount(scenario, scenario.ownerScope);
    for (const scope of ['global', scenario.ownerScope]) {
      await switchScope(scope);
      const headerSwitch = group(scope).querySelector('.rs-library-heading [role="switch"]');
      expect(headerSwitch).toBeTruthy();
      const row = () => group(scope).querySelector(scenario.row);
      const itemSwitch = () => row().querySelector('[role="switch"]');
      expect(row().dataset.enabled).toBe('false');
      await act(() => itemSwitch().click());
      if (!switchIsOn(headerSwitch)) await act(() => headerSwitch.click());
      expect(row().dataset.enabled).toBe('true');
      await save();
      await act(() => headerSwitch.click());
      expect(switchIsOn(itemSwitch())).toBe(false);
      expect(row().dataset.enabled).toBe('false');
      await save();
      if (scenario.kind === 'regex') expect(write.mock.lastCall[1][scope === 'global' ? 'globalEnabled' : scope === 'preset' ? 'agentPresetEnabled' : 'characterEnabled']).toBe(false);
      else expect(write.mock.lastCall[0]).toEqual([expect.objectContaining({ scope, enabled: false })]);
      await act(() => headerSwitch.click());
      expect(switchIsOn(itemSwitch())).toBe(true);
      expect(row().dataset.enabled).toBe('true');
      await act(() => itemSwitch().click());
      expect(row().dataset.enabled).toBe('false');
      await save();
    }
  });
  it('edits the right-clicked preset update record without permanent three-dot controls', async () => {
    node = document.createElement('div'); document.body.append(node); root = createRoot(node);
    const profile = { usageInstructions: '合成使用说明', timeline: [
      { id: 'first', title: '第一条合成更新', note: '合成内容一' },
      { id: 'second', title: '第二条合成更新', note: '合成内容二' },
    ] };
    await act(async () => root.render(<PresetIntroductionEditor preset={{ id: 'synthetic-preset', profile }}
      saving={false} error="" onClearError={() => {}} onSaveProfile={vi.fn().mockResolvedValue(true)} />));
    expect(node.querySelector('.preset-update-menu')).toBeNull();
    const record = node.querySelector('[aria-label="更新记录：第二条合成更新"]');
    await rightClick(record);
    expect(menuLabels()).toEqual(['编辑', '删除']);
    await action('编辑');
    expect(node.querySelector('[aria-label="更新标题"]').value).toBe('第二条合成更新');
    expect(node.querySelector('[aria-label="更新内容"]').value).toBe('合成内容二');
    expect(node.querySelector('.preset-update-record').textContent).toContain('第一条合成更新');
  });
  it.each(scenarios.flatMap(scenario => ['character', 'preset'].map(ownerScope => ({ ...scenario, ownerScope }))))('$kind exposes empty-group and background creation with explicit $ownerScope ownership', async scenario => {
    const { write, group } = await mount(scenario, scenario.ownerScope, true);
    await rightClick(node.querySelector(scenario.directory));
    const available = menuLabels();
    expect(available).not.toContain(`新建全局${scenario.noun}`);
    expect(available).toContain(`新建${labels[scenario.ownerScope]}${scenario.noun}`);
    expect(available.some(label => label.includes(scenario.ownerScope === 'character' ? '预设' : '角色'))).toBe(false);
    for (const [index, scope] of ['global', scenario.ownerScope].entries()) {
      await switchScope(scope);
      await rightClick(group(scope).querySelector('.rs-library-heading'));
      await action(scenario.kind === 'scripts' ? '新建脚本' : `新建${labels[scope]}${scenario.noun}`);
      expect(group(scope).querySelectorAll(scenario.row)).toHaveLength(1);
      if (index === 0) { await switchScope(scenario.ownerScope); expect(group(scenario.ownerScope).querySelectorAll(scenario.row)).toHaveLength(0); await switchScope(scope); }
      await save();
      if (scenario.kind !== 'regex') expect(write.mock.lastCall[0]).toEqual([expect.objectContaining({ scope, ownerId: scope === 'global' ? '' : `synthetic-${scenario.ownerScope}` })]);
    }
    if (scenario.kind === 'scripts') expect(node.querySelector('.editor-row-menu')).toBeNull();
  });

  it.each(scenarios)('$kind applies row commands to the right-clicked item and leaves the selected owner item intact', async scenario => {
    const { write, group } = await mount(scenario);
    expect(node.querySelector('.editor-row-menu')).toBeNull();
    await act(() => group('character').querySelector(scenario.name).click());
    await switchScope('global');
    await rightClick(group('global').querySelector(scenario.row));
    await action('启用');
    expect(group('global').querySelector(scenario.row).querySelector('[role="switch"]').getAttribute('aria-checked') === 'true').toBe(true);
    await switchScope('character');
    expect(group('character').querySelector(scenario.row).querySelector('[role="switch"]').getAttribute('aria-checked') === 'true').toBe(false);
    await switchScope('global');
    await rightClick(group('global').querySelector(scenario.row));
    await action('复制');
    expect(group('global').querySelectorAll(scenario.row)).toHaveLength(2);
    await switchScope('character');
    expect(group('character').querySelectorAll(scenario.row)).toHaveLength(1);
    await switchScope('global');
    expect(group('global').textContent).toContain('合成全局条目');
    await switchScope('global');
    await rightClick(group('global').querySelector(scenario.row));
    await action('重命名');
    expect(node.querySelector(`${scenario.inspector} input`).value).toBe('合成全局条目');
    await save();
    expect(write).toHaveBeenCalledTimes(1);
    if (scenario.kind !== 'regex') expect(write.mock.lastCall[0]).toEqual([expect.objectContaining({ scope: 'global' })]);
  });

  it('omits script library variables editing and creates a folder child through right-click', async () => {
    const { write, group } = await mount(scenarios.find(value => value.kind === 'scripts'), 'character', false, { character: [createScriptItem('folder', 'synthetic-folder')] });
    expect(node.querySelector('.editor-row-menu')).toBeNull();
    await rightClick(group('character').querySelector('.rs-library-heading'));
    expect(menuLabels()).toEqual(['新建脚本', '新建文件夹']);
    expect(node.querySelector('.script-inspector')).toBeNull();
    await rightClick(group('character').querySelector('.script-list-row'));
    await action('新建脚本');
    expect(group('character').querySelectorAll('.script-list-row.is-nested')).toHaveLength(1);
    await save();
    expect(write.mock.lastCall[0]).toEqual([expect.objectContaining({ scope: 'character', trees: [expect.objectContaining({ id: 'synthetic-folder', scripts: [expect.objectContaining({ type: 'script' })] })] })]);
  });



  it.each(scenarios)('$kind disables creation until its version catalog is ready', async scenario => {
    const { write, group } = await mount(scenario, 'character', true, undefined, true);
    await rightClick(group('character').querySelector('.rs-library-heading'));
    expect([...menu().querySelectorAll('[role=menuitem]')].every(button => button.disabled)).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
});
