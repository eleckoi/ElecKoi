import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Input, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { MagnifyingGlass, Plus } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { switchLibraryVersion } from '../model/settingLibraryTransfer.js';
import '../styles/setting-workspace.css';
import { EditorDirectoryActions, EditorDirectoryHeading } from '../../../ui/ui/EditorDirectoryHeading.jsx';
import { EditorScopeTabs } from '../../../ui/ui/EditorScopeTabs.jsx';
import { EditorWorkspaceVersion } from '../../../ui/ui/EditorVersionPicker.jsx';

const DEFAULT_WIDTH = 480;

export function SettingLibraryWorkspace({ scope, onScopeChange, globalAvailable, panelId, query, onQueryChange, createItems,
  selectionActive, saving, library, roleLibrary, onLibraryChange, onManage, importAction, directoryOptions, save, inspector, children }) {
  const tUi = useProductTranslation();
  const root = useRef(null), drag = useRef(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH), [available, setAvailable] = useState(1260);
  const [resizing, setResizing] = useState(false), [createOpen, setCreateOpen] = useState(false);
  const max = Math.max(260, Math.min(520, available - 388));
  const actualWidth = Math.max(260, Math.min(width, max));
  const resize = next => setWidth(Math.max(260, Math.min(max, next)));
  useLayoutEffect(() => {
    const measure = () => { const next = root.current?.getBoundingClientRect().width; if (next) setAvailable(next); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  return <section ref={root} className={`setting-workspace${resizing ? ' is-resizing' : ''}`} aria-label={tUi('设定库')}
    style={{ '--setting-directory-width': `${actualWidth}px` }}>
    <aside className="setting-directory editor-heading-surface" aria-label={tUi('设定目录')}>
      <EditorDirectoryHeading title={tUi('设定库')}
        leading={globalAvailable && <EditorScopeTabs value={scope} onChange={onScopeChange} panelId={panelId} />}>
        <EditorDirectoryActions label={tUi('设定操作')} className="setting-directory-actions">
          {(scope === 'character' || library) && <Menu open={createOpen} portal dense onClose={() => setCreateOpen(false)}
            anchor={<Button data-dsh-control variant="ghost" className="setting-toolbar-button setting-toolbar-create" icon={<Plus size={17} />}
              aria-label={tUi('新建')} title={tUi('新建')} aria-haspopup="menu" aria-expanded={createOpen}
              disabled={saving || !library || selectionActive} onClick={() => setCreateOpen(!createOpen)}><span>{tUi('新建')}</span></Button>}
            items={createItems.map((item, index) => ({ id: String(index), label: item.label, icon: <item.Icon size={16} /> }))}
            onSelect={id => { setCreateOpen(false); createItems[Number(id)]?.run(); }} />}
          {importAction}
          {save}
          {directoryOptions}
        </EditorDirectoryActions>
      </EditorDirectoryHeading>
      <div className="setting-directory-search"><Input data-dsh-control className="setting-search-input" type="search" icon={<MagnifyingGlass size={16} />}
        aria-label={scope === 'global' ? tUi('搜索全局设定库') : tUi('搜索设定')} placeholder={scope === 'global' ? tUi('搜索全局设定库') : tUi('搜索设定')}
        value={query} onChange={event => onQueryChange(event.target.value)} /></div>
      {children}
      {scope === 'character' && <EditorWorkspaceVersion label={tUi('选择设定库版本')} config={roleLibrary} disabled={saving}
        onSelect={id => onLibraryChange(switchLibraryVersion(roleLibrary, id))} onManage={onManage} />}
    </aside>
    <div role="separator" aria-label={tUi('调整目录宽度')} aria-orientation="vertical" aria-valuemin={260} aria-valuemax={max} aria-valuenow={Math.round(actualWidth)} tabIndex={0}
      className={`setting-pane-resizer${resizing ? ' is-dragging' : ''}`} title={tUi('拖动调整目录宽度，双击恢复')}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width: actualWidth }; event.currentTarget.setPointerCapture?.(event.pointerId); setResizing(true); }}
      onPointerMove={event => { if (drag.current) resize(drag.current.width + event.clientX - drag.current.x); }}
      onPointerUp={event => { drag.current = null; setResizing(false); if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }} onPointerCancel={() => { drag.current = null; setResizing(false); }} onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
      onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); resize(event.key === 'Home' ? 260 : event.key === 'End' ? max : actualWidth + (event.key === 'ArrowLeft' ? -16 : 16)); } }} />
    <section className="setting-document" aria-label={tUi('设定编辑区')}>
      {inspector || <div className="setting-document-empty">{tUi('选择设定开始编辑')}</div>}
    </section>
  </section>;
}
