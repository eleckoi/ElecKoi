import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { SystemBarOverlay } from '../ui/ui/SystemBarOverlay.jsx';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMobileBack } from './MobileChrome.jsx';
import { resolveFailure } from '../utils/failureText.js';
import './mobile-library.css';

export function useMobileOperation() {
  const tUi = useProductTranslation();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action) {
    if (pending.current) return false;
    pending.current = true; setBusy(true); setError('');
    try { await action(); return true; }
    catch (cause) { setError(resolveFailure(cause, { fallback: tUi("操作失败，请重试。") }).text); return false; }
    finally { pending.current = false; setBusy(false); }
  }
  return { busy, error, setError, run };
}

function LibraryOverlay({ title, onClose, busy, className, children, anchor }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  const host = document.querySelector('.mobile-shell') || document.body;
  useMobileBack(() => { if (!busy) onClose(); return true; });
  useLayoutEffect(() => {
    if (!anchor) return;
    const update = () => {
      const rect = anchor.getBoundingClientRect(), base = host.getBoundingClientRect();
      const width = ref.current?.offsetWidth || 172;
      const height = ref.current?.offsetHeight || 0;
      const left = Math.max(12, Math.min(rect.right - base.left - width, base.width - width - 12));
      setPosition({ left, top: Math.max(9, Math.min(rect.bottom - base.top + 9, base.height - height - 12)), '--mobile-menu-pointer': `${Math.max(18, Math.min(width - 18, rect.left + rect.width / 2 - base.left - left))}px` });
    };
    update(); window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [anchor, host]);
  useEffect(() => {
    const previous = anchor || document.activeElement;
    ref.current?.querySelector('input,button:not(:disabled)')?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  function trap(event) {
    const controls = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
    const index = controls.indexOf(document.activeElement);
    if (className === 'mobile-bubble-menu' && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? controls.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
      controls[next]?.focus();
    } else if (event.key === 'Tab' && controls.length && ((event.shiftKey && index <= 0) || (!event.shiftKey && index === controls.length - 1))) {
      event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
    }
  }
  return createPortal(<SystemBarOverlay className="mobile-library-overlay" onClick={() => !busy && onClose()}>
    <section ref={ref} className={className} style={position || undefined} role="dialog" aria-modal="true" aria-label={title} data-mobile-back-owner="dialog" onKeyDown={trap} onClick={event => event.stopPropagation()}>{children}</section>
  </SystemBarOverlay>, host);
}

export function MobileActionMenu({ title, anchor, onClose, actions, busy = false, error }) {
  return <LibraryOverlay title={title} anchor={anchor} onClose={onClose} busy={busy} className="mobile-bubble-menu">
    <div className="mobile-bubble-menu-items" role="menu" aria-label={title}>{actions.map(({ label, icon, action, divider, destructive, disabled }) => <div key={label}>
      {divider && <hr />}
      <button role="menuitem" type="button" className={destructive ? 'is-destructive' : undefined} disabled={busy || disabled} onClick={action}>{icon}<span>{label}</span></button>
    </div>)}{error && <p className="mobile-menu-error" role="alert">{error}</p>}</div>
  </LibraryOverlay>;
}

export function MobileConfirm({ title, children, confirmText: confirmTextSource, destructive = true, onClose, onConfirm, busy = false, error }) {
  const tUi = useProductTranslation();
  const confirmText = confirmTextSource === undefined ? tUi("删除") : confirmTextSource;
  return <LibraryOverlay title={title} onClose={onClose} busy={busy} className="mobile-library-dialog">
    <h2>{title}</h2>{children && <div className="mobile-library-dialog-copy">{children}</div>}
    {error && <p role="alert">{error}</p>}
    <div className="mobile-library-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>{tUi("取消")}</button><button type="button" className={destructive ? 'is-destructive' : 'is-confirm'} disabled={busy} onClick={onConfirm}>{busy ? tUi("处理中…") : confirmText}</button></div>
  </LibraryOverlay>;
}

export function MobileNameDialog({ title, initialName = '', onClose, onSave }) {
  const tUi = useProductTranslation();
  const [name, setName] = useState(initialName);
  const { busy, error, run } = useMobileOperation();
  return <MobileConfirm title={title} onClose={onClose} busy={busy} error={error} confirmText={tUi("保存")} destructive={false} onConfirm={() => run(async () => { if (!name.trim()) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, tUi("请输入名称"), { field: tUi("名称") }); await onSave(name.trim()); onClose(); })}>
    <input className="mobile-library-name" aria-label={tUi("名称")} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
  </MobileConfirm>;
}

export function MobileSelectionHeader({ title, busy, onAll, onCancel, summary, children }) {
  const tUi = useProductTranslation();
  return <div className={`mobile-library-selection-header${children ? ' has-actions' : ''}`}>
    <strong>{title}{summary != null && <span className="mobile-selection-summary" role="status">{summary}</span>}</strong>
    <button type="button" disabled={busy} onClick={onAll}>{tUi("全选")}</button>
    <button type="button" className="mobile-selection-cancel" disabled={busy} onClick={onCancel}>{tUi("取消")}</button>
    {children && <div className="mobile-library-selection-actions">{children}</div>}
  </div>;
}
