// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PresetListPanel, PresetProvider, PresetWorkspace } from '../../src/modules/presets/components/PresetPanel.jsx';
import { PresetOverview } from '../../src/modules/presets/components/PresetOverview.jsx';
import { PresetEditorWindow } from '../../src/app/windows/PresetEditorWindow.jsx';
import { WebSearchProvider } from '../../src/modules/agentTools/model/WebSearchContext.jsx';
import { openPresetEditorWindow } from '../../src/modules/presets/window/openPresetEditorWindow.js';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';

let root, host, model, stored, listeners, catalogListeners, snapshot;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  stored = { id: 'synthetic-preset', purpose: 'roleplay', name: '合成预设', profile: { authorName: '作者', usageInstructions: '合成说明', timeline: [] }, modelTags: [], promptPositions: [], groups: [], expandedGroupIds: [],
    entries: [{ ...createEntryDraft('',1,[]), id: 'synthetic-entry', title: '合成提示词', content: '完整合成正文' }],
    toolGroups: [{ id: 'builtin:variables', name: '剧情变量', description: '合成说明', source: 'built_in', included: true, enabled: true, members: [{ name: 'synthetic_read', description: '合成工具' }] }], regexRules: [] };
  listeners = new Set(); catalogListeners = new Set(); snapshot = { status: 'ready', catalog: { presets: [stored], groups: [], activePresetIds: { roleplay: 'another-preset', creator: '' } } };
  model = { getSnapshot: () => snapshot, subscribe: fn => { catalogListeners.add(fn); return () => catalogListeners.delete(fn); }, refresh: async () => snapshot.catalog, adopt: value => { snapshot = { status: 'ready', catalog: value }; catalogListeners.forEach(fn => fn()); },
    read: vi.fn(async () => stored), subscribeDetail: (_id, fn) => { listeners.add(fn); return () => listeners.delete(fn); }, getDetailSnapshot: () => ({ status: 'ready', preset: stored }),
    save: vi.fn(async value => { stored = structuredClone(value); return stored; }), setActive: vi.fn(async id => ({ ...snapshot.catalog, activePresetIds: { roleplay: id, creator: '' } })) };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const click = async element => { expect(element).toBeTruthy(); await act(async () => element.click()); };
const textButton = label => [...document.querySelectorAll('button')].find(element => element.textContent === label);
async function mountList() {
  await act(async () => root.render(<PresetProvider catalogModel={model}><PresetListPanel /><PresetOverview /></PresetProvider>));
}
async function requestDelete() {
  await act(async () => host.querySelector('.preset-list-row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 160 })));
  await click([...document.querySelectorAll('[role=menuitem]')].find(element => element.textContent === '删除预设'));
}

it('requires explicit confirmation before deleting a preset and preserves failed deletion for retry', async () => {
  model.delete = vi.fn(async () => model.adopt({ ...snapshot.catalog, presets: [] }));
  await mountList(); await requestDelete();
  expect(model.delete).not.toHaveBeenCalled();
  expect(document.querySelector('[role=alertdialog]').textContent).toContain(stored.name);
  await click([...document.querySelectorAll('[role=alertdialog] button')].find(element => element.textContent === '取消'));
  expect(model.delete).not.toHaveBeenCalled();
  await requestDelete(); model.delete.mockRejectedValueOnce(new Error('合成删除失败'));
  await click([...document.querySelectorAll('[role=alertdialog] button')].find(element => element.textContent === '删除'));
  expect(document.querySelector('[role=alertdialog]').textContent).toContain('合成删除失败');
  expect(host.querySelector('.preset-list-row')).not.toBeNull();
  await click([...document.querySelectorAll('[role=alertdialog] button')].find(element => element.textContent === '删除'));
  expect(model.delete).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role=alertdialog]')).toBeNull();
});

it('selects a newly persisted preset without awaiting another catalog refresh and reports creation failures', async () => {
  await mountList();
  model.refresh = vi.fn(() => new Promise(() => {}));
  const created = { ...stored, id: 'synthetic-created', name: '合成新预设' };
  model.create = vi.fn(async () => { model.adopt({ ...snapshot.catalog, presets: [...snapshot.catalog.presets, created] }); return created; });
  await click(host.querySelector('[aria-label="新建预设"]'));
  await click(host.querySelector('.preset-create-menu button'));
  expect(host.querySelector('.preset-summary h1').textContent).toBe(created.name);
  expect(model.refresh).not.toHaveBeenCalled();
  model.create.mockRejectedValueOnce(new Error('合成新建失败'));
  await click(host.querySelector('[aria-label="新建预设"]')); await click(host.querySelector('.preset-create-menu button'));
  expect(host.textContent).toContain('合成新建失败');
});

async function mountEditor(section = 'profile', renderEditorSection) {
  await act(async () => root.render(<PresetProvider catalogModel={model} fixedPresetId={stored.id}><PresetWorkspace editorMode requestedTab={section}
    renderEditorSection={renderEditorSection} renderDesktopEditor={({ tab, body, onSectionChange, onClose }) => <main data-section={tab}><nav>{['profile','prompts','tools'].map(id => <button key={id} data-section={id} onClick={() => onSectionChange(id)}>{id}</button>)}</nav><button data-close onClick={onClose}>close</button>{body}</main>} /></PresetProvider>));
}

it('keeps display read-only and opens the selected preset in a stable independent window', async () => {
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  await act(async () => root.render(<PresetProvider catalogModel={model} fixedPresetId={stored.id}><PresetOverview /></PresetProvider>));
  expect(host.querySelector('.preset-usage-copy').textContent).toBe('合成说明');
  expect(host.querySelector('.preset-content-section-heading button')).toBeNull();
  expect(host.querySelector('.preset-workspace-tabs')).toBeNull();
  await click(host.querySelector('.preset-summary-edit'));
  const [url, name] = open.mock.calls[0];
  expect(new URL(url).searchParams.get('view')).toBe('preset-editor');
  expect(new URL(url).searchParams.get('preset')).toBe(stored.id);
  openPresetEditorWindow(stored.id, 'tools');
  expect(open.mock.calls[1][1]).toBe(name);
  model.setActive.mockRejectedValueOnce(new Error('合成启用失败'));
  await click(host.querySelector('.preset-summary-use')); expect(host.textContent).toContain('合成启用失败');
});

it('edits metadata, instructions and updates on one page and guards metadata before close', async () => {
  await mountEditor();
  expect(host.querySelector('.preset-basic-document .preset-profile-editor-avatar')).not.toBeNull();
  expect(host.querySelector('.preset-basic-document .preset-usage-section')).not.toBeNull();
  expect(host.querySelector('.preset-basic-document .preset-updates')).not.toBeNull();
  const input = host.querySelector('.preset-profile-editor-layout input');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'修改后的合成名称');input.dispatchEvent(new Event('input',{bubbles:true})); });
  await click(host.querySelector('[data-close]'));
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull();
  expect(model.save).not.toHaveBeenCalled();
});

it('keeps tool configuration in the right pane and retains draft on failed directory save', async () => {
  await mountEditor('tools');
  const directory = host.querySelector('.setting-directory'), documentPane = host.querySelector('.setting-document');
  expect(directory.querySelector('.setting-library-save-button')).not.toBeNull();
  expect(documentPane.querySelector('.setting-library-save-button')).toBeNull();
  await click(directory.querySelector('.preset-tool-summary'));
  expect(documentPane.querySelector('.preset-tool-config-inline')).not.toBeNull();
  expect(document.querySelector('.preset-tool-config-dialog')).toBeNull();
  await click(documentPane.querySelector('[role=switch]'));
  expect(directory.querySelector('[role=switch]').getAttribute('aria-checked')).toBe('false');
  model.save.mockRejectedValueOnce(new Error('合成保存失败'));
  await click(directory.querySelector('.setting-library-save-button'));
  expect(directory.querySelector('.setting-library-save-button').disabled).toBe(false);
  expect(documentPane.querySelector('[role=switch]').getAttribute('aria-checked')).toBe('false');
  await click(directory.querySelector('.setting-library-save-button'));
  expect(stored.toolGroups[0].enabled).toBe(false);
});

it('keeps inline tool details and reports failed main-window navigation without saving or replacing the editor', async () => {
  stored = { ...stored, toolGroups: [{ id: 'builtin:web', name: '联网搜索', description: '搜索网页', source: 'built_in', included: true, enabled: true, members: [] }] };
  const previousUrl = location.href;
  history.replaceState(null, '', `?view=preset-editor&preset=${stored.id}&section=tools`);
  const settings = { status: 'ready', mode: 'provider_native', writable: true, tavilyAvailable: true };
  const webSearch = { subscribe: () => () => {}, getSnapshot: () => settings, openPluginSettings: vi.fn(async () => {}) };
  try {
    await act(async () => root.render(<WebSearchProvider model={webSearch}><PresetEditorWindow presetCatalog={model} /></WebSearchProvider>));
    await click(host.querySelector('.preset-tool-summary'));
    await click(textButton('前往官方插件配置'));
    expect(webSearch.openPluginSettings).toHaveBeenCalledOnce();
    expect(host.querySelector('.preset-tool-config-inline .web-search-mode')).not.toBeNull();
    webSearch.openPluginSettings.mockRejectedValueOnce(new Error('合成主窗口未就绪'));
    await click(textButton('前往官方插件配置'));
    expect(host.querySelector('.web-search-config-message[role=alert]').textContent).toBe('合成主窗口未就绪');
    expect(textButton('前往官方插件配置').disabled).toBe(false);
    await click(textButton('前往官方插件配置'));
    expect(host.querySelector('.preset-tool-config-inline .web-search-mode')).not.toBeNull();
    expect(model.save).not.toHaveBeenCalled();
  } finally { history.replaceState(null, '', previousUrl); }
});

it('opens prompt content directly and keeps saving available after clearing selection', async () => {
  await mountEditor('prompts');
  expect(host.querySelector('.setting-document .setting-writing-board')).not.toBeNull();
  expect(host.querySelector('.setting-library-entry-tabs')).toBeNull();
  await click(textButton('设置'));
  expect(host.querySelector('.setting-document').textContent).toContain('读取与触发');
  await act(async () => host.querySelector('.preset-prompt-tree').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0})));
  expect(host.querySelector('.setting-document-empty')).not.toBeNull();
  expect(host.querySelector('.setting-directory .setting-library-save-button')).not.toBeNull();
});

it('refreshes display content from the existing catalog subscription and releases it on unmount', async () => {
  await act(async () => root.render(<PresetProvider catalogModel={model} fixedPresetId={stored.id}><PresetOverview /></PresetProvider>));
  await act(async () => { stored = { ...stored, name: '外部已保存名称', profile: { ...stored.profile, usageInstructions: '外部已保存说明' } };model.adopt({ ...snapshot.catalog, presets: [stored] }); });
  expect(host.querySelector('h1').textContent).toBe(stored.name);
  expect(host.querySelector('.preset-usage-copy').textContent).toBe('外部已保存说明');
  await act(async () => root.render(null)); expect(listeners.size).toBe(0); expect(catalogListeners.size).toBe(0);
});

it('shows the ready catalog on every entry without waiting for refresh or reading full prompt and script content', async () => {
  const { entries, regexRules, toolGroups, ...summary } = stored;
  snapshot = { ...snapshot, catalog: { ...snapshot.catalog, presets: [summary], activePresetIds: { roleplay: stored.id, creator: '' } } };
  model.refresh = vi.fn(() => new Promise(() => {}));
  model.read.mockImplementation(() => new Promise(() => {}));
  const firstFrames = [];
  function FirstFrameOverview() {
    React.useLayoutEffect(() => { firstFrames.push(host.querySelector('.preset-summary h1')?.textContent); }, []);
    return <PresetOverview />;
  }
  for (let visit = 0; visit < 3; visit++) {
    await act(async () => root.render(<PresetProvider catalogModel={model}><FirstFrameOverview /></PresetProvider>));
    expect(host.querySelector('.preset-summary h1')?.textContent).toBe(stored.name);
    expect(host.querySelector('.preset-usage-copy')?.textContent).toBe(stored.profile.usageInstructions);
    expect(model.read).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
    await act(async () => root.render(null));
  }
  expect(firstFrames).toEqual([stored.name, stored.name, stored.name]);
});

it.each(['creator', 'roleplay'])('preserves the purpose-specific prompt controls in the new workspace (%s)', async purpose => {
  stored = { ...stored, purpose, entries: stored.entries.map(entry => ({ ...entry, triggerMode: 'agent_tool' })) };
  await mountEditor('prompts'); await click(textButton('设置'));
  expect(Boolean(host.querySelector('[aria-label="关键词命中"]'))).toBe(purpose === 'roleplay');
  await click(textButton('必读'));
  await click(host.querySelector('.setting-directory .setting-library-save-button'));
  expect(stored.entries[0].agentReadStrategy).toBe('required');
});

it('retains the original profile and introduction extension seats in the merged basic page', async () => {
  const render = vi.fn((_section, _owner, fallback) => fallback);
  await mountEditor('profile', render);
  expect(render.mock.calls.some(([section, owner]) => section === 'profile' && owner.presetId === stored.id)).toBe(true);
  expect(render.mock.calls.some(([section, owner]) => section === 'introduction' && owner.presetId === stored.id)).toBe(true);
});
