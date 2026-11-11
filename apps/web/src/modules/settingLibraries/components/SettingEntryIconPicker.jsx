import { useEffect, useRef, useState } from 'react';
import { Button, MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretLeft, CaretRight, X } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { ICON_OPTIONS } from './SettingLibraryEntryEditor.jsx';

export function SettingEntryIconPicker({ entry, onChange, onClose }) {
  const tUi = useProductTranslation();
  const pageSize = 8, pageCount = Math.ceil(ICON_OPTIONS.length / pageSize);
  const [page, setPage] = useState(() => Math.floor(Math.max(0, ICON_OPTIONS.findIndex(item => item.id === entry.iconId)) / pageSize));
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector('button')?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) onClose(); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', outside);
    root.current?.addEventListener('keydown', escape);
    const picker = root.current;
    return () => { document.removeEventListener('pointerdown', outside); picker?.removeEventListener('keydown', escape); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <MenuSurface className="setting-entry-icons"><div ref={root} role="dialog" aria-label={tUi('条目图标')}>
    <div className="setting-icon-heading">{tUi('条目图标')}<button type="button" className="setting-icon-close" aria-label={tUi('关闭图标选择')} onClick={onClose}><X size={17} /></button></div>
    <div className="setting-icon-grid">{ICON_OPTIONS.slice(page * pageSize, (page + 1) * pageSize).map(({ id, label, Icon }) => <button type="button" key={id}
      title={tUi(label)} aria-label={tUi(label)} aria-pressed={entry.iconId === id} onClick={() => { onChange({ ...entry, iconId: id }); onClose(); }}><Icon size={18} /></button>)}</div>
    <div className="setting-icon-pagination"><Button data-dsh-control variant="outline" className="setting-icon-page-button" aria-label={tUi('上一页图标')}
      disabled={page === 0} icon={<CaretLeft size={14} />} onClick={() => setPage(page - 1)} /><span role="status" aria-label={tUi('图标页码')}>{page + 1} / {pageCount}</span>
      <Button data-dsh-control variant="outline" className="setting-icon-page-button" aria-label={tUi('下一页图标')} disabled={page === pageCount - 1} icon={<CaretRight size={14} />} onClick={() => setPage(page + 1)} /></div>
  </div></MenuSurface>;
}
