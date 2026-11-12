// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PresetToolsEditor } from '../../src/modules/presets/components/PresetToolsEditor.jsx';
import { AgentToolsDialog } from '../../src/modules/chat/components/AgentToolsDialog.jsx';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';
import { MainPageContext } from '../../src/app/windows/MainPageContext.jsx';
import { agentToolGroups } from '../../../../packages/host/product-data/src/domain/agentTools/agentToolGroups';

const groups = [['builtin:setting-library', 4, 'eleckoi_read_setting_files'], ['builtin:variables', 4, 'eleckoi_read_variables'], ['builtin:creator', 3, 'eleckoi_call_capability']];

async function openToolManager() {
  let button=document.querySelector('.preset-tools-toolbar [aria-label="管理预设工具"]');
  if (!button) {
    await act(async () => document.querySelector('.preset-tools-toolbar [aria-label="管理"]').click());
    button=[...document.querySelectorAll('[role=menuitem]')].find(item=>item.textContent==='管理预设工具');
  }
  expect(button).toBeTruthy();
  await act(async () => button.click());
}

let root;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount()); document.body.replaceChildren();
  delete document.documentElement.dataset.eleckoiMobile; vi.unstubAllGlobals();
});

it.each([false, true])('keeps missing plugin references editable inside their plugin mobile=%s', async mobile => {
  const reference = { id: 'plugin-tool:synthetic_dice', name: '作者骰子', description: '插件工具', source: 'extension',
    members: [{ name: 'synthetic_dice', description: '掷骰子' }], plugin: { id: 'bundle:synthetic', name: '合成插件' }, included: true, enabled: true, available: false };
  let current;
  function Editor() {
    const [preset, update] = React.useState({ id: 'synthetic-plugin-preset', toolGroups: [...agentToolGroups(), reference] });
    current = preset;
    return <MainPageContext.Provider value={{ registerBackHandler: () => () => {} }}>
      <EditorPresentationContext.Provider value={{ compact: mobile }}><PresetToolsEditor preset={preset} onChange={update} /></EditorPresentationContext.Provider>
    </MainPageContext.Provider>;
  }
  await act(async () => root.render(<Editor />));
  const row = [...document.querySelectorAll('.preset-tool-row')].find(node => node.textContent.includes('合成插件'));
  expect(row.textContent).not.toContain('作者骰子');
  expect(document.querySelector('.preset-tools-list .preset-tool-include')).toBeNull();
  await act(async () => row.querySelector('.preset-tool-summary').click());
  expect(document.querySelector('.preset-plugin-tools-body').textContent).toContain('未加载');
  await act(async () => document.querySelector('.preset-plugin-tool-open').click());
  expect(document.querySelector('.preset-tool-config-body').textContent).toContain('仍可正常聊天');
  const input = document.querySelector('[aria-label="工具显示名称"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '新的作者名称');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(current.toolGroups.find(group => group.id === reference.id)?.name).toBe('新的作者名称');
  expect(current.toolGroups.find(group => group.id === reference.id)?.members[0].name).toBe('synthetic_dice');
});

it.each([false, true])('edits the shared preset draft directly and retains selections when the manager closes mobile=%s', async mobile => {
  const plugin = { id: 'bundle:synthetic-player', name: '玩家插件' };
  const extra = { id: 'plugin-tool:synthetic_extra', name: '玩家的额外工具', description: '', source: 'extension', plugin,
    members: [{ name: 'synthetic_extra', description: '' }], included: false, enabled: true, available: true };
  const other = { ...extra, id: 'plugin-tool:synthetic_other', name: '同插件的另一个工具', members: [{ name: 'synthetic_other', description: '' }] };
  const change = vi.fn();
  let current;
  function Editor() {
    const [preset, update] = React.useState({ toolGroups: agentToolGroups(), extraToolGroups: [extra, other] }); current = preset;
    return <MainPageContext.Provider value={{ registerBackHandler: () => () => {} }}><EditorPresentationContext.Provider value={{ compact: mobile }}>
      <PresetToolsEditor preset={preset} onChange={next => { change(next); update(next); }} />
    </EditorPresentationContext.Provider></MainPageContext.Provider>;
  }
  await act(async () => root.render(<Editor />));
  const row = document.querySelector('.preset-tool-row.is-plugin');
  expect(row.closest('.preset-tools-source').textContent).toContain('额外工具');
  await act(async () => row.querySelector('.preset-tool-summary').click());
  expect(document.querySelectorAll('.preset-plugin-tool-row')).toHaveLength(2);
  expect(document.querySelector('.preset-plugin-tools-body input[type=checkbox]')).toBeNull();
  await act(async () => document.querySelector('.preset-plugin-tool-open').click());
  expect(document.querySelector('.preset-tool-config-body [role=switch]')).toBeNull();
  expect(change).not.toHaveBeenCalled();
  await act(async () => document.querySelector(mobile ? '.mobile-preset-tool-config [aria-label="关闭"]' : '[aria-label="关闭"]').click());
  await act(async () => document.querySelector(mobile ? '.mobile-preset-plugin-tools [aria-label="关闭"]' : '[aria-label="关闭插件工具"]').click());
  const open = openToolManager;
  const choosePlugin = () => act(async () => {
    if (mobile) {
      const select = document.querySelector('select[aria-label="工具来源"]'); select.value = `plugin:${plugin.id}`;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else [...document.querySelectorAll('.preset-tool-manager-sources button')].find(button => button.textContent.includes(plugin.name)).click();
  });
  await open(); await choosePlugin();
  const manager = document.querySelector('[role="dialog"][aria-label="管理预设工具"]');
  expect(manager.textContent).not.toContain('应用修改');
  expect(manager.textContent).not.toContain('取消');
  expect(manager.querySelector('footer')).toBeNull();
  await act(async () => manager.querySelector('input[type=checkbox]').click());
  expect(change).toHaveBeenCalledTimes(1);
  expect(current.toolGroups.find(group => group.id === extra.id)).toMatchObject({ included: true, enabled: true });
  expect(document.querySelector('.preset-tool-row.is-plugin .preset-tool-count').textContent).toBe('1/2');
  await act(async () => document.querySelector(mobile ? '.mobile-preset-tool-manager [aria-label="关闭"]' : '[aria-label="关闭管理窗口"]').click());
  expect(current.extraToolGroups).toHaveLength(1);
  await open(); await choosePlugin();
  expect(document.querySelector('input[aria-label="选择：玩家的额外工具"]').checked).toBe(true);
  await act(async () => document.querySelector('input[aria-label="选择：玩家的额外工具"]').click());
  expect(current.toolGroups.some(group => group.id === extra.id)).toBe(false);
  expect(current.extraToolGroups).toHaveLength(2);
  expect(document.querySelectorAll('.preset-tool-manager-row')).toHaveLength(2);
  await act(async () => document.querySelector('input[aria-label="选择：同插件的另一个工具"]').click());
  expect(current.toolGroups.find(group => group.id === other.id)).toMatchObject({ included: true });
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role="dialog"][aria-label="管理预设工具"]')).toBeNull();
  expect(current.toolGroups.some(group => group.id === other.id)).toBe(true);
});

it.each([false, true])('preserves configuration and keeps removed missing references selectable until the manager closes mobile=%s', async mobile => {
  const plugin = { id: 'bundle:synthetic-batch', name: '合成工具插件' };
  const tool = (name, patch = {}) => ({ id: `plugin-tool:${name}`, name, description: '工具说明', source: 'extension', plugin,
    members: [{ name, description: '工具说明' }], included: true, enabled: true, available: true, ...patch });
  const removed = tool('synthetic_remove');
  const kept = tool('synthetic_keep', { name: '作者显示名称', enabled: false });
  const added = tool('synthetic_add', { included: false });
  const missing = tool('synthetic_missing', { available: false, plugin: { id: 'bundle:synthetic-absent', name: '缺失插件' } });
  const initial = { id: 'synthetic-batch', toolGroups: [...agentToolGroups(new Set(['builtin:web', 'builtin:variables'])).map(group => group.id === 'builtin:variables' ? { ...group, enabled: false } : group), removed, kept, missing],
    extraToolGroups: [added], autoIllustration: { enabled: true, modelConfigId: 'synthetic-model' } };
  let current;
  function Editor() {
    const [preset, update] = React.useState(initial); current = preset;
    return <MainPageContext.Provider value={{ registerBackHandler: () => () => {} }}><EditorPresentationContext.Provider value={{ compact: mobile }}>
      <PresetToolsEditor preset={preset} onChange={update} />
    </EditorPresentationContext.Provider></MainPageContext.Provider>;
  }
  await act(async () => root.render(<Editor />));
  await openToolManager();
  const source = (id, name) => act(async () => {
    if (mobile) {
      const select = document.querySelector('select[aria-label="工具来源"]'); select.value = id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else [...document.querySelectorAll('.preset-tool-manager-sources button')].find(button => button.textContent.includes(name)).click();
  });
  const toggle = name => act(async () => document.querySelector(`input[aria-label="选择：${name}"]`).click());
  await source(`plugin:${plugin.id}`, plugin.name);
  await toggle(kept.name); await toggle(kept.name);
  expect(current.toolGroups.find(group => group.id === kept.id)).toEqual(kept);
  await toggle(removed.name); await toggle(added.name);
  await source('built_in', '内置工具');
  await toggle(initial.toolGroups.find(group => group.id === 'builtin:web').name);
  await source('plugin:bundle:synthetic-absent', '缺失插件');
  await toggle(missing.name);
  expect(current.toolGroups.some(group => group.id === missing.id)).toBe(false);
  expect(document.querySelector('input[aria-label="选择：synthetic_missing"]').checked).toBe(false);
  await toggle(missing.name);
  expect(current.toolGroups.find(group => group.id === missing.id)).toEqual(missing);
  await toggle(missing.name);
  await act(async () => document.querySelector(mobile ? '.mobile-preset-tool-manager [aria-label="关闭"]' : '[aria-label="关闭管理窗口"]').click());
  expect(current.toolGroups.some(group => group.id === removed.id || group.id === missing.id)).toBe(false);
  expect(current.toolGroups.find(group => group.id === kept.id)).toEqual(kept);
  expect(current.toolGroups.find(group => group.id === added.id)).toMatchObject({ included: true, enabled: true });
  expect(current.toolGroups.find(group => group.id === 'builtin:web')).toMatchObject({ included: false, enabled: false });
  expect(current.toolGroups.find(group => group.id === 'builtin:variables')).toMatchObject({ included: true, enabled: false });
  expect(current.extraToolGroups).toEqual([{ ...removed, included: false, enabled: true }]);
  expect(current.toolModelConfigIds).toEqual(initial.toolModelConfigIds);
});

it('keeps a missing plugin as a reminder in the conversation tool dialog', async () => {
  const preset = { id: 'synthetic-missing', toolGroups: [{ id: 'plugin-tool:synthetic_missing', name: '缺失工具', description: '', source: 'extension',
    members: [{ name: 'synthetic_missing', description: '' }], included: true, enabled: true, available: false }] };
  const catalog = { refresh: async () => ({ activePresetIds: { roleplay: preset.id } }), read: async () => preset, save: vi.fn() };
  await act(async () => root.render(<MainPageContext.Provider value={{ registerBackHandler: () => () => {} }}>
    <AgentToolsDialog presetCatalog={catalog} onClose={() => {}} />
  </MainPageContext.Provider>));
  expect(document.querySelector('.agent-tool-row').textContent).toContain('缺少插件');
  await act(async () => document.querySelector('.agent-tool-open').click());
  expect(document.querySelector('[role=switch]').disabled).toBe(false);
  expect(catalog.save).not.toHaveBeenCalled();
});

it('shows player extras separately in the conversation dialog without saving them into the preset', async () => {
  const extra = { id: 'plugin-tool:synthetic_player', name: '玩家工具', description: '', source: 'extension', members: [{ name: 'synthetic_player', description: '' }], plugin: { id: 'bundle:player', name: '玩家插件' }, included: false, enabled: true, available: true };
  const preset = { id: 'synthetic-extras', toolGroups: agentToolGroups(), extraToolGroups: [extra] };
  const catalog = { refresh: async () => ({ activePresetIds: { roleplay: preset.id } }), read: async () => preset, save: vi.fn() };
  await act(async () => root.render(<MainPageContext.Provider value={{ registerBackHandler: () => () => {} }}><AgentToolsDialog presetCatalog={catalog} onClose={() => {}} /></MainPageContext.Provider>));
  const section = [...document.querySelectorAll('.agent-tools-membership')].find(section => section.querySelector('h3').textContent === '额外工具');
  expect(section.textContent).toContain('玩家插件');
  expect(section.textContent).not.toContain(extra.name);
  expect(section.querySelector('[role=switch]')).toBeNull();
  await act(async () => section.querySelector('.agent-tool-open').click());
  expect(document.querySelector('.agent-tools-list').textContent).toContain(extra.name);
  await act(async () => document.querySelector('.agent-tool-open').click());
  expect(document.querySelector('.agent-tool-detail [role=switch]')).toBeNull();
  expect(catalog.save).not.toHaveBeenCalled();
});

it.each(groups.flatMap(([id, count, reader]) => [false, true].map(mobile => ({ id, count, reader, mobile }))))
  ('keeps $id at $count tools and describes continuation in its existing reader mobile=$mobile', async ({ id, count, reader, mobile }) => {
    document.documentElement.dataset.eleckoiMobile = String(mobile);
    const preset = { id: 'synthetic-preset', toolGroups: agentToolGroups(new Set([id])) }, change = vi.fn();
    const original = structuredClone(preset);
    await act(async () => root.render(<MainPageContext.Provider value={{ registerBackHandler: () => () => {} }}>
      <EditorPresentationContext.Provider value={{ compact: mobile }}><PresetToolsEditor preset={preset} onChange={change} /></EditorPresentationContext.Provider>
    </MainPageContext.Provider>));
    expect(document.querySelectorAll('.preset-tool-row')).toHaveLength(1);
    await act(async () => document.querySelector('.preset-tool-summary').click());
    const body = document.querySelector('.preset-tool-config-body');
    expect(body.textContent).toContain(`包含 ${count} 个工具`);
    expect([...body.querySelectorAll('code')].map(node => node.textContent)).toContain(reader);
    const member = [...body.querySelectorAll('code')].find(node => node.textContent === reader).parentElement;
    expect(member.textContent).toContain('续读或搜索');
    expect(document.body.textContent).not.toContain('共用工具');
    expect(document.body.textContent).not.toContain('eleckoi_read_tool_result');
    expect(change).not.toHaveBeenCalled(); expect(preset).toEqual(original);
  });

it.each([false, true])('keeps the conversation tool dialog on the original creator group mobile=%s', async mobile => {
  document.documentElement.dataset.eleckoiMobile = String(mobile);
  const preset = { id: 'synthetic-creator', toolGroups: agentToolGroups(new Set(['builtin:creator'])) };
  const catalog = { refresh: async () => ({ activePresetIds: { creator: preset.id } }), read: async () => preset, save: vi.fn() };
  await act(async () => root.render(<MainPageContext.Provider value={{ registerBackHandler: () => () => {} }}>
    <AgentToolsDialog presetCatalog={catalog} purpose="creator" onClose={() => {}} />
  </MainPageContext.Provider>));
  expect(document.querySelectorAll('.agent-tool-row')).toHaveLength(1);
  await act(async () => document.querySelector('.agent-tool-open').click());
  const body = document.querySelector('.agent-tool-detail');
  expect(body.textContent).toContain('包含 3 个工具');
  expect(body.textContent).toContain('续读或搜索');
  expect(body.querySelector('[role=switch]')).toBeTruthy();
  expect(catalog.save).not.toHaveBeenCalled();
});
