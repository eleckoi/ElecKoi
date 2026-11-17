// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VariableConfigManager } from '../../src/modules/variables/components/VariableConfigManager.jsx';
import { SettingLibraryManager } from '../../src/modules/settingLibraries/components/SettingLibraryManager.jsx';
import { createVariableDraft } from '../../src/modules/variables/model/variableConfigEditing.js';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.stubGlobal('React', React);
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
afterEach(() => vi.restoreAllMocks());

function configuration(kind, name) {
  const empty = { objects: [], variables: [] };
  const version = kind === 'variables' ? {
    id: 'version-a', name, initialStateJson: '{}', schemaCode: 'z.object({count:z.number()})',
    objects: [], variables: [{ ...createVariableDraft(empty), id: 'variable-a', title: 'count', type: 'number', defaultValue: '1' }],
    expandedObjectIds: [], createdAt: '', updatedAt: '',
  } : {
    id: 'version-a', name, entries: [{ ...createEntryDraft('', 0, []), id: 'entry-a', title: '设定 A', content: '合成正文 A' }],
    groups: [], promptPositions: [], listAllExpanded: true, expandedGroupIds: [], createdAt: '', updatedAt: '',
  };
  const second = kind === 'variables' ? {
    ...version, id: 'version-b', name: '配置 B', schemaCode: 'z.object({count:z.number().min(0)})',
    variables: version.variables.map(item => ({ ...item, id: 'variable-b', defaultValue: '8' })),
  } : { ...version, id: 'version-b', name: '配置 B', entries: [{ ...version.entries[0], id: 'entry-b', content: '合成正文 B' }] };
  return { ...version, characterId: 'synthetic-character', activeVersionId: version.id, versions: [version, second] };
}

function button(container, text) {
  const target = [...container.querySelectorAll('button')].find(item => item.textContent === text);
  expect(target).toBeTruthy();
  return target;
}

async function inputValue(input, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function renderManager(kind, initial) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const changed = vi.fn();
  const closed = vi.fn();
  function Harness() {
    const [config, setConfig] = useState(initial);
    const props = { onChange: next => { changed(next); setConfig(next); }, onClose: closed, onError: vi.fn() };
    return kind === 'variables' ? <VariableConfigManager config={config} {...props} />
      : <SettingLibraryManager characterId="synthetic-character" library={config} settingLibraries={{}} {...props} />;
  }
  await act(async () => root.render(<Harness />));
  return { container: document.body, changed, closed, async dispose() { await act(async () => root.unmount()); container.remove(); } };
}

describe.each(['variables', 'settings'])('%s version management', kind => {
  it.each(['配置 A', '', '配置 A · 副本'])('copies the selected version for %j through a name-only dialog', async name => {
    const view = await renderManager(kind, configuration(kind, name));
    try {
      expect([...view.container.querySelectorAll('button')].some(item => item.textContent === '新建版本')).toBe(false);
      await act(async () => view.container.querySelector('[aria-label="当前版本"]').click());
      await act(async () => [...view.container.querySelectorAll('[role="menuitem"]')].find(item => item.textContent.includes('配置 B')).click());
      await act(async () => button(view.container, '复制当前版本').click());
      const dialog = view.container.querySelector('.version-name-dialog');
      const input = dialog.querySelector('input');
      expect(input.value).toBe('');
      expect(dialog.querySelector('select, input[type="radio"]')).toBeNull();
      await act(async () => button(dialog, '复制').click());
      expect(dialog.querySelector('[role="alert"]').textContent).toBe('请输入版本名称');
      await inputValue(input, '配置 B');
      await act(async () => button(dialog, '复制').click());
      expect(dialog.querySelector('[role="alert"]').textContent).toBe('版本名称已存在');
      await inputValue(input, '配置 C');
      await act(async () => button(dialog, '复制').click());
      const result = view.changed.mock.lastCall[0];
      expect(result.versions).toHaveLength(3);
      expect(result.name).toBe('配置 C');
      expect(result.activeVersionId).not.toBe('version-b');
      if (kind === 'variables') {
        expect(result.schemaCode).toBe('z.object({count:z.number().min(0)})');
        expect(result.variables[0].defaultValue).toBe('8');
      } else expect(result.entries[0].content).toBe('合成正文 B');
      expect(view.container.querySelector('.version-name-dialog')).toBeNull();
      expect(view.container.querySelector('[aria-label="当前版本"]').textContent).toBe(result.versions.find(version => version.id === result.activeVersionId).name);
      await act(async () => button(view.container, '复制当前版本').click());
      expect(view.container.querySelector('.version-name-dialog input').value).toBe('');
      await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      expect(view.container.querySelector('.version-name-dialog')).toBeNull();
      expect(view.closed).not.toHaveBeenCalled();
    } finally { await view.dispose(); }
  });

  it('copies the latest unsaved active contents and leaves the source version intact', async () => {
    const initial = configuration(kind, '配置 A');
    if (kind === 'variables') initial.variables = initial.variables.map(item => ({ ...item, defaultValue: '9' }));
    else initial.entries = initial.entries.map(item => ({ ...item, content: '最新合成正文' }));
    const view = await renderManager(kind, initial);
    try {
      await act(async () => button(view.container, '复制当前版本').click());
      const dialog = view.container.querySelector('.version-name-dialog');
      await inputValue(dialog.querySelector('input'), '配置 C');
      await act(async () => button(dialog, '复制').click());
      const result = view.changed.mock.lastCall[0];
      const source = result.versions.find(item => item.id === 'version-a');
      if (kind === 'variables') {
        expect(result.variables[0].defaultValue).toBe('9');
        expect(source.variables[0].defaultValue).toBe('9');
      } else {
        expect(result.entries[0].content).toBe('最新合成正文');
        expect(source.entries[0].content).toBe('最新合成正文');
      }
    } finally { await view.dispose(); }
  });

  it('creates a blank version without copying the selected contents and can cancel without changing data', async () => {
    const view = await renderManager(kind, configuration(kind, '配置 A'));
    try {
      await act(async () => button(view.container, '创建空白版本').click());
      await act(async () => button(view.container.querySelector('.version-name-dialog'), '取消').click());
      expect(view.changed).not.toHaveBeenCalled();
      await act(async () => button(view.container, '创建空白版本').click());
      const dialog = view.container.querySelector('.version-name-dialog');
      await inputValue(dialog.querySelector('input'), '配置 C');
      await act(async () => button(dialog, '创建').click());
      const result = view.changed.mock.lastCall[0];
      expect(result.name).toBe('配置 C');
      expect(result.versions).toHaveLength(3);
      if (kind === 'variables') {
        expect(result.variables).toEqual([]);
        expect(result.schemaCode).toBe('');
      } else {
        expect(result.entries).toEqual([]);
        expect(result.groups).toEqual([]);
      }
    } finally { await view.dispose(); }
  });
});
