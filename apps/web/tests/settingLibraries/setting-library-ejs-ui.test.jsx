// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { referencedEjsTitles } from '../../src/modules/settingLibraries/components/SettingEntryFields.jsx';
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
    `);
    expect([...titles]).toEqual(['第一章', '第二章']);
  });

  it.each([false, true])('uses the existing content format menu for a reference and retains its body (compact=%s)', async compact => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    let draft;
    const body = '合成正文 <%= getvar("score") %>';
    function Harness() {
      const [entry, setEntry] = useState(() => ({ ...createEntryDraft('', 1, [], 'reference'), title: '合成引用', content: body }));
      draft = entry;
      return <EditorPresentationContext.Provider value={{ compact }}><SettingLibraryDocument selected={{ kind: 'entry', value: entry }}
        library={{ entries: [entry], promptPositions: [] }} onUpdateEntry={setEntry} onOpenEntry={() => {}} /></EditorPresentationContext.Provider>;
    }
    await act(async () => root.render(<Harness />));
    const formatButton = () => container.querySelector('.setting-content-tools .setting-format-button');
    expect(formatButton()).not.toBeNull();
    expect(formatButton().textContent).toBe('文字');
    await act(async () => formatButton().click());
    const ejsOption = [...document.querySelectorAll('[role="menuitem"]')].find(node => node.textContent.trim() === 'EJS');
    expect(ejsOption).toBeTruthy();
    await act(async () => ejsOption.click());
    expect(draft.contentMode).toBe('ejs');
    expect(draft.dynamicMode).toBe('ejs_reference');
    expect(draft.content).toBe(body);
    expect(formatButton().textContent).toBe('EJS');
    expect(container.querySelector('.cm-content[aria-label="EJS引用正文"]').textContent).toBe(body);
    await act(async () => formatButton().click());
    await act(async () => [...document.querySelectorAll('[role="menuitem"]')].find(node => node.textContent.trim() === '文字').click());
    expect(draft.contentMode).toBe('plain_text');
    expect(draft.content).toBe(body);
  });
});
