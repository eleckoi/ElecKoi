import { useEffect, useRef, useState } from 'react';
import { Check, X } from '@phosphor-icons/react';
import { registerOverlayBack } from '../../../ui/hooks/overlayBack.js';

/** In-document inputs work in Electron and WebView without browser dialog support. */
export function FrontendWorkbenchPrompt({ question, onResolve }) {
  const [value, setValue] = useState(question.initialValue ?? ''), [closing, setClosing] = useState(false);
  const form = useRef(null), timer = useRef(null), completed = useRef(false);
  const inputMode = question.initialValue !== undefined;
  const finish = result => {
    if (completed.current) return;
    completed.current = true; setClosing(true);
    const delay = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
    timer.current = window.setTimeout(() => onResolve(result), delay);
  };
  useEffect(() => {
    const element = form.current, root = element.getRootNode(), previous = root.activeElement;
    const input = element.querySelector('input');
    (input || element.querySelector('[data-cancel]')).focus(); input?.select();
    return () => { window.clearTimeout(timer.current); previous?.focus(); };
  }, []);
  useEffect(() => registerOverlayBack(() => { finish(null); return true; }, window, 1200));
  return <div className={`af-prompt-backdrop${closing ? ' closing' : ''}`} onPointerDown={event => { if (event.target === event.currentTarget) finish(null); }}>
    <form ref={form} className="af-prompt" role="dialog" aria-modal="true" aria-label={question.title}
      onSubmit={event => { event.preventDefault(); if (!inputMode || value.trim()) finish(inputMode ? value.trim() : true); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        event.stopPropagation();
        const controls = [...form.current.querySelectorAll('input,button:not(:disabled)')];
        const first = controls[0], last = controls.at(-1), active = form.current.getRootNode().activeElement;
        if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
      }}>
      <strong>{question.title}</strong>
      {inputMode ? <label>{question.label || question.title}<input aria-label={question.label || question.title} value={value} disabled={closing} onChange={event => setValue(event.target.value)} /></label>
        : <p>{question.message}</p>}
      <div className="af-prompt-actions"><button data-cancel type="button" disabled={closing} onClick={() => finish(null)}><X size={16} />取消</button>
        <button type="submit" className={question.danger ? 'danger' : 'primary'} disabled={closing || (inputMode && !value.trim())}><Check size={16} />{question.confirmLabel || '确定'}</button></div>
    </form>
  </div>;
}
