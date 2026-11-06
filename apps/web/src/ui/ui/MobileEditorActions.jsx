import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Clipboard, List, PencilSimple, Plus, Trash, X } from '../icons/interfaceIcons.jsx';

export function MobileEditorActions({ label, selectionId, canEdit, canModify, clipboard, canPaste = true, busy = false,
  onEdit, onMove, onPaste, onCancel, onDelete, createItems, moreItems, moveItems }) {
  const tUi = useProductTranslation();
  const [menu, setMenu] = useState('');
  const barRef = useRef(null);
  useEffect(() => { setMenu(''); }, [selectionId, clipboard]);
  useEffect(() => {
    if (!menu) return undefined;
    const dismiss = event => { if (!barRef.current?.contains(event.target)) setMenu(''); };
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(''); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [menu]);
  const items = { create: createItems, more: moreItems, move: moveItems }[menu];
  const action = (title, Icon, enabled, run, destructive = false, popup = '') => <button type="button"
    disabled={busy || !enabled} className={destructive ? 'is-destructive' : undefined}
    aria-expanded={popup ? menu === popup : undefined} aria-haspopup={popup ? 'menu' : undefined}
    onClick={() => popup ? setMenu(current => current === popup ? '' : popup) : run?.()}>
    <Icon size={22} aria-hidden="true" /><span>{title}</span>
  </button>;
  return <div ref={barRef} className="mobile-editor-actions" onMouseDown={event => event.stopPropagation()}>
    {items && <div className={`mobile-editor-action-menu is-${menu}`} role="menu">
      {items.map(({ id, label: title, Icon, disabled, run }) => <button type="button" role="menuitem" key={id || title} disabled={busy || disabled}
        onClick={() => { setMenu(''); run(); }}>{Icon && <Icon size={18} aria-hidden="true" />}{title}</button>)}
    </div>}
    <div role="toolbar" aria-label={label}>
      {createItems?.length > 0 && action(tUi("新建"), Plus, createItems.some(item => !item.disabled), null, false, 'create')}
      {action(clipboard ? tUi("粘贴") : tUi("编辑"), clipboard ? Clipboard : PencilSimple, clipboard ? canPaste : canEdit, clipboard ? onPaste : onEdit)}
      {action(clipboard ? tUi("取消") : tUi("移动"), clipboard ? X : ArrowRight, Boolean(clipboard) || canModify,
        clipboard ? onCancel : onMove, false, !clipboard && moveItems ? 'move' : '')}
      {action(tUi("删除"), Trash, canModify && !clipboard, onDelete, true)}
      {action(tUi("更多"), List, Boolean(selectionId) && !clipboard && Boolean(moreItems?.length), null, false, 'more')}
    </div>
  </div>;
}
