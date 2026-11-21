import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { ListChecks, MagnifyingGlass, Plus, SlidersHorizontal } from '../icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import '../styles/editor-library-workspace.css';
import { EditorDirectoryActions, EditorDirectoryHeading } from './EditorDirectoryHeading.jsx';
import { EditorScopeTabs } from './EditorScopeTabs.jsx';
import { EditorWorkspaceVersion } from './EditorVersionPicker.jsx';

const DEFAULT_WIDTH = 480;

export function EditorLibraryWorkspace({ label, scope, ownerScope, onScopeChange, panelId, config, query, onQueryChange, createItems, selection, saving, disabled, save, onManage, onVersionChange, inspector, children, directoryHeading, directoryActions, className = '' }) {
  const tUi = useProductTranslation();
  const root = useRef(null), drag = useRef(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH), [available, setAvailable] = useState(1260);
  const [resizing, setResizing] = useState(false), [createOpen, setCreateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const max = Math.max(260, Math.min(520, available - 388)), actualWidth = Math.max(260, Math.min(width, max));
  const resize = next => setWidth(Math.max(260, Math.min(max, next)));
  useLayoutEffect(() => {
    const measure = () => { const next = root.current?.getBoundingClientRect().width; if (next) setAvailable(next); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root.current); window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return <section ref={root} className={`setting-workspace rs-workspace${resizing ? ' is-resizing' : ''} ${className}`} aria-label={label}
    style={{ '--setting-directory-width': `${actualWidth}px` }}>
    <aside className="setting-directory editor-heading-surface" aria-label={tUi('{value0}目录', { value0: label })}>
      <EditorDirectoryHeading title={directoryHeading ?? label} leading={!directoryHeading && <EditorScopeTabs
        value={scope} ownerValue={ownerScope} ownerLabel={ownerScope === 'preset' ? tUi('预设') : tUi('角色')}
        panelId={panelId} onChange={onScopeChange} />}>
        <EditorDirectoryActions label={tUi('操作')} className="setting-directory-actions">{directoryActions ?? <>
        <Menu portal dense open={createOpen} onClose={() => setCreateOpen(false)} anchor={<Button data-dsh-control variant="ghost" className="setting-toolbar-button setting-toolbar-create" icon={<Plus size={17} />}
          aria-label={tUi('新建{value0}', { value0: label })} title={tUi('新建')} aria-haspopup="menu" aria-expanded={createOpen}
          disabled={saving || disabled || !config || selection.active} onClick={() => setCreateOpen(!createOpen)}><span>{tUi('新建')}</span></Button>}
          items={createItems.map((item, index) => ({ id: String(index), label: item.label, disabled: item.disabled, icon: item.Icon ? <item.Icon size={16} /> : undefined }))} onSelect={id => { setCreateOpen(false); createItems[Number(id)]?.run(); }} />
        {save}
        <Menu portal dense open={moreOpen} onClose={() => setMoreOpen(false)} anchor={<Button data-dsh-control variant="ghost"
          className="setting-toolbar-button setting-toolbar-icon" icon={<SlidersHorizontal size={19} />}
          aria-label={tUi('{value0}目录操作', { value0: label })} title={tUi('管理')} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} />}
          items={[{ id: 'select', label: selection.active ? tUi('完成多选') : tUi('多选'), icon: <ListChecks size={16} />, disabled: saving || !config },
            { id: 'manage', label: tUi('管理版本与导入导出'), icon: <SlidersHorizontal size={16} />, disabled: saving || disabled || !config || selection.active }]}
          onSelect={id => { setMoreOpen(false); id === 'select' ? selection.toggle() : onManage(); }} />
      </>}</EditorDirectoryActions></EditorDirectoryHeading>
      <div className="setting-directory-search"><Input data-dsh-control type="search" className="setting-search-input" icon={<MagnifyingGlass size={16} />} aria-label={tUi('搜索{value0}', { value0: label })} placeholder={tUi('搜索{value0}', { value0: label })} value={query} onChange={event => onQueryChange(event.target.value)} /></div>
      {children}
      <EditorWorkspaceVersion key={scope} label={tUi('选择{value0}版本', { value0: label })} config={config}
        disabled={saving} onSelect={onVersionChange} onManage={onManage} />
    </aside>
    <div className={`setting-pane-resizer${resizing ? ' is-dragging' : ''}`} role="separator" aria-label={tUi('调整目录宽度')} aria-orientation="vertical" aria-valuemin={260} aria-valuemax={max} aria-valuenow={actualWidth} tabIndex={0}
      title={tUi('拖动调整目录宽度，双击恢复')} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width: actualWidth }; event.currentTarget.setPointerCapture?.(event.pointerId); setResizing(true); }}
      onPointerMove={event => { if (drag.current) resize(drag.current.width + event.clientX - drag.current.x); }}
      onPointerUp={event => { drag.current = null; setResizing(false); if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }} onPointerCancel={() => { drag.current = null; setResizing(false); }} onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
      onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); resize(event.key === 'Home' ? 260 : event.key === 'End' ? max : actualWidth + (event.key === 'ArrowLeft' ? -16 : 16)); } }} />
    <section className="setting-document" aria-label={tUi('{value0}编辑区', { value0: label })}>{inspector || <div className="setting-document-empty">{tUi('选择{value0}开始编辑', { value0: label })}</div>}</section>
  </section>;
}
