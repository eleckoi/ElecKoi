import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, CaretUp, Plus, SortDescending, X } from '@phosphor-icons/react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useProductTranslation } from '../app/i18n/ProductLocaleContext.jsx';
import { characterGroup } from '../utils/characterDisplay.js';
import { MobileConfirm, MobileNameDialog, useMobileOperation } from './MobileLibraryChrome.jsx';
import { useMobileBack } from './MobileChrome.jsx';
import { CHARACTER_SORT_OPTIONS } from './mobileCharacterSorting.js';
import './mobile-character-library.css';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function MobileCharacterLibraryBar({ groups, characters, selected, onSelect, onSave, sort, onSort,
  open, onOpenChange, disabled = false, destination = false }) {
  const tUi = useProductTranslation();
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(groups);
  const [naming, setNaming] = useState(null), [removing, setRemoving] = useState('');
  const [ghost, setGhost] = useState(null), [dragged, setDragged] = useState(''), [sortOpen, setSortOpen] = useState(false);
  const [edgeLeft, setEdgeLeft] = useState(false);
  const strip = useRef(null), panel = useRef(null), gesture = useRef(null), suppressClick = useRef(false);
  const stripGesture = useRef(null), stripDragged = useRef(false), sortButton = useRef(null), sortAnchor = useRef(null), pendingPanelScroll = useRef(null);
  const latestGroups = useRef(groups), baseline = useRef(groups), currentDraft = useRef(draft), mounted = useRef(true);
  latestGroups.current = groups; currentDraft.current = draft;
  const { busy, error, setError, run } = useMobileOperation();
  const locked = editing || busy || disabled;
  useEffect(() => { if (!editing) { setDraft(groups); baseline.current = groups; } }, [groups, editing]);
  useLayoutEffect(() => {
    const measure = () => setEdgeLeft(strip.current.scrollLeft > 1);
    measure(); const observer = new ResizeObserver(measure); observer.observe(strip.current);
    return () => observer.disconnect();
  }, [groups]);
  useEffect(() => {
    mounted.current = true;
    const blur = () => end(true);
    const release = event => { if (gesture.current?.pointerId === event.pointerId || pendingPanelScroll.current?.pointerId === event.pointerId) end(event.type === 'pointercancel'); };
    window.addEventListener('blur', blur);
    window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
    return () => { mounted.current = false; clearTimeout(gesture.current?.timer); window.removeEventListener('blur', blur); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); };
  }, []);
  useEffect(() => {
    const node = panel.current;
    const move = event => { if (gesture.current?.active) event.preventDefault(); };
    node.addEventListener('touchmove', move, { passive: false });
    return () => node.removeEventListener('touchmove', move);
  }, []);
  useMobileBack(() => { if (sortOpen) setSortOpen(false); else if (!locked && naming === null && !removing) onOpenChange(false); return true; }, open || sortOpen);
  async function choose(name) {
    if (disabled || busy) return;
    if (await onSelect(name) !== false) onOpenChange(false);
  }
  useLayoutEffect(() => {
    if (!open) strip.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'nearest', inline: 'nearest' });
  }, [selected, open]);
  function stripDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    stripDragged.current = false; stripGesture.current = { x: event.clientX, scroll: strip.current.scrollLeft, id: event.pointerId };
  }
  function stripMove(event) {
    const current = stripGesture.current; if (!current) return;
    if (!stripDragged.current && Math.abs(event.clientX - current.x) < 5) return;
    stripDragged.current = true; strip.current.setPointerCapture(current.id); event.preventDefault(); strip.current.scrollLeft = current.scroll - (event.clientX - current.x);
  }
  function stripEnd() {
    const current = stripGesture.current; stripGesture.current = null;
    if (current && strip.current?.hasPointerCapture(current.id)) strip.current.releasePointerCapture(current.id);
  }
  function reorder(source, target) {
    if (!source || !target || source === target || busy) return;
    setDraft(current => { const next = current.filter(name => name !== source); next.splice(current.indexOf(target), 0, source); return next; });
  }
  function down(event, name) {
    pendingPanelScroll.current = null;
    if (!editing || busy || event.button !== 0) return;
    suppressClick.current = false;
    const rect = event.currentTarget.getBoundingClientRect(), paint = getComputedStyle(event.currentTarget);
    const active = { name, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, height: rect.height, active: false, before: currentDraft.current,
      paint: { background: paint.backgroundColor, color: paint.color, fontFamily: paint.fontFamily, fontSize: paint.fontSize, fontWeight: paint.fontWeight, lineHeight: paint.lineHeight, '--control-bg': paint.getPropertyValue('--control-bg'), '--muted': paint.getPropertyValue('--muted') } };
    active.timer = setTimeout(() => {
      if (gesture.current !== active) return;
      active.active = true; panel.current?.setPointerCapture(event.pointerId); suppressClick.current = true; setDragged(name);
      setGhost({ name, paint: active.paint, left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      navigator.vibrate?.(10);
    }, 360);
    gesture.current = active;
  }
  function move(event) {
    const current = gesture.current;
    if (!current) {
      const scroll = pendingPanelScroll.current;
      if (scroll && scroll.pointerId === event.pointerId) { panel.current.scrollTop += scroll.y - event.clientY; scroll.y = event.clientY; event.preventDefault(); }
      return;
    }
    if (!current.active) {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 9) {
        end(true); pendingPanelScroll.current = { pointerId: event.pointerId, y: event.clientY }; suppressClick.current = true;
        panel.current.scrollTop += current.startY - event.clientY;
        panel.current?.setPointerCapture(event.pointerId);
      }
      return;
    }
    event.preventDefault();
    setGhost({ name: current.name, paint: current.paint, left: event.clientX - current.offsetX, top: event.clientY - current.offsetY, width: current.width, height: current.height });
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-reorder-group]');
    if (target && panel.current?.contains(target)) reorder(current.name, target.dataset.reorderGroup);
  }
  function end(cancel = false) {
    const scroll = pendingPanelScroll.current;
    const current = gesture.current; clearTimeout(current?.timer); gesture.current = null; pendingPanelScroll.current = null;
    if (current && panel.current?.hasPointerCapture(current.pointerId)) panel.current.releasePointerCapture(current.pointerId);
    if (scroll && panel.current?.hasPointerCapture(scroll.pointerId)) panel.current.releasePointerCapture(scroll.pointerId);
    if (!mounted.current) return;
    if (cancel && current?.active) setDraft(current.before);
    setGhost(null); setDragged('');
  }
  async function commit(next, assignments = []) {
    if (JSON.stringify(latestGroups.current) !== JSON.stringify(baseline.current)) {
      setDraft(latestGroups.current); baseline.current = latestGroups.current;
      throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '分组已在其他位置更新，请按最新列表重试。', { what: '角色分组' });
    }
    await onSave(next, assignments);
    baseline.current = next; setDraft(next);
  }
  async function saveName(raw) {
    const name = raw.trim();
    if (draft.includes(name) && name !== naming) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, '分组名称已存在', { what: '分组' });
    const next = naming ? draft.map(value => value === naming ? name : value) : [...draft, name];
    const assignments = naming ? characters.filter(item => characterGroup(item) === naming).map(item => ({ characterId: item.id, group: name })) : [];
    await commit(next, assignments);
    if (naming && selected === naming) onSelect(name);
  }
  function toggleOpen() { if (!locked && !disabled) { end(); setSortOpen(false); onOpenChange(!open); } }
  return <>
    <div className="mobile-character-library-group-bar" data-expanded={open}>
      <div className="mobile-character-library-tab-viewport" data-fade-left={edgeLeft}>
        <nav className="mobile-character-library-tabs" aria-label={tUi('角色分组')} ref={strip} onScroll={() => setEdgeLeft(strip.current.scrollLeft > 1)} onPointerDown={stripDown} onPointerMove={stripMove} onPointerUp={stripEnd} onPointerCancel={stripEnd}>
          {['', ...groups].map(name => <button type="button" key={name} aria-pressed={selected === name} disabled={disabled || busy} onClick={() => { if (stripDragged.current) { stripDragged.current = false; return; } choose(name); }}>{name || tUi('全部')}</button>)}
        </nav>
      </div>
      <div className="mobile-character-library-group-actions"><Menu portal dense open={sortOpen} onClose={() => setSortOpen(false)} align="end" listClassName="mobile-character-library-sort-menu" anchorRef={sortAnchor} returnFocus={() => sortButton.current}
        anchor={<button className="mobile-character-library-icon" type="button" ref={sortButton} aria-label={tUi('角色卡排序')} aria-haspopup="menu" aria-expanded={sortOpen} disabled={disabled || busy} onClick={() => setSortOpen(!sortOpen)}><span className="mobile-character-library-sort-anchor" ref={sortAnchor}><SortDescending size={22} /></span></button>}
        selectedId={sort} items={CHARACTER_SORT_OPTIONS.map(([id, label]) => ({ id, label: tUi(label) }))} onSelect={id => { setSortOpen(false); onSort(id); }} />
        <button className="mobile-character-library-icon" type="button" aria-label={tUi(open ? '收起分组' : '展开分组')} aria-expanded={open} disabled={locked || disabled} onClick={toggleOpen}><CaretDown size={20} /></button></div>
    </div>
    {open && <button className="mobile-character-library-group-scrim" aria-label={tUi('关闭分组面板')} disabled={locked} onClick={() => !locked && onOpenChange(false)} />}
    <div className={`mobile-character-library-panel-reveal${open ? ' is-open' : ''}`} inert={!open ? true : undefined} aria-hidden={!open}>
      <section className="mobile-character-library-group-panel" ref={panel} aria-label={tUi(destination ? '移动到分组' : '我的分组')} onPointerMove={move} onPointerUp={event => { end(); if (panel.current?.hasPointerCapture(event.pointerId)) panel.current.releasePointerCapture(event.pointerId); }} onPointerCancel={() => end(true)} onLostPointerCapture={() => end(true)}>
        <header className="mobile-character-library-panel-header"><h2>{tUi(destination ? '移动到分组' : '我的分组')}</h2>{editing && <span>{tUi('长按拖动排序')}</span>}{!destination && <button className="mobile-character-library-edit-mode" type="button" disabled={busy || disabled} onClick={() => {
          end(); setError('');
          if (!editing) { baseline.current = groups; setDraft(groups); setEditing(true); }
          else void run(async () => { if (JSON.stringify(draft) !== JSON.stringify(groups)) await commit(draft); setEditing(false); });
        }}>{tUi(editing ? '完成编辑' : '进入编辑')}</button>}<button type="button" className="mobile-character-library-icon" aria-label={tUi('收起分组')} disabled={locked} onClick={toggleOpen}><CaretUp size={20} /></button></header>
        <div className={`mobile-character-library-group-grid${editing ? ' is-editing' : ''}`}>
          <div className="mobile-character-library-group-cell"><button type="button" className="mobile-character-library-group-chip mobile-character-library-fixed" aria-pressed={!selected} disabled={busy || disabled} onClick={() => !editing && choose('')}>{tUi(destination ? '未分组' : '全部')}</button></div>
          {(editing ? draft : groups).map((name, index) => <div className={`mobile-character-library-group-cell${dragged === name ? ' is-dragging' : ''}`} key={name} data-reorder-group={name}>
            <button type="button" className="mobile-character-library-group-chip" aria-pressed={selected === name} disabled={busy || disabled} title={name} aria-label={editing ? tUi('分组 {value0}，长按拖动，点击改名', { value0: name }) : name}
              onPointerDown={event => down(event, name)} onContextMenu={event => editing && event.preventDefault()}
              onKeyDown={event => { const step = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : 0; if (editing && step && draft[index + step]) { event.preventDefault(); reorder(name, draft[index + step]); } }}
              onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } if (editing) setNaming(name); else choose(name); }}><span>{name}</span></button>
            {editing && <button className="mobile-character-library-remove-group" type="button" disabled={busy} aria-label={tUi('删除分组 {value0}', { value0: name })} onClick={() => { setError(''); setRemoving(name); }}><span><X size={12} weight="bold" /></span></button>}
          </div>)}
          {!destination && <div className="mobile-character-library-group-cell"><button type="button" className="mobile-character-library-group-chip mobile-character-library-new-group" disabled={busy || disabled} onClick={() => setNaming('')}><Plus size={17} /><span>{tUi('新建')}</span></button></div>}
        </div>
        {error && !removing && <p className="mobile-inline-error" role="alert">{error}</p>}
      </section>
    </div>
    {ghost && open && editing && createPortal(<div className="mobile-character-library-drag-ghost mobile-character-library-group-chip" style={{ ...ghost.paint, left: ghost.left, top: ghost.top, width: ghost.width, height: ghost.height }} aria-hidden="true">{ghost.name}<span className="mobile-character-library-floating-delete"><X size={11} weight="bold" /></span></div>, document.body)}
    {naming !== null && <MobileNameDialog title={tUi(naming ? '重命名分组' : '新建分组')} initialName={naming} onClose={() => setNaming(null)} onSave={saveName} />}
    {removing && <MobileConfirm title={tUi('删除分组？')} onClose={() => setRemoving('')} busy={busy} error={error} onConfirm={() => run(async () => {
      await commit(draft.filter(name => name !== removing), characters.filter(item => characterGroup(item) === removing).map(item => ({ characterId: item.id, group: '' })));
      if (selected === removing) onSelect(''); setRemoving('');
    })}>{tUi('删除“{value0}”分组，角色卡保留。', { value0: removing })}</MobileConfirm>}
  </>;
}
