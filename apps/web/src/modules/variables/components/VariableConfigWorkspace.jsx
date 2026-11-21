import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { ListChecks, MagnifyingGlass, Plus, SlidersHorizontal } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { switchVariableVersion } from '../model/variableConfigTransfer.js';
import '../styles/variable-workspace.css';
import { EditorDirectoryActions, EditorDirectoryHeading } from '../../../ui/ui/EditorDirectoryHeading.jsx';
import { EditorWorkspaceVersion } from '../../../ui/ui/EditorVersionPicker.jsx';

const DEFAULT_WIDTH = 480;

export function VariableConfigWorkspace({ config, query, onQueryChange, createItems, selection, saving, save, onManage, onVersionChange, inspector, children }) {
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
  return <section ref={root} className={`setting-workspace vv-workspace variable-workspace${resizing ? ' is-resizing' : ''}`} aria-label={tUi('变量配置')}
    style={{ '--setting-directory-width': `${actualWidth}px` }}>
    <aside className="setting-directory editor-heading-surface" aria-label={tUi('变量目录')}>
      <EditorDirectoryHeading title={tUi('变量')}><EditorDirectoryActions label={tUi('操作')} className="setting-directory-actions">
        <Menu portal dense open={createOpen} onClose={() => setCreateOpen(false)} anchor={<Button data-dsh-control variant="ghost" className="setting-toolbar-button setting-toolbar-create" icon={<Plus size={17} />}
          aria-label={tUi('新建变量或变量组')} title={tUi('新建')} aria-haspopup="menu" aria-expanded={createOpen}
          disabled={saving || !config || selection.active} onClick={() => setCreateOpen(!createOpen)}><span>{tUi('新建')}</span></Button>}
          items={createItems.map((item, index) => ({ id: String(index), label: item.label, icon: <item.Icon size={16} /> }))} onSelect={id => { setCreateOpen(false); createItems[Number(id)]?.run(); }} />
        {save}
        <Menu portal dense open={moreOpen} onClose={() => setMoreOpen(false)} anchor={<Button data-dsh-control variant="ghost"
          className="setting-toolbar-button setting-toolbar-icon" icon={<SlidersHorizontal size={19} />}
          aria-label={tUi('变量目录操作')} title={tUi('管理')} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} />}
          items={[{ id: 'select', label: selection.active ? tUi('完成多选') : tUi('多选'), icon: <ListChecks size={16} />, disabled: saving || !config },
            { id: 'manage', label: tUi('管理版本与导入导出'), icon: <SlidersHorizontal size={16} />, disabled: saving || !config || selection.active }]}
          onSelect={id => { setMoreOpen(false); id === 'select' ? selection.toggle() : onManage(); }} />
      </EditorDirectoryActions></EditorDirectoryHeading>
      <div className="setting-directory-search"><Input data-dsh-control type="search" className="setting-search-input" icon={<MagnifyingGlass size={16} />} aria-label={tUi('搜索变量')} placeholder={tUi('搜索变量')} value={query} onChange={event => onQueryChange(event.target.value)} /></div>
      {children}
      <EditorWorkspaceVersion label={tUi('选择变量版本')} config={config} disabled={saving}
        onSelect={id => onVersionChange(switchVariableVersion(config, id))} onManage={onManage} />
    </aside>
    <div className={`setting-pane-resizer${resizing ? ' is-dragging' : ''}`} role="separator" aria-label={tUi('调整变量目录宽度')} aria-orientation="vertical" aria-valuemin={260} aria-valuemax={max} aria-valuenow={actualWidth} tabIndex={0}
      title={tUi('拖动调整目录宽度，双击恢复')} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width: actualWidth }; event.currentTarget.setPointerCapture?.(event.pointerId); setResizing(true); }}
      onPointerMove={event => { if (drag.current) resize(drag.current.width + event.clientX - drag.current.x); }}
      onPointerUp={event => { drag.current = null; setResizing(false); if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }} onPointerCancel={() => { drag.current = null; setResizing(false); }} onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
      onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); resize(event.key === 'Home' ? 260 : event.key === 'End' ? max : actualWidth + (event.key === 'ArrowLeft' ? -16 : 16)); } }} />
    <section className="setting-document" aria-label={tUi('变量编辑区')}>{inspector || <div className="setting-document-empty">{tUi('选择变量开始编辑')}</div>}</section>
  </section>;
}
