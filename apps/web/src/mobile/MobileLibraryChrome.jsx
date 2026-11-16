import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../ui/styles/product-dialogs.css';
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
  const [surface, setSurface] = useState(null);
  const host = document.querySelector('.mobile-shell') || document.body;
  useMobileBack(() => { if (!busy) onClose(); return true; });
  useLayoutEffect(() => {
    const update = () => {
      const width = ref.current?.offsetWidth || 172;
      const height = ref.current?.offsetHeight || 0;
      if (!anchor) { setSurface({ width, height, pointer: width - 28 }); return; }
      const rect = anchor.getBoundingClientRect(), base = host.getBoundingClientRect();
      const left = Math.max(12, Math.min(rect.right - base.left - width, base.width - width - 12));
      const pointer = Math.max(28, Math.min(width - 28, rect.left + rect.width / 2 - base.left - left));
      setPosition({ left, top: Math.max(10, Math.min(rect.bottom - base.top + 10, base.height - height - 12)), '--mobile-menu-pointer': `${pointer}px` });
      setSurface({ width, height, pointer });
    };
    update(); window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    return () => { window.removeEventListener('resize', update); observer.disconnect(); };
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
    <section ref={ref} className={className} style={position || undefined} role="dialog" aria-modal="true" aria-label={title} data-mobile-back-owner="dialog" onKeyDown={trap} onClick={event => event.stopPropagation()}>
      {surface && <MobileMenuSurface {...surface} />}{children}
    </section>
  </SystemBarOverlay>, host);
}

function MobileMenuSurface({ width: w, height, pointer: p }) {
  const r = 16, t = 10, b = height + t;
  // One closed contour owns both the pointer and the rounded body, including
  // their shadow. Curved joins keep the pointer continuous with the top edge.
  const path = `M ${r} ${t} H ${p - 12} C ${p - 8} ${t} ${p - 4} 3 ${p - 1.5} 1.5 Q ${p} 0 ${p + 1.5} 1.5 C ${p + 4} 3 ${p + 8} ${t} ${p + 12} ${t} H ${w - r} Q ${w} ${t} ${w} ${t + r} V ${b - r} Q ${w} ${b} ${w - r} ${b} H ${r} Q 0 ${b} 0 ${b - r} V ${t + r} Q 0 ${t} ${r} ${t} Z`;
  return <svg className="mobile-bubble-menu-surface" aria-hidden="true" focusable="false" viewBox={`0 0 ${w} ${b}`} preserveAspectRatio="none"><path d={path} /></svg>;
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
  return <Modal open title={title} closeLabel={tUi('关闭')} onClose={() => { if (!busy) onClose(); }} tone={destructive ? 'warning' : undefined}
    className="product-dialog" contentClassName="product-dialog-content" footer={<div className="product-dialog-actions">
      <Button variant="outline" disabled={busy} onClick={onClose}>{tUi('取消')}</Button>
      <Button variant="primary" disabled={busy} onClick={onConfirm}>{busy ? tUi('处理中…') : confirmText}</Button>
    </div>}>
    {children}{error && <p className="product-dialog-error" role="alert">{error}</p>}
  </Modal>;
}

export function MobileNameDialog({ title, initialName = '', onClose, onSave }) {
  const tUi = useProductTranslation();
  const [name, setName] = useState(initialName);
  const { busy, error, run } = useMobileOperation();
  return <MobileConfirm title={title} onClose={onClose} busy={busy} error={error} confirmText={tUi("保存")} destructive={false} onConfirm={() => run(async () => { if (!name.trim()) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, tUi("请输入名称"), { field: tUi("名称") }); await onSave(name.trim()); onClose(); })}>
    <Input className="product-dialog-field" data-modal-autofocus aria-label={tUi("名称")} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
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
