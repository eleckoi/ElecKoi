// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { referencedEjsTitles } from '../../src/modules/settingLibraries/model/settingLibraryRules.js';
import { SettingLibraryTree, SettingTreeActionsContext } from '../../src/modules/settingLibraries/components/SettingLibraryTree.jsx';
import { treeNodes } from '../../src/modules/settingLibraries/model/settingLibraryTree.js';
import { SettingLibraryDocument } from '../../src/modules/settingLibraries/components/SettingLibraryDocument.jsx';
import { createEntryDraft } from '../../src/modules/settingLibraries/model/settingLibraryEditing.js';
import { EditorPresentationContext } from '../../src/ui/ui/EditorPresentationContext.jsx';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); root = undefined; });

describe('setting-library EJS editor', () => {
  it('recognizes both Android getwi call forms', () => {
    const titles = referencedEjsTitles(`
      <%- await getwi(null, "第一章") %>
      <%- await getwi('第二章') %>
      getwi('普通文字')
      <%# getwi('模板注释') %>
      <% // getwi('JS 注释') %>
      <% const example = "getwi('示例文字')"; %>
    `);
    expect([...titles]).toEqual(['第一章', '第二章']);
  });

  it.each([false, true])('detects EJS in the complete body and preserves the source when changing usage (compact=%s)', async compact => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    let draft;
    const original = '正文开头。\n正文结尾。';
    const body = '正文开头。\n<%= getvar("score") %><%- await getwi("商店/老板") %>\n正文结尾。';
    function Harness() {
      const [entry, setEntry] = useState(() => ({ ...createEntryDraft('', 1, []), title: '合成设定', content: original }));
      draft = entry;
      const group = { id: 'shop', name: '商店', parentId: '', treeViewOrder: 2 };
      const target = { ...createEntryDraft(group.id, 1, []), id: 'target', title: '老板' };
      const plain = { ...createEntryDraft('', 3, []), id: 'plain', title: '普通文字' };
      const library = { entries: [entry, target, plain], groups: [group], promptPositions: [] };
      return <EditorPresentationContext.Provider value={{ compact }}>
        <SettingTreeActionsContext.Provider value={{ updateEntryById: (_id, patch) => setEntry(item => ({ ...item, ...patch })) }}>
          <SettingLibraryTree nodes={treeNodes(library)} expandedIds={['group:shop']} />
        </SettingTreeActionsContext.Provider>
        <SettingLibraryDocument selected={{ kind: 'entry', value: entry }} library={library} onUpdateEntry={setEntry} />
      </EditorPresentationContext.Provider>;
    }
    await act(async () => root.render(<Harness />));
    const editable = () => container.querySelector('.cm-content');
    const editor = EditorView.findFromDOM(editable().closest('.cm-editor'));
    await act(async () => editor.dispatch({ changes: { from: 0, to: original.length, insert: body } }));
    expect(draft.contentMode).toBe('ejs');
    expect(container.querySelector('.setting-content-tools .setting-template-status')?.textContent).toBe('已识别 EJS');
    const row = title => [...container.querySelectorAll('[role="treeitem"]')].find(item => item.querySelector('.setting-library-tree-label')?.textContent === title);
    expect(row('合成设定').textContent).toContain('EJS无规则');
    expect(row('老板').textContent).toContain('EJS无规则');
    expect(row('老板').classList.contains('is-rule-inactive')).toBe(false);
    expect(row('普通文字').classList.contains('is-rule-inactive')).toBe(true);
    const tab = label => [...container.querySelectorAll('[role="tab"]')].find(item => item.textContent === label);
    await act(async () => tab('设置').click());
    const ruleSwitch = () => container.querySelector('[aria-label="启用触发规则"]');
    expect(ruleSwitch().getAttribute('aria-checked')).toBe('false');
    expect(tab('关键词触发')).toBeUndefined();
    await act(async () => ruleSwitch().click());
    await act(async () => tab('关键词触发').click());
    expect(draft.agentReadStrategy).toBe('keyword');
    expect(container.querySelector('details.setting-keyword-details').open).toBe(true);
    await act(async () => row('合成设定').querySelector('[role="switch"]').click());
    expect(ruleSwitch().getAttribute('aria-checked')).toBe('false');
    expect(draft.agentReadStrategy).toBe('keyword');
    expect(draft.content).toBe(body);
    expect(draft.contentMode).toBe('ejs');
    expect(container.querySelector('details.setting-keyword-details')).toBeNull();
    await act(async () => tab('正文').click());
    expect(EditorView.findFromDOM(editable().closest('.cm-editor')).state.doc.toString()).toBe(body);
  });
});
