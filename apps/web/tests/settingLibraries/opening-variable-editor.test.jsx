import { editorText } from '../helpers/editorText.js';
import { createCharacterOpenings, characterOpeningsSchema } from '../../../../packages/shared/src/contracts/characterOpenings/schemas';
// @vitest-environment jsdom
import React, { act, useState, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpeningEditor } from '../../src/modules/characterOpenings/components/OpeningEditor.jsx';
import { BranchSettingsSplitView } from '../../src/modules/settingLibraries/components/BranchSettingsSplitView.jsx';
import { SettingLibraryPanel } from '../../src/modules/settingLibraries/components/SettingLibraryPanel.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { CharacterOpeningsPanel } from '../../src/modules/characterOpenings/components/CharacterOpeningsPanel.jsx';
import { normalizeSettingLibrary } from '../../../../packages/host/product-data/src/domain/settingLibraries/settingLibraryNormalization';

vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

async function render(component) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(component));
  return { container, root, async dispose() { await act(async () => root.unmount()); container.remove(); } };
}

describe('opening configuration editor', () => {
  it('edits and reopens character openings on a separate page, preserving settings, multiple openings and variable bindings', async () => {
    let stored = createCharacterOpenings('synthetic-character');
    const setting = { ...createEntryDraft('', 1, []), id: 'synthetic-setting', title: '合成设定', content: '合成长正文。'.repeat(2000) };
    const settings = normalizeSettingLibrary('synthetic-character', { ...normalizeSettingLibrary('synthetic-character'), entries: [setting] });
    const openingBefore = structuredClone(stored);
    const model = { getSnapshot: () => ({ status: 'ready', value: structuredClone(stored) }), subscribe: () => () => {},
      read: async () => structuredClone(stored), save: vi.fn(async (_id, draft) => {
        stored = characterOpeningsSchema.parse(draft);
        return structuredClone(stored);
      }) };
    const settingsModel = { getSnapshot: () => ({ status: 'ready', value: settings }), subscribe: () => () => {}, read: async () => settings, saveViewState: vi.fn() };
    const variables = { getSnapshot: () => ({ status: 'ready', value: { versions: [{ id: 'synthetic-variable-version', name: '合成变量版本' }] } }),
      read: async () => {}, subscribe: () => () => {} };
    const controller = createRef();
    const view = await render(<CharacterOpeningsPanel ref={controller} characterId="synthetic-character" openings={model} variables={variables} />);
    try {
      expect(view.container.querySelectorAll('.opening-list-item')).toHaveLength(1);
      await act(async () => view.container.querySelector('button[aria-label="新建开场白"]').click());
      const select = view.container.querySelector('select');
      await act(async () => { select.value = 'synthetic-variable-version'; select.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(view.container.querySelector('[role="switch"]')).toBeNull();
      model.save.mockRejectedValueOnce(new Error('合成保存失败'));
      await act(async () => expect(controller.current.save()).resolves.toBe(false));
      expect(view.container.querySelectorAll('.opening-list-item')).toHaveLength(2);
      expect(stored).toEqual(openingBefore);
      await act(async () => expect(controller.current.save()).resolves.toBe(true));
      const savedOpening = structuredClone(stored);
      expect(savedOpening.enabled).toBe(true);
      expect(savedOpening.openingMessages[1].variableVersionId).toBe('synthetic-variable-version');
      expect(settings.entries.find(entry => entry.id === setting.id)).toEqual({ ...setting, updatedAt: expect.any(String) });
      await act(async () => view.root.render(<SettingLibraryPanel characterId="synthetic-character" settingLibraries={settingsModel} />));
      expect([...view.container.querySelectorAll('[role="treeitem"]')].map(node => node.textContent)).toEqual(['合成设定']);
      expect(view.container.querySelector('.setting-library-opening-editor')).toBeNull();
      await act(async () => view.root.render(<CharacterOpeningsPanel ref={controller} characterId="synthetic-character" openings={model} variables={variables} />));
      expect(view.container.querySelectorAll('.opening-list-item')).toHaveLength(2);
      await act(async () => view.container.querySelectorAll('.opening-list-item')[1].click());
      expect(view.container.querySelector('select').value).toBe('synthetic-variable-version');
      await act(async () => view.container.querySelector('button[aria-label="新建开场白"]').click());
      await act(async () => controller.current.discard());
      expect(view.container.querySelectorAll('.opening-list-item')).toHaveLength(2);
      expect(stored).toEqual(savedOpening);
    } finally { await view.dispose(); }
  });

  it('searches titles and body without editing the library, preserves source ordering and reveals new openings', async () => {
    let stored = { ...createCharacterOpenings('synthetic-search-character'), enabled: false,
      defaultOpeningMessageId: 'primary', openingMessages: [
        { id: 'primary', title: '合成主开场', content: '主正文' },
        { id: 'middle', title: 'Synthetic SECOND', content: '正文中的末尾关键词', variableVersionId: 'version-a' },
        { id: 'last', title: '合成末条', content: '合成其他正文' },
      ] };
    const original = structuredClone(stored), controller = createRef(), dirtyChanged = vi.fn();
    const model = { getSnapshot: () => ({ status: 'ready', value: stored }), subscribe: () => () => {}, read: async () => stored,
      save: vi.fn(async (_id, value) => { stored = structuredClone(value); return stored; }) };
    const view = await render(<CharacterOpeningsPanel ref={controller} characterId={stored.characterId} openings={model} onDirtyChange={dirtyChanged} />);
    const search = view.container.querySelector('input[aria-label="搜索开场白"]');
    const fill = async value => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, value);
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    try {
      expect(view.container.querySelector('[role="switch"]')).toBeNull();
      await fill(' second ');
      expect([...view.container.querySelectorAll('.opening-list-name')].map(node => node.textContent)).toEqual(['Synthetic SECOND']);
      await act(async () => view.container.querySelector('.opening-list-item').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })));
      const menuAction = text => [...document.querySelectorAll('[role=menuitem]')].find(button => button.textContent === text);
      expect(menuAction('上移').disabled).toBe(true);
      expect(menuAction('下移').disabled).toBe(false);
      await fill('末尾关键词');
      expect(view.container.querySelectorAll('.opening-list-item')).toHaveLength(1);
      await fill('没有这个内容');
      expect(view.container.querySelector('[role="status"]').textContent).toBe('没有匹配的开场白');
      expect(model.save).not.toHaveBeenCalled();
      expect(dirtyChanged.mock.calls.every(([dirty]) => !dirty)).toBe(true);
      expect(stored).toEqual(original);
      await fill('');
      expect(view.container.querySelectorAll('.opening-list-item')).toHaveLength(3);
      expect(view.container.querySelector('.opening-list-item.is-selected .opening-list-name').textContent).toBe('合成主开场');
      await fill('没有这个内容');
      await act(async () => view.container.querySelector('[aria-label="新建开场白"]').click());
      expect(search.value).toBe('');
      expect(view.container.querySelectorAll('.opening-list-item')).toHaveLength(4);
      expect(view.container.querySelector('.opening-list-item.is-selected .opening-list-name').textContent).toBe('未命名开场白');
      await act(async () => controller.current.save());
      expect(stored.defaultOpeningMessageId).toBe('primary');
      expect(stored.openingMessages.slice(0, 3)).toEqual(original.openingMessages);
      expect(stored.openingMessages).toHaveLength(4);
    } finally { await view.dispose(); }
  });

  it('binds openings independently and preserves the binding when duplicating an opening', async () => {
    const changed = vi.fn();
    function Harness() {
      const [entry, setEntry] = useState({ defaultOpeningMessageId: 'opening-a', openingMessages: [
        { id: 'opening-a', title: '开场 A', content: '', variableVersionId: 'version-a' },
        { id: 'opening-b', title: '开场 B', content: '', variableVersionId: '' },
      ] });
      return <OpeningEditor entry={entry} variableVersions={[{ id: 'version-a', name: '配置 A' }, { id: 'version-b', name: '配置 B' }]}
        onChange={(next) => { changed(next); setEntry(next); }} onRequestDelete={() => {}} />;
    }
    const view = await render(<Harness />);
    try {
      expect(view.container.querySelector('select').value).toBe('version-a');
      expect([...view.container.querySelector('select').options].filter((option) => !option.disabled).map((option) => option.value)).toEqual(['', 'version-a', 'version-b']);
      await act(async () => [...view.container.querySelectorAll('.setting-library-opening-toggle')][1].click());
      const select = view.container.querySelector('select');
      await act(async () => { select.value = 'version-b'; select.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(changed.mock.lastCall[0].openingMessages).toMatchObject([
        { variableVersionId: 'version-a' }, { variableVersionId: 'version-b' },
      ]);
      await act(async () => view.container.querySelector('.setting-library-opening-item.is-expanded [aria-label="复制开场白"]').click());
      expect(changed.mock.lastCall[0].openingMessages.at(-1).variableVersionId).toBe('version-b');
      await act(async () => { const current = view.container.querySelector('select'); current.value = ''; current.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(changed.mock.lastCall[0].openingMessages.at(-1).variableVersionId).toBe('');
    } finally { await view.dispose(); }
  });

  it('shows an unbound opening without inventing a version or changing its initial data', async () => {
    const changed = vi.fn();
    const entry = { defaultOpeningMessageId: 'opening-a', openingMessages: [
      { id: 'opening-a', title: '开场 A', content: '', variableVersionId: '' },
    ] };
    const view = await render(<OpeningEditor entry={entry}
      variableVersions={[{ id: 'version-b', name: '配置 B' }, { id: 'version-a', name: '配置 A' }]}
      onChange={changed} onRequestDelete={() => {}} />);
    try {
      const select = view.container.querySelector('select');
      expect(select.value).toBe('');
      expect(select.selectedOptions[0].textContent).toBe('不关联变量');
      expect(select.selectedOptions[0].disabled).toBe(false);
      expect([...select.options].filter((option) => !option.disabled).map((option) => [option.value, option.textContent]))
        .toEqual([['', '不关联变量'], ['version-b', '配置 B'], ['version-a', '配置 A']]);
      expect(view.container.textContent).not.toContain('当前变量版本');
      expect(changed).not.toHaveBeenCalled();
      await act(async () => { select.value = 'version-a'; select.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(changed.mock.lastCall[0].openingMessages[0]).toMatchObject({ variableVersionId: 'version-a' });
    } finally { await view.dispose(); }
  });

  it('keeps a missing binding visible and preserves data when no versions are available', async () => {
    const changed = vi.fn();
    const entry = { defaultOpeningMessageId: 'opening-a', openingMessages: [
      { id: 'opening-a', title: '开场 A', content: '', variableVersionId: 'missing-version' },
    ] };
    const view = await render(<OpeningEditor entry={entry} variableVersions={[]}
      onChange={changed} onRequestDelete={() => {}} />);
    try {
      const select = view.container.querySelector('select');
      expect(select.disabled).toBe(false);
      expect(select.value).toBe('missing-version');
      expect(select.selectedOptions[0].textContent).toBe('版本不存在');
      expect([...select.options].filter((option) => !option.disabled).map(option => option.value)).toEqual(['']);
      expect(changed).not.toHaveBeenCalled();
      await act(async () => { select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(changed.mock.lastCall[0].openingMessages[0].variableVersionId).toBe('');
    } finally { await view.dispose(); }
  });

  it('keeps a closing branch inspector inert until exit and handles a quick reopen without losing the editor', async () => {
    vi.useFakeTimers();
    const widthChanged = vi.fn();
    const content = (open) => <BranchSettingsSplitView preferredWidth={760} onWidthChange={widthChanged}>
      <section>设定目录</section>
      {open ? <aside><input aria-label="设定正文" defaultValue="合成正文" /></aside> : null}
    </BranchSettingsSplitView>;
    const view = await render(content(false));
    try {
      expect(view.container.querySelector('aside')).toBeNull();
      await act(async () => view.root.render(content(true)));
      const resizer = view.container.querySelector('[aria-label="调整编辑器宽度"]');
      expect(resizer.getAttribute('aria-valuemin')).toBe('520');
      expect(resizer.getAttribute('aria-valuenow')).toBe('737');
      await act(async () => view.root.render(content(false)));
      const closing = view.container.querySelector('.is-closing');
      expect(closing.hasAttribute('inert')).toBe(true);
      expect(closing.querySelector('input')).toBeTruthy();
      await act(async () => view.root.render(content(true)));
      await act(async () => vi.advanceTimersByTime(200));
      expect(view.container.querySelector('.is-closing')).toBeNull();
      expect(view.container.querySelector('input')).toBeTruthy();
      await act(async () => view.root.render(content(false)));
      await act(async () => vi.advanceTimersByTime(200));
      expect(view.container.querySelector('aside')).toBeNull();
    } finally { await view.dispose(); }
  });

  it('opens the new owner’s body when the same workspace is reused for another character', async () => {
    const libraries = Object.fromEntries(['first', 'second'].map(id => [id, normalizeSettingLibrary(id, { ...normalizeSettingLibrary(id), entries: [{ ...createEntryDraft('', 1, []), id: `entry-${id}`, title: id, content: `body-${id}` }] })]));
    const model = { getSnapshot: id => ({ status: 'ready', value: libraries[id] }), read: async id => libraries[id], subscribe: () => () => {}, saveViewState: async () => [] };
    const component = id => <SettingLibraryPanel characterId={id} settingLibraries={model} />;
    const view = await render(component('first'));
    try {
      expect(editorText(view.container.querySelector('[role=textbox][aria-label="设定正文"]'))).toBe('body-first');
      await act(async () => view.root.render(component('second')));
      expect(view.container.querySelector('input[aria-label="条目标题"]').value).toBe('second');
      expect(editorText(view.container.querySelector('[role=textbox][aria-label="设定正文"]'))).toBe('body-second');
    } finally { await view.dispose(); }
  });

  it('clamps the directory to leave room for writing and restores its preferred width', async () => {
    let measuredWidth = 1400;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: measuredWidth }));
    const library = { characterId: 'synthetic-character', name: '', entries: [
      { ...createEntryDraft('', 0, []), id: 'synthetic-setting', title: '合成设定', enabled: true },
    ], groups: [], promptPositions: [], versions: [], activeVersionId: 'library-a', expandedGroupIds: [], listAllExpanded: false };
    const model = { getSnapshot: () => ({ status: 'ready', value: library }), subscribe: () => () => {}, read: async () => library };
    const view = await render(<SettingLibraryPanel characterId="synthetic-character" settingLibraries={model} />);
    try {
      await act(async () => view.container.querySelector('[role="treeitem"]').click());
      const separator = view.container.querySelector('[aria-label="调整目录宽度"]');
      const width = () => Number(separator.getAttribute('aria-valuenow'));
      expect(width()).toBe(480);
      measuredWidth = 760;
      await act(async () => window.dispatchEvent(new Event('resize')));
      expect(width()).toBe(372);
      expect(separator.getAttribute('aria-valuemin')).toBe('260');
      expect(separator.getAttribute('aria-valuemax')).toBe('372');
      await act(async () => separator.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
      expect(width()).toBe(372);
      measuredWidth = 1400;
      await act(async () => window.dispatchEvent(new Event('resize')));
      expect(width()).toBe(480);
    } finally { await view.dispose(); }
  });
})
