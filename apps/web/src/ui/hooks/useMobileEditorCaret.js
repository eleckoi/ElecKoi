import { useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';

const CARET_MARGIN = 12;
const TEXT_LAYOUT = [
  'direction', 'fontFamily', 'fontSize', 'fontStretch', 'fontStyle', 'fontVariant', 'fontWeight',
  'letterSpacing', 'lineHeight', 'padding', 'tabSize', 'textAlign', 'textIndent', 'textTransform',
  'whiteSpace', 'overflowWrap', 'wordBreak', 'wordSpacing',
];

function textareaCaret(field) {
  // The textarea's selection is not a DOM Range. Measure a mirror with the
  // full text so a selection inside a word keeps the same wrap as the field.
  const mirror = document.createElement('div');
  const style = getComputedStyle(field);
  for (const property of TEXT_LAYOUT) mirror.style[property] = style[property];
  Object.assign(mirror.style, {
    position: 'fixed', top: '0', left: '0', width: `${field.clientWidth}px`,
    visibility: 'hidden', pointerEvents: 'none', boxSizing: 'border-box',
  });
  const value = field.value;
  mirror.textContent = !value || value.endsWith('\n') ? `${value}\u200b` : value;
  document.body.append(mirror);
  try {
    const head = field.selectionDirection === 'backward' ? field.selectionStart : field.selectionEnd;
    const range = document.createRange();
    range.setStart(mirror.firstChild, head);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    const fieldTop = field.getBoundingClientRect().top + field.clientTop - field.scrollTop;
    const offset = fieldTop - mirror.getBoundingClientRect().top;
    return { top: rect.top + offset, bottom: rect.bottom + offset };
  } finally {
    mirror.remove();
  }
}

function revealTextareaCaret(field, viewport) {
  const caret = textareaCaret(field);
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  for (let scroller = field; scroller && scroller !== document.body; scroller = scroller.parentElement) {
    if (scroller.scrollHeight <= scroller.clientHeight) continue;
    if (scroller !== field && !/^(auto|scroll)$/.test(getComputedStyle(scroller).overflowY)) continue;
    const boxTop = scroller.getBoundingClientRect().top + scroller.clientTop;
    const boxBottom = boxTop + scroller.clientHeight;
    let top = Math.max(boxTop, viewportTop), bottom = Math.min(boxBottom, viewportBottom);
    // A lower field can be completely offscreen until its form scrolls.
    if (bottom - top < caret.bottom - caret.top) { top = boxTop; bottom = boxBottom; }
    const margin = Math.min(CARET_MARGIN, Math.max(0, (bottom - top - (caret.bottom - caret.top)) / 2));
    const delta = caret.bottom > bottom - margin ? caret.bottom - bottom + margin : Math.min(0, caret.top - top - margin);
    if (!delta) continue;
    const previous = scroller.scrollTop;
    scroller.scrollTop += delta;
    const moved = scroller.scrollTop - previous;
    caret.top -= moved;
    caret.bottom -= moved;
  }
}

/** Track focus in the editor tree, including forms rendered through React portals. */
export function useMobileEditorCaret(compact) {
  const root = useRef(null);
  const focused = useRef(null);
  const schedule = useRef(null);

  useEffect(() => {
    if (!compact) return undefined;
    const viewport = window.visualViewport;
    const visibleHeight = () => viewport?.scale === 1 ? Math.min(window.innerHeight, viewport.height) : window.innerHeight;
    let height = visibleHeight();
    let frame = 0;
    const shell = root.current;
    let overlay;
    function fitSurface(surface) {
      if (!surface?.isConnected) return;
      if (height < window.innerHeight) {
        const top = Math.max(0, surface.getBoundingClientRect().top - viewport.offsetTop);
        surface.style.maxHeight = `${Math.max(0, height - top)}px`;
      } else {
        surface.style.removeProperty('max-height');
      }
    }
    function fitEditor() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const nextHeight = visibleHeight();
        const shrank = nextHeight < height;
        height = nextHeight;
        const active = document.activeElement;
        const ownsFocus = active && (shell?.contains(active) || focused.current === active);
        if (ownsFocus) {
          const nextOverlay = active.closest('.immersive-markdown-editor.is-compact, .mobile-conversation-overlay');
          if (overlay !== nextOverlay) overlay?.style.removeProperty('max-height');
          overlay = nextOverlay;
        }
        // When only the visible area shrinks, resize the form's scroll viewport too.
        fitSurface(shell);
        fitSurface(overlay);
        if (!shrank || !ownsFocus) return;
        if (active.matches('textarea:not([readonly]):not(:disabled)')) {
          revealTextareaCaret(active, viewport?.scale === 1 ? viewport : null);
        } else if (active.matches('.cm-content[contenteditable="true"]')) {
          const editor = EditorView.findFromDOM(active);
          editor?.dispatch({ effects: EditorView.scrollIntoView(editor.state.selection.main.head, { y: 'nearest', yMargin: CARET_MARGIN }) });
        }
      });
    }
    schedule.current = fitEditor;
    window.addEventListener('resize', fitEditor);
    viewport?.addEventListener('resize', fitEditor);
    fitEditor();
    return () => {
      schedule.current = null;
      focused.current = null;
      shell?.style.removeProperty('max-height');
      overlay?.style.removeProperty('max-height');
      window.removeEventListener('resize', fitEditor);
      viewport?.removeEventListener('resize', fitEditor);
      cancelAnimationFrame(frame);
    };
  }, [compact]);

  return compact ? { ref: root, onFocusCapture(event) {
    focused.current = event.target;
    schedule.current?.();
  } } : undefined;
}
