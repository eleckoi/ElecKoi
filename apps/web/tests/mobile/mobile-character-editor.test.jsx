// @vitest-environment jsdom
import { withRegexEditor } from '../helpers/regexEditorModel.js';
import React, { act, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';
import { DynamicSettingsPanel } from '../../src/modules/settingLibraries/components/DynamicSettingsPanel.jsx';
import { SettingLibraryPanel } from '../../src/modules/settingLibraries/components/SettingLibraryPanel.jsx';
import { createEntryDraft, createGroupDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { VariableConfigPanel } from '../../src/modules/variables/components/VariableConfigPanel.jsx';
import { createVariableDraft, createObjectDraft } from '../../src/modules/variables/model/variableConfigEditing.js';
import { RegexRulesPanel } from '../../src/modules/regex/components/RegexRulesPanel.jsx';
import { createRegexRule } from '../../src/modules/regex/model/regexRulesEditing.js';
import { normalizeSettingLibrary } from '../../../../packages/host/product-data/src/domain/settingLibraries/settingLibraryNormalization';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, controller, backHandlers;
beforeEach(() => {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  backHandlers = [];
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

function modelFor(value, normalize = draft => draft) {
  return { getSnapshot: () => ({ status: 'ready', value }), subscribe: () => () => {}, read: async () => value,
    save: vi.fn(async (_id, draft) => normalize(draft)), saveViewState: vi.fn().mockResolvedValue(undefined) };
}
const scenarios = [
  { name: '设定', selector: '.setting-library-tree-row', search: '搜索设定', field: '[aria-label="条目标题"]',
    setup() {
      const entries = [0, 1].map(index => ({ ...createEntryDraft('', index + 1, []), id: `entry-${index}`, title: `合成条目${index}`, content: '合成正文' }));
      const version = { id: 'version-a', name: '合成版本', entries, groups: [], promptPositions: [], expandedGroupIds: [], listAllExpanded: true };
      return modelFor({ ...version, characterId: 'synthetic-character', activeVersionId: version.id, versions: [version] },
        draft => normalizeSettingLibrary('synthetic-character', draft));
    }, Component: SettingLibraryPanel, modelProp: 'settingLibraries', order: value => value.entries.filter(entry => entry.kind !== 'opening').sort((a, b) => a.treeViewOrder - b.treeViewOrder).map(value => value.id),
    changed: value => value.entries.find(entry => entry.id === 'entry-0').title,
  },
  { name: '变量', selector: '.variable-tree-row', search: '搜索变量', field: '[aria-label="当前变量名称"]',
    setup() {
      const variables = [0, 1].map(index => ({ ...createVariableDraft({ variables: [], objects: [] }), id: `entry-${index}`, title: `合成条目${index}`, treeViewOrder: index + 1 }));
      const version = { id: 'version-a', name: '合成版本', variables, objects: [], initialStateJson: '{}', schemaCode: '', expandedObjectIds: [] };
      return modelFor({ ...version, characterId: 'synthetic-character', activeVersionId: version.id, versions: [version] });
    }, Component: VariableConfigPanel, modelProp: 'variables', order: value => value.variables.slice().sort((a, b) => a.treeViewOrder - b.treeViewOrder).map(value => value.id),
    changed: value => value.variables.find(entry => entry.id === 'entry-0').title,
  },
  { name: '正则', selector: '.regex-rule-row', search: '搜索正则', field: '[aria-label="规则名称"]',
    setup() {
      let collection = { globalRules: [], agentPresetRules: [], characterRules: [] };
      for (let index = 0; index < 2; index++) collection = createRegexRule(collection, 'Character').collection;
      collection.characterRules = collection.characterRules.map((rule, index) => ({ ...rule, id: `entry-${index}`, name: `合成条目${index}` }));
      return withRegexEditor(modelFor(collection));
    }, Component: RegexRulesPanel, modelProp: 'regexRules', order: value => value.characterRules.map(value => value.id),
    changed: value => value.characterRules.find(entry => entry.id === 'entry-0').name,
  },
];
async function click(label) {
  const button = [...document.body.querySelectorAll('button')].find(node => node.textContent.trim() === label || node.getAttribute('aria-label') === label);
  expect(button, label).toBeTruthy(); await act(async () => button.click());
}
async function fill(input, value) {
  expect(input).toBeTruthy();
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function mount(scenario, compact = true) {
  const model = scenario.setup();
  const registerBackHandler = callback => { backHandlers.push(callback); return () => { backHandlers = backHandlers.filter(value => value !== callback); }; };
  function Harness() {
    const [subpage, setSubpage] = useState(null);
    const ref = useRef(null); controller = ref;
    const presentation = useMemo(() => ({ compact, registerBackHandler, registerSubpage: page => {
      setSubpage(page); return () => setSubpage(current => current === page ? null : current);
    } }), []);
    return <EditorPresentationContext.Provider value={presentation}>
      <header><button type="button" onClick={subpage?.back}>返回</button><h1>{subpage?.title || '编辑角色'}</h1></header>
      <scenario.Component ref={ref} characterId="synthetic-character" {...{ [scenario.modelProp]: model }} />
    </EditorPresentationContext.Provider>;
  }
  await act(async () => root.render(<Harness />)); return model;
}

function rowFor(scenario, text = '合成条目0') {
  return [...container.querySelectorAll(scenario.selector)].find(node => node.textContent.includes(text));
}
function touchEvent(target, type, y) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touch = { identifier: 1, clientX: 100, clientY: y };
  Object.defineProperties(event, { touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : [touch] }, changedTouches: { value: [touch] } });
  target.dispatchEvent(event);
}

describe('Android character editor selection and bottom actions', () => {
  it.each(scenarios)('$name opens on double click, while toggles only change the enabled state', async scenario => {
    await mount(scenario);
    const row = rowFor(scenario);
    await act(async () => {
      row.click(); row.click(); row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(container.querySelector('.editor-page-detail')).toBeTruthy();
    await click('返回');
    const toggle = rowFor(scenario).querySelector('[role=switch], input[type=checkbox]');
    await act(async () => toggle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(container.querySelector('.editor-page-detail')).toBeNull();
  });
  it.each(scenarios)('$name selects without opening, shares the main toolbar and edits from the bottom bar', async scenario => {
    await mount(scenario);
    const row = rowFor(scenario);
    await act(async () => row.click());
    expect(container.querySelector('.editor-page-detail')).toBeNull();
    expect(container.querySelector('.editor-sort-button')).toBeNull();
    const toolbar = container.querySelector('.editor-collection-toolbar');
    expect([...toolbar.querySelectorAll('button')].map(button => button.textContent)).not.toContain('新建');
    expect([...container.querySelectorAll('.mobile-editor-actions [role=toolbar] button')].map(button => button.textContent)).toEqual(['新建', '编辑', '移动', '删除', '更多']);
    await click('编辑');
    expect(container.querySelector('.editor-page-detail')).toBeTruthy();
    expect(container.querySelector('[role=separator]')).toBeNull();
    expect(container.querySelector('.editor-sidebar-pane')).toBeNull();
    await click('返回');
    expect(container.querySelector('.editor-page-detail')).toBeNull();
    expect(rowFor(scenario).getAttribute('aria-selected') === 'true' || rowFor(scenario).classList.contains('is-selected')).toBe(true);
  });
  it.each(scenarios)('$name opens a separate page, retains list search and scroll, and exposes failed saves on the page', async scenario => {
    const model = await mount(scenario);
    const search = container.querySelector(`input[aria-label="${scenario.search}"]`);
    await fill(search, '合成条目0');
    const list = container.querySelector('.editor-sidebar-directory'); list.scrollTop = 80;
    const row = rowFor(scenario);
    await act(async () => { row.focus(); row.click(); });
    await click('编辑');
    expect(container.querySelector('.editor-page-list').hidden).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('.editor-page-detail'));
    await fill(container.querySelector(scenario.field), '合成条目改名');
    model.save.mockRejectedValueOnce(new Error('合成保存错误'));
    await act(async () => expect(await controller.current.save()).toBe(false));
    expect(container.querySelector('.editor-page-feedback [role=alert]').textContent).toContain('合成保存错误');
    await click('返回');
    expect(container.querySelector('.editor-page-list').hidden).toBe(false);
    expect(search.value).toBe('合成条目0'); expect(list.scrollTop).toBe(80);
    await act(async () => controller.current.save());
    expect(scenario.changed(model.save.mock.lastCall[1])).toBe('合成条目改名');
  });
  it.each(scenarios)('$name saves touch drag order, while scroll gestures and cancelled drags preserve the order', async scenario => {
    const model = await mount(scenario);
    const persistedOrder = () => scenario.order(model.save.mock.lastCall?.[1] ?? model.getSnapshot().value);
    const rows = [...container.querySelectorAll('[data-reorder-id]')].filter(row => row.textContent.includes('合成条目'));
    rows.forEach((row, index) => vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: index * 50, bottom: index * 50 + 50, height: 50 }));
    vi.useFakeTimers();
    try {
      await act(async () => { touchEvent(rows[0], 'touchstart', 20); touchEvent(window, 'touchmove', 80); vi.advanceTimersByTime(450); touchEvent(window, 'touchend', 80); });
      expect(container.querySelector('[data-reorder-target]')).toBeNull();
      await act(async () => { touchEvent(rows[0], 'touchstart', 20); vi.advanceTimersByTime(400); });
      await act(async () => touchEvent(window, 'touchmove', 110));
      expect(container.querySelector('[data-reorder-target=after]')).toBeTruthy();
      await act(async () => touchEvent(window, 'touchcancel', 110));
      await act(async () => controller.current.save());
      expect(persistedOrder()).toEqual(['entry-0', 'entry-1']);
      await act(async () => { touchEvent(rows[0], 'touchstart', 20); vi.advanceTimersByTime(400); });
      await act(async () => touchEvent(window, 'touchmove', 110));
      await act(async () => touchEvent(window, 'touchend', 110));
      expect(container.querySelector('.editor-page-detail')).toBeNull();
      await act(async () => controller.current.save());
      expect(scenario.order(model.save.mock.lastCall[1])).toEqual(['entry-1', 'entry-0']);
      const saved = await model.save.mock.results.at(-1).value;
      if (saved.versions) expect(scenario.order(saved.versions.find(version => version.id === saved.activeVersionId))).toEqual(['entry-1', 'entry-0']);
    } finally { vi.useRealTimers(); }
  });
  it.each(scenarios.slice(0, 2))('$name creates under the selected folder, then moves the new item from the bottom bar', async scenario => {
    const base = scenario.setup();
    const value = base.getSnapshot().value;
    let parent;
    if (scenario.name === '设定') {
      parent = { ...createGroupDraft('', 3, new Set()), id: 'folder-a', name: '合成文件夹' };
      value.groups = [parent]; value.versions[0].groups = [parent];
    } else {
      parent = { ...createObjectDraft(value, ''), id: 'folder-a', name: '合成文件夹' };
      value.objects = [parent]; value.versions[0].objects = [parent];
    }
    const model = await mount({ ...scenario, setup: () => base });
    await act(async () => rowFor(scenario, '合成文件夹').click());
    expect(container.querySelector('.editor-page-detail')).toBeNull();
    await click('新建'); await click(scenario.name);
    expect(container.querySelector('.editor-page-detail')).toBeTruthy();
    await act(async () => controller.current.save());
    let draft = model.save.mock.lastCall[1];
    let created = (scenario.name === '设定' ? draft.entries : draft.variables).find(item => !item.id.startsWith('entry-') && !item.id.startsWith('fixed-') && !item.id.startsWith('built-in-'));
    expect(scenario.name === '设定' ? created.groupId : created.objectId).toBe('folder-a');
    await click('返回'); await click('移动');
    expect([...container.querySelectorAll('.mobile-editor-actions button')].some(button => button.textContent === '粘贴')).toBe(true);
    await click('粘贴');
    await act(async () => controller.current.save());
    draft = model.save.mock.lastCall[1];
    created = (scenario.name === '设定' ? draft.entries : draft.variables).find(item => item.id === created.id);
    expect(scenario.name === '设定' ? created.groupId : created.objectId).toBe('');
  });
  it('protects fixed initialization and blocks sorting of a filtered subset', async () => {
    const model = await mount(scenarios[1]);
    const fixed = [...container.querySelectorAll('[data-reorder-id]')].find(row => row.dataset.reorderFixed === 'true');
    await act(async () => fixed.click());
    const actions = [...container.querySelectorAll('.mobile-editor-actions [role=toolbar] button')];
    expect(actions.find(button => button.textContent === '编辑').disabled).toBe(false);
    expect(actions.find(button => button.textContent === '移动').disabled).toBe(true);
    expect(actions.find(button => button.textContent === '删除').disabled).toBe(true);
    await fill(container.querySelector('input[aria-label="搜索变量"]'), '合成条目');
    vi.useFakeTimers();
    try {
      await act(async () => { touchEvent(rowFor(scenarios[1]), 'touchstart', 20); vi.advanceTimersByTime(400); touchEvent(window, 'touchmove', 110); touchEvent(window, 'touchend', 110); });
      expect(container.querySelector('[data-reorder-target]')).toBeNull();
      await act(async () => controller.current.save());
      expect(scenarios[1].order(model.save.mock.lastCall[1])).toEqual(['entry-0', 'entry-1']);
    } finally { vi.useRealTimers(); }
  });
});


describe('Android branch setting bottom actions', () => {
  it.each([true, false])('keeps its search toolbar mounted through a delayed read and a failed retry (compact=%s)', async compact => {
    let resolveRead, rejectRead;
    const model = { subscribe: () => () => {}, readConversations: () => new Promise((resolve, reject) => {
      resolveRead = resolve; rejectRead = reject;
    }) };
    const scenario = { setup: () => model, Component: DynamicSettingsPanel, modelProp: 'settingLibraries' };
    await mount(scenario, compact);
    const search = container.querySelector('input[aria-label="搜索分支设定对话"]');
    expect(search).toBeTruthy();
    await fill(search, '合成');
    expect(container.querySelector('[role=status]').textContent).toContain('正在读取分支设定');
    expect(container.textContent).not.toContain('还没有分支设定');
    await act(async () => resolveRead([{ sessionId: 'synthetic-session', title: '合成分支', library: { entries: [], groups: [] } }]));
    expect(container.querySelector('input[aria-label="搜索分支设定对话"]')).toBe(search);
    expect(search.value).toBe('合成');
    expect([...container.querySelectorAll('[role=status]')].some(node => node.textContent.includes('读取中'))).toBe(false);
    expect(container.querySelector('.dynamic-settings-conversation-row')).toBeTruthy();

    await act(async () => root.unmount()); root = createRoot(container);
    await mount(scenario, compact);
    const retrySearch = container.querySelector('input[aria-label="搜索分支设定对话"]');
    await fill(retrySearch, '保留查询');
    await act(async () => rejectRead(new Error('合成分支读取失败')));
    expect(container.querySelector('input[aria-label="搜索分支设定对话"]')).toBe(retrySearch);
    expect(retrySearch.value).toBe('保留查询');
    // 失败面同时给文案与码（状态里存的是失败本身）。
    const readFailure = container.querySelector('[role=alert]');
    expect(readFailure.textContent).toContain('合成分支读取失败');
    expect(readFailure.textContent).toContain('eleckoi/internal');
    expect(container.textContent).not.toContain('还没有分支设定');
  });
  it('selects folders, creates within them and returns from editing without losing selection', async () => {
    let library = { characterId: 'synthetic-character', entries: [], groups: [{ ...createGroupDraft('', 1, new Set()), id: 'folder-a', name: '合成文件夹' }],
      promptPositions: [], versions: [], activeVersionId: 'main', expandedGroupIds: [], listAllExpanded: false };
    const model = { subscribe: () => () => {}, readConversations: async () => [{ sessionId: 'synthetic-session', title: '合成分支', characterName: '合成角色', updatedAt: '2026-10-01T00:00:00Z', library }],
      saveConversation: vi.fn(async (_character, _session, value) => { library = value; }) };
    await mount({ setup: () => model, Component: DynamicSettingsPanel, modelProp: 'settingLibraries' });
    await act(async () => container.querySelector('.dynamic-settings-conversation-row').click());
    await act(async () => container.querySelector('.dynamic-settings-tree-row').click());
    expect(container.querySelector('.editor-page-detail')).toBeNull();
    expect(container.querySelector('.dynamic-settings-tree-toolbar').textContent).not.toContain('新建');
    await click('新建'); await click('设定');
    expect(container.querySelector('.editor-page-detail')).toBeTruthy();
    await act(async () => controller.current.save());
    const draft = model.saveConversation.mock.lastCall[2];
    expect(draft.entries[0].groupId).toBe('folder-a');
    await click('返回');
    expect(container.querySelector('.editor-page-detail')).toBeNull();
    expect(container.querySelector('.dynamic-settings-tree-row[aria-selected=true]').textContent).toContain('新建设定');
    await act(async () => container.querySelector('.dynamic-settings-tree-row[aria-selected=true]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(container.querySelector('.editor-page-detail')).toBeTruthy();
    await click('返回');
    await click('移动'); await click('粘贴');
    await act(async () => controller.current.save());
    expect(model.saveConversation.mock.lastCall[2].entries[0].groupId).toBe('');
  });
});

describe('Editor loading toolbar', () => {
  it.each(scenarios.flatMap(scenario => [true, false].flatMap(compact => ['ready', 'error'].map(outcome => ({ ...scenario, compact, outcome })))) )('$name keeps the same search input and query while its data loads (compact=$compact, $outcome)', async scenario => {
    const model = scenario.setup(); const value = model.getSnapshot().value;
    let complete, rejectRead, listener;
    let snapshot = { status: 'loading', value: null };
    model.getSnapshot = () => snapshot;
    model.subscribe = callback => { listener = callback; return () => {}; };
    const pendingRead = new Promise((resolve, reject) => { rejectRead = reject; complete = loaded => { snapshot = { status: 'ready', value: loaded }; listener('configuration', 'synthetic-character', snapshot); resolve(loaded); }; });
    model.read = () => pendingRead;
    await mount({ ...scenario, setup: () => model }, scenario.compact);
    const input = container.querySelector(`input[aria-label="${scenario.search}"]`);
    expect(input).toBeTruthy();
    if (!scenario.compact && scenario.search === '搜索设定') {
      await click('设定库更多操作');
      expect([...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent === '管理设定库').disabled).toBe(true);
      await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    } else if (!scenario.compact && scenario.search === '搜索变量') {
        await click('变量目录操作');
        expect([...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent === '管理版本与导入导出').disabled).toBe(true);
        await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
      } else if (!scenario.compact && scenario.search === '搜索正则') {
      await click('正则目录操作');
      expect([...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent === '管理版本与导入导出').disabled).toBe(true);
      await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    } else expect(container.querySelector('button[aria-label="管理"]')?.disabled).toBe(true);
    await fill(input, '合成');
    if (scenario.outcome === 'error') await act(async () => rejectRead(new Error('合成读取失败')));
    else await act(async () => complete(value));
    expect(container.querySelector(`input[aria-label="${scenario.search}"]`)).toBe(input);
    expect(input.value).toBe('合成');
    expect([...container.querySelectorAll('[role=status]')].some(node => node.textContent.includes('读取中'))).toBe(false);
    if (scenario.outcome === 'error') {
      const failure = !scenario.compact && scenario.search === '搜索正则' ? container.querySelector('.rs-directory-empty') : container.querySelector('[class$="-loading"][role=alert]');
      expect(failure.textContent).toContain('合成读取失败');
      if (!scenario.compact && scenario.search === '搜索设定') {
      await click('设定库更多操作');
      expect([...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent === '管理设定库').disabled).toBe(true);
      await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    } else if (!scenario.compact && scenario.search === '搜索变量') {
        await click('变量目录操作');
        expect([...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent === '管理版本与导入导出').disabled).toBe(true);
        await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
      } else if (!scenario.compact && scenario.search === '搜索正则') {
      await click('正则目录操作');
      expect([...document.querySelectorAll('[role=menuitem]')].find(e => e.textContent === '管理版本与导入导出').disabled).toBe(true);
      await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    } else expect(container.querySelector('button[aria-label="管理"]')?.disabled).toBe(true);
    }
  });
});
