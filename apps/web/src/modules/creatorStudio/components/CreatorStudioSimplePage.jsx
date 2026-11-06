import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { ArrowLeft, Check, ListChecks, PushPin, UserCircle, X } from '@phosphor-icons/react';
import logoIcon from '../../../assets/eleckoi-app-icon.png';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { DshSearchField } from '../../../ui/ui/DshSearchField.jsx';
import { characterAvatar, characterGroup, characterName } from '../../../utils/characterDisplay.js';
import { DshNewChatIcon, DshPanelLeftIcon, DshEllipsisIcon, DshEditIcon, DshTrashIcon } from '../../../ui/icons/dshComposerIcons.jsx';
import { WindowControls } from '../../../app/windows/shell/components/TitleBar.jsx';
import { CreatorStudioConversation } from './CreatorStudioConversation.jsx';
import { useRightbarLayout } from '../../../app/windows/shell/hooks/useRightbarLayout.js';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import '../styles/creator-studio-simple.css';

function conversationGroups(items) {
  const groups = new Map(), now = Date.now();
  for (const item of [...items].sort((a, b) => a.pinned === b.pinned ? a.pinned ? a.pinIndex - b.pinIndex : b.updatedAt - a.updatedAt : a.pinned ? -1 : 1)) {
    const date = new Date(item.updatedAt);
    const label = item.pinned ? '置顶' : now - item.updatedAt < 30 * 86400000 ? '30 天内' : `${date.getFullYear()}年${date.getMonth() + 1}月`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  return [...groups];
}

export function CreatorStudioSimplePage({ characterCatalog, model, models, presetCatalog, renderConversation, rightbar, onBack, nativePanel, onReturnToConversation }) {
  const tUi = useProductTranslation();
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const characters = useSyncExternalStore(characterCatalog.subscribe, characterCatalog.getSnapshot);
  const [collapsed, setCollapsed] = useState(false), [query, setQuery] = useState('');
  const shell = useRef(null);
  const collapseSidePanel = useCallback(() => setCollapsed(true), []);
  const rightbarLayout = useRightbarLayout({ model: rightbar, shellRef: shell, sidePanelCollapsed: collapsed, collapseSidePanel });
  const [matches, setMatches] = useState(null), [searchError, setSearchError] = useState(null);
  const [selecting, setSelecting] = useState(false), [selected, setSelected] = useState(new Set());
  const [picker, setPicker] = useState(false), [menuId, setMenuId] = useState('');
  const [renaming, setRenaming] = useState(null), [name, setName] = useState('');
  const [deleting, setDeleting] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const initialized = useRef(false), mountVersion = useRef(0), menuRoot = useRef(null);
  const perform = useCallback(async action => {
    setBusy(true); setError(null);
    try { await action(); return true; }
    catch (cause) { setError(cause); return false; }
    finally { setBusy(false); }
  }, []);
  useEffect(() => {
    const version = ++mountVersion.current;
    if (!initialized.current) { initialized.current = true; void perform(() => model.restoreRecent()); }
    return () => queueMicrotask(() => { if (mountVersion.current === version) { model.release(); initialized.current = false; } });
  }, [model, perform]);
  useEffect(() => {
    if (!menuId) return;
    const close = event => { if (event.type === 'keydown' ? event.key === 'Escape' : !menuRoot.current?.contains(event.target)) setMenuId(''); };
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', close); };
  }, [menuId]);
  useEffect(() => {
    setMatches(null); setSearchError(null);
    if (!query.trim()) return;
    const abort = new AbortController();
    const timer = setTimeout(() => model.search(query.trim(), abort.signal).then(result => {
      if (!abort.signal.aborted) setMatches(result);
    }).catch(cause => { if (!abort.signal.aborted) setSearchError(cause); }), 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [model, query]);
  const target = characters.collection.items.find(item => item.id === state.active?.characterId);
  const active = state.items.find(item => item.sessionId === state.active?.sessionId);
  const contentHits = new Set(matches?.items.map(item => item.sessionId));
  const groups = conversationGroups(state.items.filter(item => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || contentHits.has(item.sessionId)));
  const unpinSelected = selected.size > 0 && state.items.filter(item => selected.has(item.sessionId)).every(item => item.pinned);
  function toggle(id) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function stopSelecting() { setSelecting(false); setSelected(new Set()); }
  async function pinSelected() {
    if (await perform(async () => { for (const id of selected) await model.pin(id, !unpinSelected); })) stopSelecting();
  }
  async function create() { await perform(() => model.create(target?.id || '')); }
  async function choose(characterId) { if (await perform(() => model.selectCharacter(characterId))) setPicker(false); }
  async function remove() {
    if (await perform(async () => {
      for (const item of deleting) {
        await model.delete(item.sessionId);
        setDeleting(current => current?.filter(value => value.sessionId !== item.sessionId) || null);
        setSelected(current => { const next = new Set(current); next.delete(item.sessionId); return next; });
      }
      if (!model.getSnapshot().active) await model.restoreRecent();
    })) { setDeleting(null); stopSelecting(); }
  }
  return <main ref={shell} className={`qq-shell creator-simple-shell${collapsed ? ' is-sidebar-collapsed' : ''}`}
    style={rightbarLayout.shellStyle} data-rightbar-dragging={rightbarLayout.dragging || undefined}>
    <header className="creator-simple-titlebar" data-tauri-drag-region>
      <div className="creator-simple-titlebar-sidebar" data-tauri-drag-region>
        <button type="button" aria-label={nativePanel ? tUi("返回工作室对话") : tUi("返回工作室入口")} title={nativePanel ? tUi("返回工作室对话") : tUi("返回工作室入口")} onClick={nativePanel ? onReturnToConversation : onBack}><ArrowLeft size={18} /></button>
        <img src={logoIcon} alt="" draggable="false" /><strong>{tUi("AI 创作工作室")}</strong>
        <button type="button" className="creator-simple-sidebar-toggle" aria-label={collapsed ? tUi("展开对话列表") : tUi("收起对话列表")} title={collapsed ? tUi("展开对话列表") : tUi("收起对话列表")}
          aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}><DshPanelLeftIcon size={19} /></button>
      </div>
      <div className="creator-simple-titlebar-space" data-tauri-drag-region /><WindowControls />
    </header>
    <section className="creator-simple-workspace">
      {!collapsed && <aside className="creator-simple-sidebar" aria-label={tUi("工作室对话列表")}>
        <button type="button" className="creator-simple-new" disabled={busy} onClick={create}><DshNewChatIcon size={18} />{tUi("新对话")}</button>
        <button type="button" className="creator-simple-character" disabled={busy || !state.active} onClick={() => setPicker(true)}>
          {target ? <Avatar as="span" src={characterAvatar(target)} name={characterName(target, tUi)} /> : <UserCircle size={20} />}<span>{target ? characterName(target, tUi) : tUi("选择角色")}</span>
        </button>
        <DshSearchField value={query} onValueChange={setQuery} placeholder={tUi("搜索对话内容…")} ariaLabel={tUi("搜索工作室对话")} />
        <FailureAlert failure={searchError} className="creator-simple-error" />
        <nav className="creator-simple-history">{groups.map(([label, items], index) => <section key={label}>
          <div className="creator-simple-group-heading"><h3>{label}</h3>{index === 0 && <button type="button" aria-label={selecting ? tUi("退出对话管理") : tUi("管理对话")} disabled={busy}
            onClick={() => { if (selecting) stopSelecting(); else { setSelecting(true); setMenuId(''); } }}>{selecting ? <X size={18} /> : <ListChecks size={18} />}</button>}</div>
          {items.map(item => <div key={item.sessionId} className={`creator-simple-history-row${item.sessionId === state.active?.sessionId ? ' is-current' : ''}`}>
          {selecting ? <label className="creator-simple-history-selection"><input type="checkbox" disabled={busy} checked={selected.has(item.sessionId)} onChange={() => toggle(item.sessionId)} /><span>{item.title}</span></label> : <><button type="button" className="creator-simple-history-title" disabled={busy} title={item.title} aria-current={item.sessionId === state.active?.sessionId ? 'page' : undefined}
            onClick={() => void perform(() => model.open(item.sessionId))}>{item.title}</button>
          <div className="creator-simple-history-menu" ref={menuId === item.sessionId ? menuRoot : undefined}>
            <button type="button" aria-label={tUi("管理 {value0}", {value0: item.title})} aria-expanded={menuId === item.sessionId} onClick={() => setMenuId(menuId === item.sessionId ? '' : item.sessionId)}><DshEllipsisIcon size={18} /></button>
            {menuId === item.sessionId && <div role="menu">
              <button type="button" role="menuitem" onClick={() => { setRenaming(item); setName(item.title); setMenuId(''); }}><DshEditIcon size={16} />{tUi("重命名")}</button>
              <button type="button" role="menuitem" onClick={() => { setMenuId(''); void perform(() => model.pin(item.sessionId, !item.pinned)); }}><PushPin size={16} />{item.pinned ? tUi("取消置顶") : tUi("置顶")}</button>
              <button type="button" role="menuitem" onClick={() => { setDeleting([item]); setMenuId(''); }}><DshTrashIcon size={16} />{tUi("删除对话")}</button>
            </div>}
          </div></>}
        </div>)}</section>)}
          {query.trim() && matches && !groups.length && <p className="creator-simple-history-state">{tUi("没有匹配的对话")}</p>}
          {matches?.hasMore && <p className="creator-simple-history-state">{tUi("结果较多，请缩小搜索范围")}</p>}
        </nav>
        {selecting && <footer className="creator-simple-selection-footer">
          <button type="button" disabled={busy || !selected.size} onClick={pinSelected}><PushPin size={17} />{unpinSelected ? tUi("取消置顶") : tUi("置顶")}</button>
          <button type="button" disabled={busy || !selected.size} onClick={() => setDeleting(state.items.filter(item => selected.has(item.sessionId)))}><DshTrashIcon size={17} />{tUi("删除")}</button>
        </footer>}
      </aside>}
      <section className="creator-simple-content" aria-label={tUi("工作室对话")}>
        {nativePanel ? nativePanel : <>
        <FailureAlert failure={error || state.error} className="creator-simple-error" />
        {state.reference ? renderConversation({ reference: state.reference, component: CreatorStudioConversation,
          props: { model, models, presetCatalog, creating: busy, editing: state.editingSessionId === state.active?.sessionId, title: active?.title || tUi("新对话"),
            onCreate: create, onSelectCharacter: () => setPicker(true), onError: setError } }) : <div className="creator-simple-loading">
          {busy || state.status === 'loading' ? <span role="status">{tUi("加载对话…")}</span> : <button type="button" onClick={() => void perform(() => model.restoreRecent())}>{tUi("重试")}</button>}
        </div>}
        </>}
      </section>
      <div className="creator-simple-rightbar">
        {rightbar?.render({ width: rightbarLayout.width, viewportWidth: rightbarLayout.viewportWidth, canShow: rightbarLayout.canShow })}
      </div>
    </section>
    {rightbarLayout.showResizeHandle && rightbarLayout.resizeHandle}
    {picker && <CreatorStudioCharacterDialog collection={characters.collection} selectedId={target?.id || ''} busy={busy}
      error={error || characters.error} onSelect={choose} onClose={() => setPicker(false)} />}
    <Modal open={!!renaming} title={tUi("重命名对话")} closeLabel={tUi("关闭")} onClose={() => !busy && setRenaming(null)} className="creator-simple-dialog"
      footer={<button type="button" disabled={busy || !name.trim()} onClick={() => void perform(() => model.rename(renaming.sessionId, name.trim())).then(success => success && setRenaming(null))}>{tUi("保存")}</button>}>
      <FailureAlert failure={error} /><input data-modal-autofocus aria-label={tUi("对话名称")} value={name} onChange={event => setName(event.target.value)} />
    </Modal>
    <Modal open={!!deleting} title={tUi("删除对话")} closeLabel={tUi("关闭")} onClose={() => !busy && setDeleting(null)} className="creator-simple-dialog"
      footer={<button type="button" disabled={busy} onClick={remove}>{tUi("删除")}</button>}>
      <FailureAlert failure={error} /><p>{deleting?.length === 1 ? tUi("删除“{value0}”？", {value0: deleting[0].title}) : tUi("删除选中的 {value0} 个对话？", {value0: deleting?.length || 0})}</p>
    </Modal>
  </main>;
}

export function CreatorStudioCharacterDialog({ collection, selectedId, busy, error, onSelect, onClose }) {
  const tUi = useProductTranslation();
  const [query, setQuery] = useState(''), [group, setGroup] = useState('');
  const items = collection.items.filter(item => (!group || characterGroup(item) === group) && characterName(item, tUi).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <Modal open title={tUi("选择角色")} closeLabel={tUi("关闭")} onClose={() => !busy && onClose()} className="creator-simple-character-dialog">
    <DshSearchField value={query} onValueChange={setQuery} placeholder={tUi("搜索角色…")} ariaLabel={tUi("搜索角色")} />
    {!!collection.groups.length && <div className="creator-simple-character-groups">{['', ...collection.groups].map(id => <button type="button" key={id} aria-pressed={group === id} onClick={() => setGroup(id)}>{id || tUi("全部角色")}</button>)}</div>}
    <FailureAlert failure={error} className="creator-simple-error" />
    <div className="creator-simple-character-list">
      <button type="button" disabled={busy} aria-pressed={!selectedId} onClick={() => onSelect('')}><UserCircle size={36} /><span>{tUi("不选择角色")}</span>{!selectedId && <Check size={18} />}</button>
      {items.map(item => <button type="button" key={item.id} disabled={busy} aria-label={tUi("选择角色 {value0}", {value0: characterName(item, tUi)})} aria-pressed={selectedId === item.id} onClick={() => onSelect(item.id)}>
        <Avatar as="span" src={characterAvatar(item)} name={characterName(item, tUi)} /><span>{characterName(item, tUi)}</span>{selectedId === item.id && <Check size={18} />}
      </button>)}
    </div>
  </Modal>;
}
