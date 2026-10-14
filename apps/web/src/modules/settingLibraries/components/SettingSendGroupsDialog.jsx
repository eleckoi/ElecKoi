import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowsMerge, MagnifyingGlass, Trash, X } from '../../../ui/icons/interfaceIcons.jsx';
import { MainPageContext } from '../../../app/windows/MainPageContext.jsx';
import { SystemBarOverlay } from '../../../ui/ui/SystemBarOverlay.jsx';
import { settingEntryPaths, compareSettingOrder } from '@eleckoi/dsh-client-roleplay/host/setting-send-groups.mjs';
import { descendants } from '../model/settingLibraryTree.js';
import { createId } from '../model/settingLibraryEditing.js';

export function SettingSendGroupsDialog({ library, scopeGroupId = '', initialSendGroupId = '', onEntriesChange, onClose }) {
  const view = useContext(MainPageContext);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState(initialSendGroupId);
  const [picked, setPicked] = useState(() => new Set(library.entries.filter(entry =>
    initialSendGroupId && entry.sendGroupId === initialSendGroupId).map(entry => entry.id)));
  const paths = useMemo(() => settingEntryPaths(library), [library]);
  const candidates = useMemo(() => library.entries.filter(entry => entry.kind === 'normal' && entry.dynamicMode !== 'ejs_reference')
    .sort(compareSettingOrder(library)), [library]);
  const scope = useMemo(() => scopeGroupId ? descendants(library.groups, scopeGroupId) : null, [library.groups, scopeGroupId]);
  const scoped = candidates.filter(entry => !scope || scope.has(entry.groupId) || (editingId && entry.sendGroupId === editingId));
  const groups = [...new Set(scoped.map(entry => entry.sendGroupId).filter(Boolean))];
  const visible = scoped.filter(entry => (paths.get(entry.id) || '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => view?.registerBackHandler?.(() => { onClose(); return true; }), [view?.registerBackHandler, onClose]);
  useEffect(() => {
    const keys = event => {
      if (!dialogRef.current?.contains(document.activeElement) || event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, [onClose]);

  function chooseGroup(id) {
    setEditingId(id);
    setPicked(new Set(candidates.filter(entry => id && entry.sendGroupId === id).map(entry => entry.id)));
  }
  function removeGroup() {
    onEntriesChange(library.entries.map(entry => entry.sendGroupId === editingId ? { ...entry, sendGroupId: '' } : entry));
    chooseGroup('');
  }
  function applyGroup() {
    const id = editingId || createId('send-group');
    let entries = library.entries.map(entry => picked.has(entry.id) ? { ...entry, sendGroupId: id }
      : editingId && entry.sendGroupId === editingId ? { ...entry, sendGroupId: '' } : entry);
    const counts = new Map();
    for (const entry of entries) if (entry.sendGroupId) counts.set(entry.sendGroupId, (counts.get(entry.sendGroupId) || 0) + 1);
    entries = entries.map(entry => entry.sendGroupId && counts.get(entry.sendGroupId) < 2 ? { ...entry, sendGroupId: '' } : entry);
    onEntriesChange(entries);
    onClose();
  }

  return createPortal(<SystemBarOverlay className="setting-library-dialog-overlay setting-send-groups-overlay" onMouseDown={onClose}>
    <section ref={dialogRef} className="setting-send-groups-dialog" role="dialog" aria-modal="true" aria-label="组合发送" onMouseDown={event => event.stopPropagation()}>
      <header><ArrowsMerge size={20} /><h2>组合发送</h2><button ref={closeRef} type="button" aria-label="关闭组合发送" onClick={onClose}><X size={20} /></button></header>
      <div className="setting-send-groups-tools">
        <div className="setting-send-groups-tabs" role="group" aria-label="发送组合">
          <button type="button" aria-pressed={!editingId} onClick={() => chooseGroup('')}>新组合</button>
          {groups.map((id, index) => <button key={id} type="button" aria-pressed={editingId === id} onClick={() => chooseGroup(id)}
            title={candidates.filter(entry => entry.sendGroupId === id).map(entry => paths.get(entry.id)).join('\n')}>组合 {index + 1}<span>{candidates.filter(entry => entry.sendGroupId === id).length}</span></button>)}
        </div>
        <label className="setting-library-search"><MagnifyingGlass size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索条目" aria-label="搜索组合条目" /></label>
      </div>
      <div className="setting-send-groups-list">
        {visible.map(entry => <label key={entry.id} className={`setting-send-groups-row${picked.has(entry.id) ? ' is-picked' : ''}`}>
          <input type="checkbox" checked={picked.has(entry.id)} aria-label={`组合 ${paths.get(entry.id)}`} onChange={() => setPicked(current => {
            const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next;
          })} />
          <span><strong>{entry.title || '未命名设定'}</strong><small>{paths.get(entry.id)}</small></span>
          {!entry.enabled ? <em>停用</em> : entry.sendGroupId ? <ArrowsMerge size={15} aria-label="已有发送组合" /> : null}
        </label>)}
        {!visible.length && <p className="setting-library-empty">没有可选条目</p>}
      </div>
      <footer>
        {editingId ? <button type="button" className="is-destructive" onClick={removeGroup}><Trash size={16} />解除组合</button> : <span>{picked.size} 条已选</span>}
        <button type="button" className="is-primary" disabled={picked.size < 2} onClick={applyGroup}><ArrowsMerge size={17} />{editingId ? '更新组合' : '组合发送'}</button>
      </footer>
    </section>
  </SystemBarOverlay>, document.body);
}
