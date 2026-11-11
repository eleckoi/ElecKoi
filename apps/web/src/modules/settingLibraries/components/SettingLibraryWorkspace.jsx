import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Input, Menu, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import { CaretDown, DotsThree, ListChecks, MagnifyingGlass, Plus, SlidersHorizontal } from '../../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { switchLibraryVersion } from '../model/settingLibraryTransfer.js';
import '../styles/setting-workspace.css';

const DEFAULT_WIDTH = 480;

export function SettingLibraryWorkspace({ scope, onScopeChange, globalAvailable, panelId, query, onQueryChange, createItems,
  selection, saving, library, roleLibrary, onLibraryChange, onManage, importActions, save, inspector, children }) {
  const tUi = useProductTranslation();
  const root = useRef(null), drag = useRef(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH), [available, setAvailable] = useState(1260);
  const [resizing, setResizing] = useState(false), [createOpen, setCreateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false), [versionOpen, setVersionOpen] = useState(false);
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
  const version = roleLibrary?.versions.find(item => item.id === roleLibrary.activeVersionId);
  const versionLabel = (item, index) => `v${index + 1} · ${item?.name || tUi('未命名版本')}`;
  const moreItems = [
    { id: 'select', label: selection.active ? tUi('完成多选') : tUi('多选'), icon: <ListChecks size={16} />, run: selection.toggle, disabled: saving || !library },
    ...(scope === 'character' ? [{ id: 'manage', label: tUi('管理设定库'), icon: <SlidersHorizontal size={16} />, run: onManage, disabled: saving || !library || selection.active }] : []),
    ...(importActions || []),
  ];
  return <section ref={root} className={`setting-workspace${resizing ? ' is-resizing' : ''}`} aria-label={tUi('设定库')}
    style={{ '--setting-directory-width': `${actualWidth}px` }}>
    <aside className="setting-directory" aria-label={tUi('设定目录')}>
      <header className="setting-directory-heading">
        <SegmentedTabs size="sm" className="setting-scope-switch" label={tUi('配置范围')} value={scope} onChange={onScopeChange}
          items={[{ value: 'character', label: tUi('角色'), panelId }, ...(globalAvailable ? [{ value: 'global', label: tUi('全局'), panelId }] : [])]} />
        <div className="setting-directory-actions">
          <Menu open={createOpen} portal dense onClose={() => setCreateOpen(false)}
            anchor={<Button data-dsh-control variant="outline" className="setting-create" icon={<Plus size={16} />} aria-label={tUi('新建')}
              aria-haspopup="menu" aria-expanded={createOpen} disabled={saving || !library || selection.active} onClick={() => setCreateOpen(!createOpen)}>{tUi('新建')}</Button>}
            items={createItems.map((item, index) => ({ id: String(index), label: item.label, icon: <item.Icon size={16} /> }))}
            onSelect={id => { setCreateOpen(false); createItems[Number(id)]?.run(); }} />
          {save}
          <Menu open={moreOpen} portal dense onClose={() => setMoreOpen(false)}
            anchor={<Button data-dsh-control variant="outline" className="setting-directory-more" icon={<DotsThree size={18} />}
              aria-label={tUi('设定库更多操作')} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} />}
            items={moreItems} onSelect={id => { setMoreOpen(false); moreItems.find(item => item.id === id)?.run?.(); }} />
        </div>
      </header>
      <div className="setting-directory-search"><Input data-dsh-control className="setting-search-input" type="search" icon={<MagnifyingGlass size={16} />}
        aria-label={scope === 'global' ? tUi('搜索全局设定库') : tUi('搜索设定')} placeholder={scope === 'global' ? tUi('搜索全局设定库') : tUi('搜索设定')}
        value={query} onChange={event => onQueryChange(event.target.value)} /></div>
      {children}
      {scope === 'character' && roleLibrary && <footer className="setting-version"><Menu open={versionOpen} portal side="top" minWidthFromAnchor autoFocus selectedId={roleLibrary.activeVersionId}
        onClose={() => setVersionOpen(false)} anchor={<Button data-dsh-control variant="outline" className="setting-version-button"
          aria-label={tUi('选择设定库版本')} title={version?.name} aria-haspopup="menu" aria-expanded={versionOpen} disabled={saving}
          onClick={() => setVersionOpen(!versionOpen)}><span className="setting-version-label">{tUi('版本')}</span><span className="setting-version-value">{versionLabel(version, roleLibrary.versions.findIndex(item => item.id === version?.id))}</span><CaretDown size={13} /></Button>}
        items={roleLibrary.versions.map((item, index) => ({ id: item.id, label: versionLabel(item, index) }))}
        footer={[{ id: 'manage', label: tUi('管理版本'), icon: <SlidersHorizontal size={14} /> }]}
        onSelect={id => { setVersionOpen(false); if (id === 'manage') onManage(); else onLibraryChange(switchLibraryVersion(roleLibrary, id)); }} /></footer>}
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
