import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as inputPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import '../styles/editor-text-input.css';

/** One viewport owns the document; React receives content only after an edit. */
export const EditorTextInput = forwardRef(function EditorTextInput({ value, onChange, label, placeholder = '', disabled = false, readOnly = false, code = false, className = '', id }, ref) {
  const host = useRef(null), view = useRef(null), latest = useRef(null), documentValue = useRef(value), configuration = useRef(new Compartment());
  latest.current = { value, onChange };
  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    get value() { return latest.current.value; },
    select: () => view.current?.dispatch({ selection: { anchor: 0, head: view.current.state.doc.length } }),
    setSelectionRange: (anchor, head) => view.current?.dispatch({ selection: { anchor, head }, scrollIntoView: true }),
  }), []);
  const options = () => [
    EditorState.readOnly.of(disabled || readOnly), EditorView.editable.of(!disabled && !readOnly),
    EditorView.contentAttributes.of({ 'aria-label': label, 'aria-multiline': 'true', 'aria-readonly': String(readOnly), 'aria-disabled': String(disabled), spellcheck: 'false', ...(id ? { id } : {}) }),
    ...(placeholder ? [inputPlaceholder(placeholder)] : []),
    ...(!code ? [EditorView.lineWrapping] : []),
  ];
  useLayoutEffect(() => {
    const editor = new EditorView({ parent: host.current, state: EditorState.create({ doc: value, extensions: [
      history(), keymap.of([...defaultKeymap, ...historyKeymap]), configuration.current.of(options()),
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return;
        const text = update.state.doc.toString();
        documentValue.current = text;
        if (text !== latest.current.value) latest.current.onChange?.(text);
      }),
    ] }) });
    view.current = editor;
    return () => { editor.destroy(); view.current = null; };
  }, []);
  useLayoutEffect(() => {
    const editor = view.current;
    if (editor && documentValue.current !== value) { documentValue.current = value; editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } }); }
  }, [value]);
  useLayoutEffect(() => { view.current?.dispatch({ effects: configuration.current.reconfigure(options()) }); }, [label, placeholder, disabled, readOnly, code, id]);
  return <div ref={host} className={`editor-text-input${code ? ' is-code' : ''} ${className}`} />;
});
