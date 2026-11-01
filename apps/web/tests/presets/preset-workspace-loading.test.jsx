// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresetProvider, PresetWorkspace, usePresets, reconcilePresetToolRefresh } from '../../src/modules/presets/components/PresetPanel.jsx';
import { PresetPurposeSwitch } from '../../src/modules/presets/components/PresetPurposeSwitch.jsx';

const presets = ['roleplay', 'creator'].map(purpose => ({
  id: `synthetic-${purpose}`, purpose, name: `合成${purpose}预设`,
  profile: { authorName: '', authorAvatarPath: '', usageInstructions: `合成${purpose}说明`, timeline: [] },
  modelTags: [], entries: [], toolGroups: [], regexRules: [],
}));
const catalog = { activePresetIds: { roleplay: presets[0].id, creator: presets[1].id }, presets, groups: [] };
let root, host, model, requests, latestHeader;

function Controls() {
  const { purpose, setPurpose } = usePresets();
  return <PresetPurposeSwitch value={purpose} onChange={setPurpose} />;
}

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  requests = [];
  const snapshot = { status: 'ready', catalog, error: '' };
  model = {
    getSnapshot: () => snapshot, subscribe: () => () => {}, refresh: async () => catalog,
    subscribeDetail: () => () => {},
    read: vi.fn(id => new Promise((resolve, reject) => requests.push({ id, resolve, reject }))),
    save: vi.fn(async value => value), setActive: vi.fn(async () => catalog),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function mount() {
  await act(async () => root.render(<PresetProvider catalogModel={model}>
    <Controls />
    <PresetWorkspace renderHeader={header => { latestHeader = header; return null; }} />
  </PresetProvider>));
}

async function finishRead(request = requests.at(-1)) {
  await act(async () => request.resolve(structuredClone(presets.find(preset => preset.id === request.id))));
}

async function switchPurpose(purpose) {
  await act(async () => host.querySelectorAll('.preset-purpose-switch button')[purpose === 'creator' ? 1 : 0].click());
}

describe('preset workspace loading', () => {
  it('keeps tool selections in the shared draft until the outer save and preserves them after a save failure', async () => {
    const group = { id: 'builtin:variables', name: '合成变量工具', description: '工具说明', source: 'built_in', included: false, enabled: false, members: [{ name: 'synthetic_read' }] };
    await mount();
    await act(async () => requests.at(-1).resolve({ ...structuredClone(presets[0]), toolGroups: [group] }));
    await act(async () => [...host.querySelectorAll('.preset-workspace-tabs button')].find(button => button.textContent.startsWith('工具')).click());
    const saveButton = () => host.querySelector('.setting-library-save-button');
    expect(saveButton().disabled).toBe(true);
    await act(async () => host.querySelector('[aria-label="管理预设工具"]').click());
    await act(async () => document.querySelector('input[aria-label="选择：合成变量工具"]').click());
    expect(model.save).not.toHaveBeenCalled();
    expect(latestHeader.dirty).toBe(true);
    expect(saveButton().disabled).toBe(false);
    await act(async () => document.querySelector('[aria-label="关闭管理窗口"]').click());
    expect(host.querySelector('.preset-tool-row').textContent).toContain(group.name);
    model.save.mockRejectedValueOnce(new Error('合成保存失败'));
    await act(async () => saveButton().click());
    expect(model.save).toHaveBeenCalledTimes(1);
    expect(model.save.mock.calls[0][0].toolGroups[0]).toMatchObject({ included: true, enabled: true });
    expect(latestHeader.dirty).toBe(true);
    expect(host.querySelector('.preset-tool-row')).not.toBeNull();
    await act(async () => saveButton().click());
    expect(model.save).toHaveBeenCalledTimes(2);
    expect(latestHeader.dirty).toBe(false);
    expect(saveButton().disabled).toBe(true);
    await act(async () => host.querySelector('[aria-label="管理预设工具"]').click());
    await act(async () => document.querySelector('input[aria-label="选择：合成变量工具"]').click());
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    const reads = model.read.mock.calls.length;
    await switchPurpose('creator');
    expect(model.read).toHaveBeenCalledTimes(reads);
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(model.save).toHaveBeenCalledTimes(2);
    await act(async () => [...document.querySelectorAll('[role="alertdialog"] button')].find(button => button.textContent === '不保存').click());
    await finishRead();
    expect(model.save).toHaveBeenCalledTimes(2);
  });

  it('refreshes plugin availability without discarding drafts or treating it as an external preset edit', () => {
    const group = { id: 'plugin-tool:synthetic_roll', name: '骰子', members: [{ name: 'synthetic_roll' }], source: 'extension', enabled: true, included: true, available: true };
    const previous = { id: 'synthetic-preset', name: '原名', toolGroups: [group] };
    const draft = { ...previous, name: '未保存的名称', toolGroups: [{ ...group, enabled: false }] };
    const incoming = { ...previous, toolGroups: [{ ...group, available: false }] };
    expect(reconcilePresetToolRefresh(draft, previous, incoming)).toEqual({ ...draft, toolGroups: [{ ...draft.toolGroups[0], available: false }], extraToolGroups: [] });
    expect(reconcilePresetToolRefresh(draft, previous, { ...incoming, name: '其他窗口修改' })).toBeNull();
  });
  it('keeps the workspace without loading copy during its first read', async () => {
    await mount();
    expect(host.textContent).not.toContain('正在读取');
    expect(host.querySelector('.preset-workspace').getAttribute('aria-busy')).toBe('true');
    await finishRead();
    expect(host.querySelector('h1').textContent).toBe(presets[0].name);
  });

  it('keeps the mounted editor while changing purpose and commits the new detail together', async () => {
    await mount();
    await finishRead();
    const workspace = host.querySelector('.preset-workspace');
    const hero = host.querySelector('.preset-profile-hero');
    const editor = host.querySelector('.preset-usage-content');
    await switchPurpose('creator');
    expect(requests.at(-1).id).toBe(presets[1].id);
    expect(host.querySelector('.preset-workspace')).toBe(workspace);
    expect(host.querySelector('.preset-profile-hero')).toBe(hero);
    expect(host.querySelector('.preset-usage-content')).toBe(editor);
    expect(host.textContent).not.toContain('正在读取');
    expect(workspace.hasAttribute('inert')).toBe(true);
    expect(workspace.getAttribute('aria-busy')).toBe('true');
    expect(latestHeader.onActivate).toBeUndefined();
    await act(async () => latestHeader.onSave());
    expect(model.save).not.toHaveBeenCalled();
    await finishRead();
    expect(host.querySelector('.preset-workspace')).toBe(workspace);
    expect(host.querySelector('h1').textContent).toBe(presets[1].name);
    expect(host.textContent).toContain(presets[1].profile.usageInstructions);
    expect(workspace.hasAttribute('inert')).toBe(false);
    expect(workspace.getAttribute('aria-busy')).not.toBe('true');
    expect(model.setActive).not.toHaveBeenCalled();
  });

  it('ignores a late read after switching back to the other purpose', async () => {
    await mount();
    await finishRead();
    await switchPurpose('creator');
    const stale = requests.at(-1);
    await switchPurpose('roleplay');
    await finishRead();
    await finishRead(stale);
    expect(host.querySelector('h1').textContent).toBe(presets[0].name);
    expect(host.textContent).not.toContain(presets[1].profile.usageInstructions);
    expect(host.querySelector('.preset-workspace').hasAttribute('inert')).toBe(false);
  });

  it('shows a failed switch without discarding the previous editor or enabling its save action', async () => {
    await mount();
    await finishRead();
    const hero = host.querySelector('.preset-profile-hero');
    await switchPurpose('creator');
    await act(async () => requests.at(-1).reject(new Error('合成读取失败')));
    expect(host.querySelector('.preset-profile-hero')).toBe(hero);
    expect(host.querySelector('[role="alert"]').textContent).toContain('合成读取失败');
    expect(host.querySelector('.preset-workspace').hasAttribute('inert')).toBe(true);
    expect(latestHeader.onActivate).toBeUndefined();
    await act(async () => latestHeader.onSave());
    expect(model.save).not.toHaveBeenCalled();
    await switchPurpose('roleplay');
    await finishRead();
    expect(host.querySelector('.preset-workspace').hasAttribute('inert')).toBe(false);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('retains a diagnostic error when the first read fails', async () => {
    await mount();
    await act(async () => requests.at(-1).reject(new Error('合成首次读取失败')));
    expect(host.textContent).toContain('合成首次读取失败');
    expect(host.textContent).not.toContain('正在读取');
  });

  it('still asks about an unsaved introduction before starting a purpose switch', async () => {
    await mount();
    await finishRead();
    await act(async () => host.querySelector('.preset-usage-section button').click());
    const input = host.querySelector('textarea');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '合成未保存说明');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const readCount = model.read.mock.calls.length;
    await switchPurpose('creator');
    expect(model.read).toHaveBeenCalledTimes(readCount);
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(host.querySelector('textarea').value).toBe('合成未保存说明');
    await act(async () => [...document.querySelectorAll('[role="alertdialog"] button')].find(button => button.textContent === '不保存').click());
    expect(requests.at(-1).id).toBe(presets[1].id);
    expect(host.querySelector('h1').textContent).toBe(presets[0].name);
    await finishRead();
    expect(host.querySelector('h1').textContent).toBe(presets[1].name);
    expect(model.save).not.toHaveBeenCalled();
  });
});
