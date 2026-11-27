import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { GearSix, ListChecks, Plus, SlidersHorizontal } from '../icons/interfaceIcons.jsx';
import { ImportIcon } from '../icons/index.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { resolveFailure } from '../../utils/failureText.js';
import '../styles/editor-library-workspace.css';
import { AppErrorDialog } from './AppErrorDialog.jsx';
import { EditorDirectoryActions, EditorDirectoryHeading } from './EditorDirectoryHeading.jsx';
import { EditorDirectorySearch } from './EditorDirectorySearch.jsx';
import { EditorScopeTabs } from './EditorScopeTabs.jsx';
import { EditorWorkspaceVersion } from './EditorVersionPicker.jsx';
import { EDITOR_DIRECTORY_DEFAULT_WIDTH, useEditorPresentation } from './EditorPresentationContext.jsx';

function ImportLibraryVersion({ onImportVersion, disabled }) {
  const tUi = useProductTranslation();
  const input = useRef(null), unavailable = useRef(disabled);
  const [reading, setReading] = useState(false), [error, setError] = useState(null);
  useLayoutEffect(() => { unavailable.current = disabled; }, [disabled]);

  async function importFile(event) {
    const field = event.currentTarget, file = field.files?.[0];
    field.value = '';
    if (!file) return;
    setReading(true);
    try {
      const json = await file.text();
      if (input.current !== field) return;
      if (unavailable.current) throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '编辑器暂时无法导入配置版本。', { what: '导入版本' });
      onImportVersion(json);
    } catch (cause) {
      if (input.current === field) setError(resolveFailure(cause, { fallback: tUi('导入版本失败') }));
    } finally {
      if (input.current === field) setReading(false);
    }
  }

  return <>
    <Button data-dsh-control variant="ghost" className="setting-toolbar-button setting-toolbar-import"
      icon={<ImportIcon size={17} />} aria-label={tUi('导入')} title={tUi('导入为新版本')}
      disabled={disabled || reading} aria-busy={reading || undefined} onClick={() => input.current?.click()}><span>{tUi('导入')}</span></Button>
    <input ref={input} type="file" accept="application/json,.json" hidden onChange={importFile} />
    {error && <AppErrorDialog notice={{ id: error.text, message: error.text, failure: error }} onDismiss={() => setError(null)} />}
  </>;
}

export function EditorLibraryWorkspace({ label, scope, ownerScope, ownerId, onScopeChange, panelId, config, query, onQueryChange, createItems, selection, saving, disabled, save, onManage, onImportVersion, onVersionChange, inspector, children, directoryHeading, directoryActions, className = '' }) {
  const tUi = useProductTranslation();
  const { characterStudio } = useEditorPresentation();
  const root = useRef(null), drag = useRef(null);
  const [width, setWidth] = useState(EDITOR_DIRECTORY_DEFAULT_WIDTH), [available, setAvailable] = useState(1260);
  const [resizing, setResizing] = useState(false), [createOpen, setCreateOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const max = Math.max(260, Math.min(520, available - 388)), actualWidth = Math.max(260, Math.min(width, max));
  const resize = next => setWidth(Math.max(260, Math.min(max, next)));
  const versionActionsDisabled = saving || disabled || !config || selection?.active;
  useLayoutEffect(() => {
    const measure = () => { const next = root.current?.getBoundingClientRect().width; if (next) setAvailable(next); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root.current); window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const heading = (
    <EditorDirectoryHeading unified={characterStudio} title={directoryHeading ?? label} leading={!directoryHeading && <EditorScopeTabs
      value={scope} ownerValue={ownerScope} ownerLabel={ownerScope === 'preset' ? tUi('预设') : tUi('角色')}
      panelId={panelId} onChange={onScopeChange} />}>
      <EditorDirectoryActions label={tUi('操作')} className="setting-directory-actions">{directoryActions ?? <>
      <Menu portal dense open={createOpen} onClose={() => setCreateOpen(false)} anchor={<Button data-dsh-control variant="ghost" className="setting-toolbar-button setting-toolbar-create" icon={<Plus size={17} />}
        aria-label={tUi('新建{value0}', { value0: label })} title={tUi('新建')} aria-haspopup="menu" aria-expanded={createOpen}
        disabled={saving || disabled || !config || selection.active} onClick={() => setCreateOpen(!createOpen)}><span>{tUi('新建')}</span></Button>}
        items={createItems.map((item, index) => ({ id: String(index), label: item.label, disabled: item.disabled, icon: item.Icon ? <item.Icon size={16} /> : undefined }))} onSelect={id => { setCreateOpen(false); createItems[Number(id)]?.run(); }} />
      {onImportVersion && <ImportLibraryVersion key={JSON.stringify([ownerScope, ownerId, scope])} onImportVersion={onImportVersion} disabled={versionActionsDisabled} />}
      {onImportVersion && <Button data-dsh-control variant="ghost" className="setting-toolbar-button setting-toolbar-version-manage"
        icon={<GearSix size={16} />} aria-label={tUi('版本管理')} title={tUi('版本管理')} aria-haspopup="dialog"
        disabled={versionActionsDisabled} onClick={onManage}><span>{tUi('版本管理')}</span></Button>}
      {save}
      {!characterStudio && <Menu portal dense open={moreOpen} onClose={() => setMoreOpen(false)} anchor={<Button data-dsh-control variant="ghost"
        className="setting-toolbar-button setting-toolbar-icon" icon={<SlidersHorizontal size={19} />}
        aria-label={tUi('{value0}目录操作', { value0: label })} title={tUi('管理')} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)} />}
        items={[{ id: 'select', label: selection.active ? tUi('完成多选') : tUi('多选'), icon: <ListChecks size={16} />, disabled: saving || !config }]}
        onSelect={() => { setMoreOpen(false); selection.toggle(); }} />}
    </>}</EditorDirectoryActions></EditorDirectoryHeading>
  );
  return <section ref={root} className={`setting-workspace rs-workspace${resizing ? ' is-resizing' : ''}${characterStudio ? ' is-character-studio' : ''} ${className}`} aria-label={label}
    style={{ '--setting-directory-width': `${actualWidth}px` }}>
    {characterStudio && heading}
    <aside className="setting-directory editor-heading-surface" aria-label={tUi('{value0}目录', { value0: label })}>
      {!characterStudio && heading}
      <EditorDirectorySearch label={tUi('搜索{value0}', { value0: label })} query={query} onQueryChange={onQueryChange}
        selection={characterStudio ? selection : undefined} disabled={saving || disabled || (!directoryHeading && !config)} />
      {children}
      <EditorWorkspaceVersion key={scope} label={tUi('选择{value0}版本', { value0: label })} config={config}
        disabled={saving} onSelect={onVersionChange} onManage={onManage} />
    </aside>
    <div className={`setting-pane-resizer${resizing ? ' is-dragging' : ''}`} role="separator" aria-label={tUi('调整目录宽度')} aria-orientation="vertical" aria-valuemin={260} aria-valuemax={max} aria-valuenow={actualWidth} tabIndex={0}
      title={tUi('拖动调整目录宽度，双击恢复')} onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width: actualWidth }; event.currentTarget.setPointerCapture?.(event.pointerId); setResizing(true); }}
      onPointerMove={event => { if (drag.current) resize(drag.current.width + event.clientX - drag.current.x); }}
      onPointerUp={event => { drag.current = null; setResizing(false); if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onLostPointerCapture={() => { drag.current = null; setResizing(false); }} onPointerCancel={() => { drag.current = null; setResizing(false); }} onDoubleClick={() => setWidth(EDITOR_DIRECTORY_DEFAULT_WIDTH)}
      onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); resize(event.key === 'Home' ? 260 : event.key === 'End' ? max : actualWidth + (event.key === 'ArrowLeft' ? -16 : 16)); } }} />
    <section className="setting-document" aria-label={tUi('{value0}编辑区', { value0: label })}>{inspector || <div className="setting-document-empty">{tUi('选择{value0}开始编辑', { value0: label })}</div>}</section>
  </section>;
}
