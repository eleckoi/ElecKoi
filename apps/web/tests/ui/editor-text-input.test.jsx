// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { EditorView } from '@codemirror/view';
import { undo, redo } from '@codemirror/commands';
import { EditorTextInput } from '../../src/ui/ui/EditorTextInput.jsx';
import { editorValueEqual } from '../../src/ui/utils/editorValueEqual.js';
import { changeEditorText, editorText } from '../helpers/editorText.js';
vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

describe('viewport editor and immutable drafts', () => {
  it('compares shared branches without serializing long unrelated documents and detects a restored value', () => {
    const source = '长文\n'.repeat(100000), toJSON = vi.fn(() => { throw Error('Do not serialize'); });
    const shared = { source, toJSON }, original = { documents: [shared], title: '原名' };
    expect(editorValueEqual({ ...original, title: '改名' }, original)).toBe(false);
    expect(editorValueEqual({ ...original }, original)).toBe(true);
    expect(editorValueEqual({ ...original, documents: [{ ...shared, source: source + '末尾' }] }, original)).toBe(false);
    expect(toJSON).not.toHaveBeenCalled();
  });
  it('keeps one view through edits and undo, accepts external resets, disables editing and destroys its DOM', async () => {
    const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
    let reset;
    function Page() { const [text, setText] = useState('初始\nconst a = 1;'); reset = setText; return <EditorTextInput label="合成长文" value={text} onChange={setText} code />; }
    try {
      await act(() => root.render(<Page />)); const content = host.querySelector('[role=textbox]'), view = EditorView.findFromDOM(content);
      await act(() => changeEditorText(content, '第一行\n中文和代码 <p>末尾</p>'));
      expect(EditorView.findFromDOM(host.querySelector('[role=textbox]'))).toBe(view);
      expect(editorText(content)).toBe('第一行\n中文和代码 <p>末尾</p>');
      await act(() => undo(view)); expect(editorText(content)).toBe('初始\nconst a = 1;');
      await act(() => redo(view)); expect(editorText(content)).toContain('<p>末尾</p>');
      await act(() => reset('外部重置')); expect(editorText(content)).toBe('外部重置');
      await act(() => root.render(<EditorTextInput label="合成长文" value="只读" disabled />));
      expect(host.querySelector('[role=textbox]').getAttribute('aria-disabled')).toBe('true');
    } finally { await act(() => root.unmount()); host.remove(); }
    expect(host.querySelector('.cm-editor')).toBeNull();
  });
});
