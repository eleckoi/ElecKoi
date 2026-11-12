// @vitest-environment jsdom
import React, { act, createRef } from 'react';
import { editorVersionsFixture } from '../helpers/editorLibraryVersions.js';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { RegexRulesPanel } from '../../src/modules/regex/components/RegexRulesPanel.jsx';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const rule = { id: 'synthetic-global-rule', name: 'Synthetic global', pattern: 'text', replacement: '', targets: ['AiOutput'], enabled: true,
  displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 };
const type = async (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

describe('regex editor isolation and shared globals', () => {
  it.each([false, true])('shares globals, excludes cross-owner actions and preserves conflicting drafts with compact=%s', async compact => {
    let revision = 1, globalRules = [rule];
    const editors = new Map(), refs = [createRef(), createRef()];
    const snapshot = target => ({ status: 'ready', value: { target, ownerRevision: '0'.repeat(64), globalRules: structuredClone(globalRules),
      agentPresetRules: [], characterRules: [], versions: [], activeVersionId: '', revision }, error: '' });
    const model = { test: vi.fn(), editor: vi.fn((scope, ownerId) => {
      const target = { scope, ownerId }, listeners = new Set();
      const editor = { getSnapshot: () => snapshot(target), read: async () => snapshot(target).value,
        subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
        save: vi.fn(async value => {
          if (value.revision !== revision) throw new Error('Synthetic conflict');
          globalRules = structuredClone(value.globalRules); revision++;
          for (const entry of editors.values()) entry.notify();
          return snapshot(target).value;
        }), notify: () => listeners.forEach(listener => listener(snapshot(target))) };
      editor.versions = editorVersionsFixture('regex', () => editor.read(), async values => [await editor.save(values[0])], editor.subscribe);
      editors.set(scope, editor); return editor;
    }) };
    const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    try {
      await act(async () => root.render(<EditorPresentationContext.Provider value={{ compact }}>
        <div data-editor="character"><RegexRulesPanel characterId="synthetic-character" regexRules={model} ref={refs[0]} /></div>
        <div data-editor="preset"><RegexRulesPanel presetId="synthetic-inactive-preset" regexRules={model} ref={refs[1]} /></div>
      </EditorPresentationContext.Provider>));
      const panels = [...node.querySelectorAll('[data-editor]')];
      expect([...panels[0].querySelectorAll(compact ? '.editor-library-heading strong' : '.rs-library-heading > span')].map(item => item.textContent)).toEqual(['角色正则']);
      expect([...panels[1].querySelectorAll(compact ? '.editor-library-heading strong' : '.rs-library-heading > span')].map(item => item.textContent)).toEqual(['预设正则']);
      for (const panel of panels) {
        await act(() => [...panel.querySelectorAll('[role="tab"]')].find(tab => tab.textContent === '全局').click());
        await act(() => panel.querySelector('.regex-rule-row').dispatchEvent(new MouseEvent(compact ? 'dblclick' : 'click', { bubbles: true })));
        await act(() => panel.querySelector('[aria-label="当前规则操作"]').click());
        const moves = [...document.querySelectorAll('[role="menuitem"]')].filter(item => item.textContent.startsWith('移至')).map(item => item.textContent);
        expect(moves).toEqual([panel === panels[0] ? '移至角色正则' : '移至预设正则']);
        await act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

      }
      const name = index => panels[index].querySelector('.setting-document-heading input');
      await type(name(0), 'Synthetic accepted first');
      await act(async () => expect(await refs[0].current.save()).toBe(true));
      expect(name(1).value).toBe('Synthetic accepted first');
      await type(name(1), 'Synthetic unsaved draft');
      await act(() => [...panels[1].querySelectorAll('[role=tab]')].find(tab => tab.textContent === '预设').click());
      await act(() => [...panels[1].querySelectorAll('[role=tab]')].find(tab => tab.textContent === '全局').click());
      await act(() => panels[1].querySelector('.regex-rule-row').dispatchEvent(new MouseEvent(compact ? 'dblclick' : 'click', { bubbles: true })));
      expect(name(1).value).toBe('Synthetic unsaved draft');
      await type(name(0), 'Synthetic accepted second');
      await act(async () => expect(await refs[0].current.save()).toBe(true));
      expect(name(1).value).toBe('Synthetic unsaved draft');
      await act(async () => expect(await refs[1].current.save()).toBe(false));
      expect(globalRules[0].name).toBe('Synthetic accepted second');
      await act(() => refs[1].current.discard());
      expect(panels[1].textContent).toContain('Synthetic accepted second');
      expect(model.editor.mock.calls).toEqual([['character', 'synthetic-character'], ['preset', 'synthetic-inactive-preset']]);
    } finally { await act(() => root.unmount()); node.remove(); }
  });
});
