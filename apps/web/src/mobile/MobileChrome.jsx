import { SystemBarOverlay } from '../ui/ui/SystemBarOverlay.jsx';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { X } from '@phosphor-icons/react';
import { DshSearchIcon } from '../ui/icons/dshComposerIcons.jsx';
import { MobileAddCircleIcon, MobileBackIcon, MobileSidebarIcon } from './MobileIcons.jsx';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { FailureAlert } from '../ui/ui/FailureAlert.jsx';

export function MobileHeader({ title, back, leading, onSearch, onAdd, addLabel = '新增', children }) {
  const view = useMainPageView();
  return <header className="mobile-header">
    <button type="button" aria-label={back ? '返回' : '打开侧边栏'} disabled={view.routeBusy} onClick={back || view.openDrawer}>
      {back ? <MobileBackIcon /> : <MobileSidebarIcon />}
    </button>
    {leading}
    <h1>{title}</h1>
    <div className="mobile-header-actions">
      {onSearch && <button type="button" aria-label={`搜索${title}`} onClick={onSearch}><DshSearchIcon size={21} /></button>}
      {onAdd && <button type="button" aria-label={addLabel} onClick={onAdd}><MobileAddCircleIcon /></button>}
      {children}
    </div>
  </header>;
}

export function MobileSearch({ value, onChange, label }) {
  return <div className="mobile-search"><DshSearchIcon size={20} />
    <input autoFocus type="search" aria-label={label} placeholder={label} value={value} onChange={event => onChange(event.target.value)} />
  </div>;
}

export function useMobileBack(action, enabled = true) {
  const view = useMainPageView();
  const actionRef = useRef(action);
  actionRef.current = action;
  useEffect(() => enabled ? view.registerBackHandler(() => actionRef.current()) : undefined, [enabled, view.registerBackHandler]);
}

export function MobileDialog({ title, children, onClose, busy = false, className = '', systemBarSurface = false }) {
  const ref = useRef(null);
  useMobileBack(() => { if (!busy) onClose(); return true; });
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('input, button, select, textarea')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  function trap(event) {
    if (event.key !== 'Tab') return;
    const controls = [...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <SystemBarOverlay className={`mobile-dialog-overlay ${className}`} systemBarSurfaceRef={systemBarSurface ? ref : undefined} onClick={() => !busy && onClose()}>
    <section ref={ref} className="mobile-dialog" role="dialog" aria-modal="true" data-mobile-back-owner="dialog" aria-label={title} onKeyDown={trap} onClick={event => event.stopPropagation()}>
      <header><h2>{title}</h2><button type="button" aria-label="关闭" disabled={busy} onClick={onClose}><X size={22} /></button></header>
      {children}
    </section>
  </SystemBarOverlay>;
}

export function useMobileScroll(key, enabled = true) {
  const { scrollPositions } = useMainPageView();
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    if (ref.current) ref.current.scrollTop = scrollPositions.get(key) || 0;
    const node = ref.current;
    return () => { if (node) scrollPositions.set(key, node.scrollTop); };
  }, [key, scrollPositions, enabled]);
  return ref;
}

export function MobileState({ error, loading, empty, onRetry }) {
  if (error) return <FailureAlert failure={error} onRetry={onRetry} />;
  if (loading) return <p className="mobile-state" role="status">正在加载…</p>;
  return empty ? <p className="mobile-state">{empty}</p> : null;
}
