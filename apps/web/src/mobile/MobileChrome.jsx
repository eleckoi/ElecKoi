import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../ui/styles/product-dialogs.css';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { DshSearchIcon } from '../ui/icons/dshComposerIcons.jsx';
import { MobileAddCircleIcon, MobileBackIcon, MobileSidebarIcon } from './MobileIcons.jsx';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { FailureAlert } from '../ui/ui/FailureAlert.jsx';

export function MobileHeader({ title, back, leading, onSearch, renderSearch, onAdd, addLabel: addLabelSource, children }) {
  const tUi = useProductTranslation();
  const addLabel = addLabelSource === undefined ? tUi("新增") : addLabelSource;
  const view = useMainPageView();
  const search = onSearch && <button type="button" aria-label={tUi("搜索{value0}", {value0: title})} onClick={onSearch}><DshSearchIcon size={21} /></button>;
  return <header className="mobile-header">
    <button type="button" aria-label={back ? tUi("返回") : tUi("打开侧边栏")} disabled={view.routeBusy} onClick={back || view.openDrawer}>
      {back ? <MobileBackIcon /> : <MobileSidebarIcon />}
    </button>
    {leading}
    <h1>{title}</h1>
    <div className="mobile-header-actions">
      {search && (renderSearch ? renderSearch(search) : search)}
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

export function MobileDialog({ title, children, onClose, busy = false, className = '', footer }) {
  const tUi = useProductTranslation();
  return <Modal open title={title} closeLabel={tUi('关闭')} onClose={() => { if (!busy) onClose(); }}
    className="product-dialog" contentClassName="product-dialog-content" footer={footer}>
    <div className={`mobile-dialog-body ${className}`}>{children}</div>
  </Modal>;
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
  const tUi = useProductTranslation();
  if (error) return <FailureAlert failure={error} onRetry={onRetry} />;
  if (loading) return <p className="mobile-state" role="status">{tUi("正在加载…")}</p>;
  return empty ? <p className="mobile-state">{empty}</p> : null;
}
