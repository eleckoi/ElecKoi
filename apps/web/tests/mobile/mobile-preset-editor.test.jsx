// @vitest-environment jsdom
import React, { act } from 'react';
import { changeEditorText } from '../helpers/editorText.js';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { MobilePresetEditor } from '../../src/mobile/MobilePresetsPage.jsx';
import { PresetProvider, usePresets } from '../../src/modules/presets/components/PresetPanel.jsx';
import { PresetPromptEditor } from '../../src/modules/presets/components/PresetPromptEditor.jsx';
import { createEntryDraft, createGroupDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { withRequiredAgentPresetEntries, withRequiredAgentPresetPromptPositions } from '../../../../packages/shared/src/contracts/presets/builtIns';

let root, host, handlers, model, preset, guardRef, notification;
const button = name => [...document.querySelectorAll('button')].find(node => node.textContent === name || node.getAttribute('aria-label') === name);
const click = async node => { expect(node).toBeTruthy(); await act(async () => node.click()); };
const back = async () => act(async () => handlers.at(-1)());
const change = async (node, value) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0));
  document.documentElement.dataset.eleckoiMobile = 'true';
  window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  handlers = [];
  notification = vi.fn();
  guardRef = { current: null };
  const group = { ...createGroupDraft('', 1, new Set()), id: 'synthetic-group', name: '合成文件夹' };
  preset = {
    id: 'synthetic-preset', purpose: 'roleplay', name: '合成预设', profile: { authorName: '', authorAvatarPath: '', usageInstructions: '合成说明', timeline: [] },
    modelTags: [{ id: 'general', label: '通用' }], activeVersionId: 'synthetic-version', groups: [group], expandedGroupIds: [],
    entries: withRequiredAgentPresetEntries([{ ...createEntryDraft('', 2, []), id: 'synthetic-entry', title: '合成提示词' }]),
    promptPositions: withRequiredAgentPresetPromptPositions([]), roleplayPlan: { steps: ['合成任务', '输出正文'] },
    toolGroups: [{ id: 'synthetic-tool', name: '合成工具', description: '合成说明', source: 'built_in', included: true, enabled: true, members: [{ name: 'synthetic_read', description: '合成方法' }] }],
    regexRules: [{ id: 'synthetic-regex', name: '合成规则', pattern: '', replacement: '', targets: ['AiOutput'], enabled: true, displayOnly: false, promptOnly: false, runOnEdit: false, order: 0 }],
  };
  const catalog = { activePresetIds: { roleplay: preset.id, creator: 'synthetic-creator' }, presets: [preset], groups: [] };
  let snapshot = { status: 'ready', catalog, error: '' };
  const listeners = new Set();
  model = { subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot, refresh: async () => snapshot.catalog,
    adopt: next => { snapshot = { status: 'ready', catalog: next, error: '' }; for (const listener of listeners) listener(); },
    read: async () => structuredClone(preset),
    subscribeDetail: () => () => {}, save: vi.fn(async draft => structuredClone(draft)) };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  delete document.documentElement.dataset.eleckoiMobile;
  vi.unstubAllGlobals();
});
async function mount() {
  const view = { route: { kind: 'preset-editor' }, routeBusy: false, chat: { notify: notification }, characterConfiguration: { regexRules: { test: vi.fn(), editor: () => ({
      getSnapshot: () => ({ status: 'ready', value: { target: { scope: 'preset', ownerId: preset.id }, ownerRevision: '0'.repeat(64), globalRules: [], agentPresetRules: structuredClone(preset.regexRules), characterRules: [], versions: [], activeVersionId: '', revision: 0 } }), subscribe: () => () => {},
      read: async () => ({ target: { scope: 'preset', ownerId: preset.id }, ownerRevision: '0'.repeat(64), globalRules: [],
        agentPresetRules: structuredClone(preset.regexRules), characterRules: [], versions: [], activeVersionId: '', revision: 0 }),
      save: vi.fn(async value => value) }) } },
    registerBackHandler(handler) { handlers.push(handler); return () => handlers.splice(handlers.indexOf(handler), 1); }, goBack() {}, guardRef };
  function EditorRoute() {
    const { setSelectedPresetId } = usePresets();
    React.useEffect(() => setSelectedPresetId(preset.id), []);
    return <MobilePresetEditor />;
  }
  await act(async () => root.render(<MainPageContext.Provider value={view}><PresetProvider catalogModel={model} navigationGuardRef={guardRef}><EditorRoute /></PresetProvider></MainPageContext.Provider>));
}
async function section(name) {
  await click([...document.querySelectorAll('.character-editor-navigation button')].find(node => node.textContent === name));
}
const row = title => [...document.querySelectorAll('[role=treeitem]')].find(node => node.querySelector('.setting-library-tree-label')?.textContent === title);

describe('Android preset presentation', () => {
  it('saves usage and metadata through the top-right save and preserves update records', async () => {
    preset.profile.usageInstructions = '';
    preset.profile.timeline = [{ id: 'original-update', title: '原更新记录', note: '完整更新内容', dateLabel: '2026-11-12' }];
    await mount();
    expect(document.querySelector('.preset-content-composer')).toBeNull();
    expect(document.querySelector('.preset-basic-card .preset-profile-editor-actions')).toBeNull();
    await click(document.querySelector('.preset-usage-section .is-section-action'));
    expect(document.querySelector('.preset-content-composer button[type=submit]')).toBeNull();
    await act(async () => changeEditorText(document.querySelector('.preset-composer-writing .cm-editor'), '合成使用说明'));
    await click(document.querySelector('.mobile-preset-save'));
    expect(model.save.mock.lastCall[0].profile).toMatchObject({ usageInstructions: '合成使用说明', timeline: preset.profile.timeline });
    expect(notification).toHaveBeenCalledExactlyOnceWith('success', '预设已保存');
    await change(document.querySelector('.preset-basic-card input'), '合成预设修改');
    await click(document.querySelector('.mobile-preset-save'));
    expect(model.save.mock.lastCall[0].name).toBe('合成预设修改');
    expect(document.querySelector('.mobile-header').textContent).not.toContain('已保存');
  });

  it('saves metadata when an unchanged usage editor is open and keeps failed content for retry', async () => {
    await mount();
    await click(document.querySelector('.preset-usage-section .is-section-action'));
    await change(document.querySelector('.preset-basic-card input'), '改名仍需保存');
    await click(document.querySelector('.mobile-preset-save'));
    expect(model.save.mock.lastCall[0].name).toBe('改名仍需保存');
    await act(async () => changeEditorText(document.querySelector('.preset-composer-writing .cm-editor'), '失败后仍保留的说明'));
    model.save.mockRejectedValueOnce(new Error('合成保存失败'));
    await click(document.querySelector('.mobile-preset-save'));
    expect(document.querySelector('.mobile-preset-save').disabled).toBe(false);
    expect(document.querySelector('.preset-composer-writing .cm-editor')).toBeTruthy();
    await click(document.querySelector('.mobile-preset-save'));
    expect(model.save.mock.lastCall[0].profile.usageInstructions).toBe('失败后仍保留的说明');
  });

  it('offers activation with the explicit label while keeping top-right save', async () => {
    const catalog = model.getSnapshot().catalog;
    catalog.activePresetIds.roleplay = 'synthetic-other-preset';
    model.setActive = vi.fn(async id => ({ ...catalog, activePresetIds: { ...catalog.activePresetIds, roleplay: id } }));
    await mount();
    const activate = document.querySelector('.mobile-preset-activate');
    expect(activate.textContent).toBe('使用此预设');
    expect(document.querySelector('.mobile-preset-save').textContent).toBe('保存');
    expect(document.querySelector('.preset-profile-hero')).toBeNull();
    await click(activate);
    expect(model.setActive).toHaveBeenCalledExactlyOnceWith(preset.id);
    expect(document.querySelector('.mobile-preset-activate').textContent).toBe('使用中');
    expect(document.querySelector('.mobile-preset-activate').disabled).toBe(true);
  });

  it('reuses the collapsible character rail and keeps save on list and detail pages', async () => {
    await mount();
    expect(document.querySelectorAll('#preset-editor-navigation button')).toHaveLength(5);
    expect(document.querySelector('.preset-mobile-section-trigger')).toBeNull();
    await click(button('收起侧边栏'));
    expect(document.querySelector('.preset-workspace').classList.contains('is-sidebar-collapsed')).toBe(true);
    await click(button('展开侧边栏'));
    expect(document.querySelector('.preset-workspace').classList.contains('is-sidebar-collapsed')).toBe(false);
    await section('预设提示词');
    expect(document.querySelector('.mobile-preset-save').textContent).toBe('保存');
    await click(row('合成提示词')); await click(button('编辑'));
    expect(document.querySelector('.mobile-preset-save').textContent).toBe('保存');
    expect(document.querySelector('.mobile-editor-document')).toBeTruthy();
    expect(document.querySelector('.editor-page-list').hidden).toBe(true);
    await back();
    expect(document.querySelector('.editor-page-list').hidden).toBe(false);
    expect(document.querySelector('.mobile-editor-actions')).toBeTruthy();
  });

  it('selects before editing, returns to the same search and selection, and commits only through the outer save', async () => {
    await mount();
    await section('预设提示词');
    await change(document.querySelector('[aria-label="搜索提示词"]'), '合成');
    await click(row('合成提示词'));
    expect(document.querySelector('.mobile-editor-document')).toBeNull();
    await click(button('编辑'));
    expect(document.querySelector('.editor-page-list').hidden).toBe(true);
    expect(document.querySelector('.mobile-preset-save')).toBeTruthy();
    await change(document.querySelector('[placeholder="条目标题/待命名"]'), '合成提示词修改');
    await back();
    expect(document.querySelector('[aria-label="搜索提示词"]').value).toBe('合成');
    expect(row('合成提示词修改').getAttribute('aria-selected')).toBe('true');
    expect(model.save).not.toHaveBeenCalled();
    await click(button('保存'));
    expect(model.save).toHaveBeenCalledTimes(1);
    expect(model.save.mock.calls[0][0].entries.find(entry => entry.id === 'synthetic-entry').title).toBe('合成提示词修改');
    expect(notification).toHaveBeenCalledExactlyOnceWith('success', '预设已保存');
  });

  it('opens custom positions as a separate page and returns to insertion while keeping the outer preset draft', async () => {
    preset.entries.find(entry => entry.id === 'synthetic-entry').triggerMode = 'always';
    await mount();
    await section('预设提示词');
    await click(row('合成提示词'));
    await click(button('编辑'));
    await change(document.querySelector('[placeholder="条目标题/待命名"]'), '合成提示词修改');
    await click([...document.querySelectorAll('.setting-view-switch button')].find(node => node.textContent === '设置'));
    const scroller = document.querySelector('.mobile-editor-document');
    scroller.scrollTop = 120;
    await click(button('管理位置'));
    expect(document.querySelector('.mobile-header h1').textContent).toBe('自定义位置');
    expect(document.querySelector('.setting-position-back')).toBeNull();
    expect(document.querySelector('.setting-position-manager-header')).toBeNull();
    expect(document.querySelector('.setting-entry-heading')).toBeNull();
    expect(document.querySelector('.setting-view-switch')).toBeNull();
    expect(document.querySelector('.mobile-preset-save')).toBeTruthy();
    const createPosition = [...document.querySelectorAll('.mobile-header button')].find(node => node.textContent === '新建');
    expect(createPosition).toBeDefined();
    await click(createPosition);
    await change(document.querySelector('.setting-position-dialog input'), '合成位置');
    await click(document.querySelector('.setting-position-dialog button[type=submit]'));
    expect(model.save).not.toHaveBeenCalled();
    await back();
    await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    expect(document.querySelector('.setting-position-manager')).toBeNull();
    expect(document.querySelector('.mobile-header h1').textContent).toBe('合成提示词修改');
    expect(document.querySelector('.setting-insert-settings')).toBeTruthy();
    expect(scroller.scrollTop).toBe(120);
    expect(document.querySelector('.mobile-preset-save')).toBeTruthy();
    await click(button('管理位置'));
    await click(document.querySelector('.mobile-header [aria-label=返回]'));
    expect(document.querySelector('.setting-position-manager')).toBeNull();
    expect(document.querySelector('.setting-insert-settings')).toBeTruthy();
    await click([...document.querySelectorAll('.setting-view-switch button')].find(node => node.textContent === '正文'));
    expect(document.querySelector('.setting-writing-board .cm-editor')).toBeTruthy();
    expect(document.querySelector('.setting-position-guide')).toBeNull();
    await back();
    expect(document.querySelector('.mobile-header h1').textContent).toBe('预设');
    await click(button('保存'));
    expect(model.save).toHaveBeenCalledTimes(1);
    const saved = model.save.mock.calls[0][0];
    const savedPosition = saved.promptPositions.find(position => position.name === '合成位置');
    expect(savedPosition).toBeTruthy();
    expect(saved.entries.find(entry => entry.id === 'synthetic-entry')).toMatchObject({ title: '合成提示词修改', promptPositionId: savedPosition.id });
  });

  it('opens a prompt on double click without treating its switch as an edit action', async () => {
    await mount();
    await section('预设提示词');
    await act(async () => row('合成提示词').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(document.querySelector('.mobile-editor-document')).not.toBeNull();
    await back();
    const toggle = row('合成提示词').querySelector('[role=switch]');
    await act(async () => toggle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(document.querySelector('.mobile-editor-document')).toBeNull();
  });

  it('creates in the selected folder and allows moving an existing prompt with the shared tree operation', async () => {
    await mount();
    await section('预设提示词');
    await click(row('合成提示词'));
    await click(button('移动'));
    await click(row('合成文件夹'));
    await click(button('粘贴'));
    await click(button('保存'));
    expect(model.save.mock.calls[0][0].entries.find(entry => entry.id === 'synthetic-entry').groupId).toBe('synthetic-group');
    await click(row('合成文件夹'));
    await click(button('新建'));
    await click(button('提示词'));
    expect(document.querySelector('.mobile-editor-document')).not.toBeNull();
    await back();
    await click(button('保存'));
    expect(model.save.mock.calls[1][0].entries.find(entry => entry.title === '新建提示词').groupId).toBe('synthetic-group');
  });

  it('keeps the fixed prompt protection and existing disable confirmation', async () => {
    await mount();
    await section('预设提示词');
    await click(row('隐藏工具时间线'));
    expect(button('删除').disabled).toBe(true);
    expect(button('移动').disabled).toBe(true);
    await click(row('隐藏工具时间线').querySelector('[role=switch]'));
    expect(document.querySelector('[role=alertdialog]')).not.toBeNull();
    await click(button('取消'));
    expect(row('隐藏工具时间线').querySelector('[role=switch]').getAttribute('aria-checked')).toBe('true');
  });

  it('uses a full tool configuration page, restores the list, and discards changes with the existing tab guard', async () => {
    await mount();
    await section('工具');
    await click(document.querySelector('.preset-tool-summary'));
    expect(document.querySelector('.mobile-conversation-overlay.is-page')).not.toBeNull();
    await click(document.querySelector('.mobile-preset-tool-config [role=switch]'));
    await back();
    expect(document.querySelector('.mobile-preset-tool-config')).toBeNull();
    expect(document.querySelector('.preset-tool-toggle').getAttribute('aria-checked')).toBe('false');
    await section('正则');
    await click(button('不保存'));
    await section('工具');
    expect(document.querySelector('.preset-tool-toggle').getAttribute('aria-checked')).toBe('true');
    expect(model.save).not.toHaveBeenCalled();
  });

  it('selects a regex, edits on its own page, and returns without losing the draft', async () => {
    await mount();
    await section('正则');
    await click(document.querySelector('.regex-rule-row'));
    expect(document.querySelector('.regex-inspector')).toBeNull();
    await click(button('编辑'));
    await change(document.querySelector('[aria-label="规则名称"]'), '合成规则修改');
    await back();
    expect(document.querySelector('.regex-rule-row').textContent).toBe('合成规则修改');
    expect(document.querySelector('.regex-rule-row').classList.contains('is-selected')).toBe(true);
    expect(model.save).not.toHaveBeenCalled();
  });

  it('keeps immediate selection editing in the desktop presentation', async () => {
    await act(async () => root.render(<PresetPromptEditor preset={preset} onChange={() => {}} />));
    await click(row('合成提示词'));
    expect(document.querySelector('.setting-library-inspector')).not.toBeNull();
    expect(document.querySelector('.mobile-editor-actions')).toBeNull();
  });
});
