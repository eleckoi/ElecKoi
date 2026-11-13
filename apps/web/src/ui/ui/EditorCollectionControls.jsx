import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { Copy, DotsThree, ListChecks, MagnifyingGlass, NotePencil, Plus, SlidersHorizontal, Trash } from '../icons/interfaceIcons.jsx';
import { useEditorPresentation } from './EditorPresentationContext.jsx';
import { EditorDirectoryHeading } from './EditorDirectoryHeading.jsx';
import './editor-collection-controls.css';
import './editor-collection-material.css';
import '../styles/dsh-editor-controls.css';

export function EditorCollectionSurface({ children, grouped = false }) {
  return <div className={`editor-collection-surface${grouped ? ' is-grouped' : ''}`}>{children}</div>;
}

export function EditorCollectionToolbar({ query, onQueryChange, placeholder, createItems = [], onManage, manageLabel: manageLabelSource,
  selection, disabled = false, beforeSave, save, children, className = '', heading, leading }) {
  const tUi = useProductTranslation();
  const manageLabel = manageLabelSource === undefined ? tUi("管理") : manageLabelSource;
  const [createOpen, setCreateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { compact } = useEditorPresentation();
  if (compact) {
    const moreItems = [
      ...(selection ? [{ id: 'selection', label: tUi(selection.active ? '完成' : '多选'), icon: <ListChecks size={16} />, disabled, run: selection.toggle }] : []),
      ...(onManage ? [{ id: 'manage', label: manageLabel, icon: <SlidersHorizontal size={16} />, disabled: disabled || selection?.active, run: onManage }] : []),
    ];
    return <div className={`editor-collection-toolbar is-mobile-collection editor-heading-surface ${className}`} onMouseDown={event => event.stopPropagation()}>
      <EditorDirectoryHeading title={heading} leading={leading} toplineClassName="editor-collection-topline">
        <div className="editor-collection-actions">
          {moreItems.length > 0 && <Menu open={moreOpen} portal dense anchor={<Button data-dsh-control className="editor-collection-more" variant="outline" aria-label={tUi('管理')} disabled={disabled}
            aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => { setCreateOpen(false); setMoreOpen(!moreOpen); }}><DotsThree size={20} /></Button>}
            items={moreItems} onClose={() => setMoreOpen(false)} onSelect={id => { setMoreOpen(false); moreItems.find(item => item.id === id)?.run?.(); }} />}
          {children}
        </div>
      </EditorDirectoryHeading>
      <Input data-dsh-control className="editor-collection-search" type="search" icon={<MagnifyingGlass size={16} />}
        value={query} onChange={event => onQueryChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {(beforeSave || save) && <div className="editor-collection-feedback">{beforeSave}{save}</div>}
    </div>;
  }
  const items = createItems.map((item, index) => ({ ...item, id: item.id ?? String(index), icon: item.Icon ? <item.Icon size={16} /> : undefined }));
  return <header className={`editor-collection-toolbar ${className}`} onMouseDown={event => event.stopPropagation()}>
    <Input data-dsh-control className="editor-collection-search" type="search" icon={<MagnifyingGlass size={16} />}
      value={query} onChange={event => onQueryChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
    <div className="editor-collection-actions">
      {!compact && items.length > 0 && <Menu open={createOpen} portal dense anchor={<Button data-dsh-control className="editor-collection-action" variant="primary" icon={<Plus size={16} />} disabled={disabled || selection?.active}
        aria-label={tUi("新建")} aria-haspopup="menu" aria-expanded={createOpen} onClick={() => setCreateOpen(value => !value)}>{tUi("新建")}</Button>}
        items={items} onClose={() => setCreateOpen(false)} onSelect={id => { setCreateOpen(false); items.find(item => item.id === id)?.run?.(); }} />}
      {selection && <Button data-dsh-control className="editor-collection-action" variant="outline" icon={<ListChecks size={16} />} disabled={disabled}
        aria-label={selection.active ? tUi("完成") : tUi("多选")} aria-pressed={selection.active} onClick={selection.toggle}>{selection.active ? tUi("完成") : tUi("多选")}</Button>}
      {onManage && <Button data-dsh-control className="editor-collection-action" variant="outline" icon={<SlidersHorizontal size={16} />} aria-label={manageLabel} aria-haspopup="dialog" disabled={disabled || selection?.active} onClick={onManage}>{manageLabel}</Button>}
      {beforeSave}
      {save}
      {children}
    </div>
  </header>;
}

export function useEditorMultiSelect(ids, contextKey) {
  const [active, setActive] = useState(false), [selected, setSelected] = useState(new Set());
  const stableIds = JSON.stringify(ids);
  useEffect(() => { setActive(false); setSelected(new Set()); }, [contextKey]);
  useEffect(() => { const allowed = new Set(ids); setSelected(current => {
    const next = new Set([...current].filter(id => allowed.has(id)));
    return next.size === current.size ? current : next;
  }); }, [stableIds]);
  return { active, selected, toggle: () => { setActive(value => !value); setSelected(new Set()); },
    clear: () => setSelected(new Set()), set: setSelected,
    check: (id, checked) => setSelected(current => { const next = new Set(current); checked ? next.add(id) : next.delete(id); return next; }) };
}

export function EditorSelectionCheckbox({ selection, id, label, disabled }) {
  const tUi = useProductTranslation();
  if (!selection?.active) return null;
  return <input className="editor-selection-checkbox" type="checkbox" aria-label={tUi("选择{value0}", {value0: label})}
    checked={selection.selected.has(id)} disabled={disabled} onMouseDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()} onChange={event => selection.check(id, event.target.checked)} />;
}

export function EditorSelectionBar({ selection, visibleIds, disabled, onCopy, onDelete, children }) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const allRef = useRef(null);
  const count = visibleIds.filter(id => selection.selected.has(id)).length;
  useEffect(() => { if (allRef.current) allRef.current.indeterminate = count > 0 && count < visibleIds.length; }, [count, visibleIds.length]);
  if (!selection.active) return null;
  return <div className={`editor-selection-bar${compact ? ' is-mobile-selection' : ''}`} aria-label={tUi("批量操作")}>
    <label><input ref={allRef} type="checkbox" checked={visibleIds.length > 0 && count === visibleIds.length} disabled={disabled || !visibleIds.length}
      onChange={event => { const next = new Set(selection.selected); visibleIds.forEach(id => event.target.checked ? next.add(id) : next.delete(id)); selection.set(next); }} />{tUi("全选")}</label>
    <span role="status">{tUi("已选 ")}{selection.selected.size}{tUi(" 项")}</span>
    <div>{compact && <Button data-dsh-control variant="outline" className="editor-selection-cancel" disabled={disabled} onClick={selection.toggle}>{tUi("取消")}</Button>}
      <Button data-dsh-control variant="outline" icon={<Copy size={16} />} disabled={disabled || !selection.selected.size} onClick={onCopy}>{tUi("复制")}</Button>
      {children}<Button data-dsh-control variant="outline" className="is-danger" icon={<Trash size={16} />} disabled={disabled || !selection.selected.size} onClick={onDelete}>{tUi("删除")}</Button></div>
  </div>;
}

export function EditorManagementModal({ title, onClose, children, footer, className = '' }) {
  const tUi = useProductTranslation();
  return <Modal open title={title} closeLabel={tUi("关闭")} onClose={onClose} className={`editor-management-modal ${className}`}
    contentClassName="editor-management-content" footer={footer}>{children}</Modal>;
}

export function EditorManagementAction({ label, Icon, danger, disabled, onClick }) {
  return <Button data-dsh-control variant="ghost" className={`editor-management-action${danger ? ' is-danger' : ''}`}
    icon={Icon ? <Icon size={18} /> : undefined} disabled={disabled} onClick={onClick}>{label}</Button>;
}

export { NotePencil as EditorRenameIcon };
