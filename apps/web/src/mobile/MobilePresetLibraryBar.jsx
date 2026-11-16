import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, CaretUp, Plus, X } from '@phosphor-icons/react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { DesktopError } from '@shared/foundation/DesktopError';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { useProductTranslation } from '../app/i18n/ProductLocaleContext.jsx';
import { useMobileBack } from './MobileChrome.jsx';
import { MobileConfirm, MobileNameDialog, useMobileOperation } from './MobileLibraryChrome.jsx';
import './mobile-character-library.css';

// Uses the established character-group presentation and gesture contract.
// Presets keep their stable group IDs and existing catalog mutation boundary.
export function MobilePresetLibraryBar({ groups, model, purpose, selected, onSelect, open, onOpenChange, disabled, onEditingChange }) {
  const tUi = useProductTranslation();
  const ids = useMemo(() => groups.map(group => group.id), [groups]);
  const names = new Map(groups.map(group => [group.id, group.name]));
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(ids);
  const [naming, setNaming] = useState(null), [removing, setRemoving] = useState(null);
  const [ghost, setGhost] = useState(null), [dragged, setDragged] = useState(''), [edgeLeft, setEdgeLeft] = useState(false);
  const strip = useRef(null), panel = useRef(null), gesture = useRef(null), pendingScroll = useRef(null);
  const stripGesture = useRef(null), stripDragged = useRef(false), suppressClick = useRef(false);
  const baseline = useRef(ids), latest = useRef(ids), currentDraft = useRef(draft), mounted = useRef(true);
  latest.current = ids; currentDraft.current = draft;
  const { busy, error, setError, run } = useMobileOperation();
  const locked = editing || busy || disabled;
  useEffect(() => { if (!editing) { setDraft(ids); baseline.current = ids; } }, [ids, editing]);
  useEffect(() => { onEditingChange(editing || busy); return () => onEditingChange(false); }, [editing, busy, onEditingChange]);
  useLayoutEffect(() => {
    const measure = () => setEdgeLeft(strip.current.scrollLeft > 1);
    const observer = new ResizeObserver(measure); observer.observe(strip.current); measure();
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!open) strip.current?.querySelector('[aria-pressed=true]')?.scrollIntoView?.({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest', inline: 'nearest' });
  }, [selected, open]);
  useEffect(() => {
    mounted.current = true;
    const blur = () => end(true);
    const release = event => { if (gesture.current?.pointerId === event.pointerId || pendingScroll.current?.pointerId === event.pointerId) end(event.type === 'pointercancel'); };
    const touchMove = event => { if (gesture.current?.active) event.preventDefault(); };
    const node = panel.current;
    node.addEventListener('touchmove', touchMove, { passive:false });
    window.addEventListener('blur', blur); window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
    return () => { mounted.current = false; clearTimeout(gesture.current?.timer); node.removeEventListener('touchmove', touchMove); window.removeEventListener('blur', blur); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); };
  }, []);
  useMobileBack(() => { if (!locked && !naming && !removing) onOpenChange(false); return true; }, open);
  function choose(id) { if (busy || disabled) return; onSelect(id); onOpenChange(false); }
  function toggleOpen() { if (!locked) { end(); onOpenChange(!open); } }
  function assertCurrent() {
    if (JSON.stringify(latest.current) !== JSON.stringify(baseline.current)) {
      baseline.current = latest.current; setDraft(latest.current);
      throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '分组已在其他位置更新，请按最新列表重试。', { what:'预设分组' });
    }
  }
  function adoptMutation(catalog) {
    const next = catalog.groups.filter(group => group.purpose === purpose).map(group => group.id);
    baseline.current = next;
    setDraft(current => [...current.filter(id => next.includes(id)), ...next.filter(id => !current.includes(id))]);
  }
  async function saveName(raw) {
    const name = raw.trim();
    if (groups.some(group => group.id !== naming.id && group.name === name)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, '分组名称已存在', { what:'分组' });
    assertCurrent();
    adoptMutation(await (naming.id ? model.renameGroup(naming.id, name) : model.createGroup(name, purpose)));
  }
  async function finishEditing() {
    end();
    await run(async () => {
      assertCurrent();
      if (JSON.stringify(draft) !== JSON.stringify(ids)) await model.reorderGroups(draft, purpose);
      setEditing(false);
    });
  }
  function stripDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    stripDragged.current = false; stripGesture.current = { x:event.clientX, scroll:strip.current.scrollLeft, id:event.pointerId };
  }
  function stripMove(event) {
    const current = stripGesture.current; if (!current) return;
    if (!stripDragged.current && Math.abs(event.clientX-current.x)<5) return;
    stripDragged.current = true; strip.current.setPointerCapture(current.id); event.preventDefault(); strip.current.scrollLeft = current.scroll-(event.clientX-current.x);
  }
  function stripEnd() { const current=stripGesture.current; stripGesture.current=null; if(current && strip.current.hasPointerCapture(current.id)) strip.current.releasePointerCapture(current.id); }
  function reorder(source, target) {
    if (!source || !target || source===target || busy) return;
    setDraft(current => { const next=current.filter(id=>id!==source); next.splice(current.indexOf(target),0,source); return next; });
  }
  function down(event,id) {
    pendingScroll.current=null;
    if (!editing || busy || event.button!==0) return;
    suppressClick.current=false;
    const rect=event.currentTarget.getBoundingClientRect(), paint=getComputedStyle(event.currentTarget);
    const current={ id, name:names.get(id), pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, offsetX:event.clientX-rect.left, offsetY:event.clientY-rect.top, width:rect.width, height:rect.height, active:false, before:currentDraft.current,
      paint:{background:paint.backgroundColor,color:paint.color,fontFamily:paint.fontFamily,fontSize:paint.fontSize,fontWeight:paint.fontWeight,lineHeight:paint.lineHeight,'--control-bg':paint.getPropertyValue('--control-bg'),'--muted':paint.getPropertyValue('--muted')} };
    current.timer=setTimeout(()=>{ if(gesture.current!==current)return; current.active=true; panel.current.setPointerCapture(event.pointerId); suppressClick.current=true; setDragged(id); setGhost({...current,left:rect.left,top:rect.top}); navigator.vibrate?.(10); },360);
    gesture.current=current;
  }
  function move(event) {
    const current=gesture.current;
    if(!current) { const scroll=pendingScroll.current; if(scroll?.pointerId===event.pointerId){panel.current.scrollTop+=scroll.y-event.clientY;scroll.y=event.clientY;event.preventDefault();}return; }
    if(!current.active){if(Math.hypot(event.clientX-current.startX,event.clientY-current.startY)>9){end(true);pendingScroll.current={pointerId:event.pointerId,y:event.clientY};suppressClick.current=true;panel.current.scrollTop+=current.startY-event.clientY;panel.current.setPointerCapture(event.pointerId);}return;}
    event.preventDefault();setGhost({...current,left:event.clientX-current.offsetX,top:event.clientY-current.offsetY});
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-reorder-group]');
    if(target&&panel.current.contains(target))reorder(current.id,target.dataset.reorderGroup);
  }
  function end(cancel=false) {
    const current=gesture.current,scroll=pendingScroll.current;clearTimeout(current?.timer);gesture.current=null;pendingScroll.current=null;
    for(const pointer of [current,scroll])if(pointer&&panel.current?.hasPointerCapture(pointer.pointerId))panel.current.releasePointerCapture(pointer.pointerId);
    if(!mounted.current)return;if(cancel&&current?.active)setDraft(current.before);setGhost(null);setDragged('');
  }
  return <>
    <div className="mobile-character-library-group-bar" data-expanded={open}><div className="mobile-character-library-tab-viewport" data-fade-left={edgeLeft}>
      <nav className="mobile-character-library-tabs" aria-label={tUi('预设分组')} ref={strip} onScroll={()=>setEdgeLeft(strip.current.scrollLeft>1)} onPointerDown={stripDown} onPointerMove={stripMove} onPointerUp={stripEnd} onPointerCancel={stripEnd}>
        {['',...ids].map(id=><button type="button" key={id} aria-pressed={selected===id} disabled={busy||disabled} onClick={()=>{if(stripDragged.current){stripDragged.current=false;return;}choose(id);}}>{id?names.get(id):tUi('全部')}</button>)}
      </nav></div><div className="mobile-character-library-group-actions"><button type="button" className="mobile-character-library-icon" aria-label={tUi(open?'收起分组':'展开分组')} aria-expanded={open} disabled={locked} onClick={toggleOpen}><CaretDown size={20}/></button></div>
    </div>
    {open&&<button className="mobile-character-library-group-scrim" aria-label={tUi('关闭分组面板')} disabled={locked} onClick={()=>!locked&&onOpenChange(false)}/>}
    <div className={`mobile-character-library-panel-reveal${open?' is-open':''}`} inert={!open?true:undefined} aria-hidden={!open}>
      <section className="mobile-character-library-group-panel" ref={panel} aria-label={tUi('我的分组')} onPointerMove={move} onPointerUp={()=>end()} onPointerCancel={()=>end(true)} onLostPointerCapture={()=>end(true)}>
        <header className="mobile-character-library-panel-header"><h2>{tUi('我的分组')}</h2>{editing&&<span>{tUi('长按拖动排序')}</span>}<button type="button" className="mobile-character-library-edit-mode" disabled={busy||disabled} onClick={()=>{if(editing)void finishEditing();else{baseline.current=ids;setDraft(ids);setError('');setEditing(true);}}}>{tUi(editing?'完成编辑':'进入编辑')}</button><button className="mobile-character-library-icon" type="button" aria-label={tUi('收起分组')} disabled={locked} onClick={toggleOpen}><CaretUp size={20}/></button></header>
        <div className={`mobile-character-library-group-grid${editing?' is-editing':''}`}><div className="mobile-character-library-group-cell"><button type="button" className="mobile-character-library-group-chip mobile-character-library-fixed" aria-pressed={!selected} disabled={busy||disabled||editing} onClick={()=>choose('')}>{tUi('全部')}</button></div>
          {(editing?draft:ids).map((id,index)=><div key={id} data-reorder-group={id} className={`mobile-character-library-group-cell${dragged===id?' is-dragging':''}`}>
            <button type="button" className="mobile-character-library-group-chip" aria-pressed={selected===id} disabled={busy||disabled} aria-label={editing?tUi('分组 {value0}，长按拖动，点击改名',{value0:names.get(id)}):names.get(id)} onPointerDown={event=>down(event,id)} onContextMenu={event=>editing&&event.preventDefault()} onKeyDown={event=>{const step=['ArrowLeft','ArrowUp'].includes(event.key)?-1:['ArrowRight','ArrowDown'].includes(event.key)?1:0;if(editing&&step&&draft[index+step]){event.preventDefault();reorder(id,draft[index+step]);}}} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}if(editing)setNaming({id,name:names.get(id)});else choose(id);}}><span>{names.get(id)}</span></button>
            {editing&&<button type="button" className="mobile-character-library-remove-group" aria-label={tUi('删除分组 {value0}',{value0:names.get(id)})} disabled={busy} onClick={()=>{setError('');setRemoving({id,name:names.get(id)});}}><span><X size={12} weight="bold"/></span></button>}
          </div>)}<div className="mobile-character-library-group-cell"><Button data-dsh-control variant="outline" className="mobile-character-library-group-chip mobile-character-library-new-group" disabled={busy||disabled} onClick={()=>setNaming({id:'',name:''})}><Plus size={17}/><span>{tUi('新建')}</span></Button></div>
        </div>{error&&!removing&&<p className="mobile-inline-error" role="alert">{error}</p>}
      </section>
    </div>
    {ghost&&open&&editing&&createPortal(<div className="mobile-character-library-drag-ghost mobile-character-library-group-chip" style={{...ghost.paint,left:ghost.left,top:ghost.top,width:ghost.width,height:ghost.height}} aria-hidden="true">{ghost.name}<span className="mobile-character-library-floating-delete"><X size={11} weight="bold"/></span></div>,document.body)}
    {naming&&<MobileNameDialog title={tUi(naming.id?'重命名分组':'新建分组')} initialName={naming.name} onClose={()=>setNaming(null)} onSave={saveName}/>}
    {removing&&<MobileConfirm title={tUi('删除分组？')} onClose={()=>setRemoving(null)} busy={busy} error={error} onConfirm={()=>run(async()=>{assertCurrent();adoptMutation(await model.deleteGroup(removing.id));if(selected===removing.id)onSelect('');setRemoving(null);})}>“{removing.name}{tUi('”中的预设将移至未分组。')}</MobileConfirm>}
  </>;
}
