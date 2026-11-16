import { useEffect, useRef } from 'react';

const textEditors = '[data-composer-input], .message-inline-editor textarea';

/** Editor focus preserves the DSH caret; only a text press requests the Android IME. */
// RETIRE WHEN: the native editor offers Android keyboard-intent control for
// programmatic/toolbar focus and foreground restoration. Its current focus
// helpers always DOM-focus the editor; keeping that caret must not request IME.
export function MobileConversationPage({ children }) {
  const inputModes = useRef(new Map());
  const requestedInput = useRef(null);
  const root = useRef(null);
  useEffect(() => {
    function suspendInput() {
      requestedInput.current = null;
      for (const input of root.current?.querySelectorAll(textEditors) ?? []) suppressKeyboard(input);
      for (const input of inputModes.current.keys()) {
        if (!root.current?.contains(input)) inputModes.current.delete(input);
      }
    }
    document.addEventListener('visibilitychange', suspendInput);
    window.addEventListener('blur', suspendInput);
    window.addEventListener('focus', suspendInput);
    window.addEventListener('pagehide', suspendInput);
    return () => {
      document.removeEventListener('visibilitychange', suspendInput);
      window.removeEventListener('blur', suspendInput);
      window.removeEventListener('focus', suspendInput);
      window.removeEventListener('pagehide', suspendInput);
      for (const [input, mode] of inputModes.current) {
        if (mode === null) input.removeAttribute('inputmode');
        else input.setAttribute('inputmode', mode);
      }
      inputModes.current.clear();
    };
  }, []);

  function suppressKeyboard(input) {
    if (!inputModes.current.has(input)) inputModes.current.set(input, input.getAttribute('inputmode'));
    input.setAttribute('inputmode', 'none');
  }

  function focusInput(event) {
    const input = event.target;
    if (input instanceof Element && input.matches(textEditors) && requestedInput.current !== input) {
      suppressKeyboard(input);
    }
  }

  function selectInputMode(event) {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest('button');
    const activeEditor = document.activeElement;
    const editorScope = activeEditor instanceof Element && activeEditor.matches(textEditors)
      ? activeEditor.closest('[data-composer-card], .message-inline-editor') : null;
    if (action && editorScope && action.closest('[data-composer-card], .message-inline-editor') === editorScope) {
      // Preserve the active editor's IME through native send/toolbar and inline edit clicks.
      // Changing inputmode on press resizes Android's viewport before the click completes.
      if ((event.type === 'pointerdown' || event.type === 'mousedown') && event.button === 0) event.preventDefault();
      return;
    }
    const textArea = event.target.closest('[data-input-scroll]');
    const input = event.target.closest(textEditors) ?? textArea?.querySelector('[data-composer-input]');
    if (!input || event.target.closest('button')) {
      requestedInput.current = null;
      for (const editor of root.current?.querySelectorAll(textEditors) ?? []) suppressKeyboard(editor);
    } else {
      requestedInput.current = input;
      if (inputModes.current.has(input)) {
        const mode = inputModes.current.get(input);
        if (mode === null) input.removeAttribute('inputmode');
        else input.setAttribute('inputmode', mode);
      }
    }
  }

  return <div ref={root} className="mobile-conversation-page" onPointerDownCapture={selectInputMode}
    onMouseDownCapture={selectInputMode} onClickCapture={selectInputMode} onFocusCapture={focusInput}>
    {children}
  </div>;
}
