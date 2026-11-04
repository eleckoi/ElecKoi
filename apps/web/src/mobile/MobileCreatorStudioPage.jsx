import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Plus, UserCircle, PushPin } from '@phosphor-icons/react';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { Avatar } from '../ui/ui/Avatar.jsx';
import { characterAvatar, characterName } from '../utils/characterDisplay.js';
import { IconFlatListOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { DshNewChatIcon, DshEllipsisIcon, DshEditIcon, DshTrashIcon, DshSearchIcon } from '../ui/icons/dshComposerIcons.jsx';
import { MobileDialog, MobileHeader, MobileSearch, useMobileBack } from './MobileChrome.jsx';
import { FailureAlert } from '../ui/ui/FailureAlert.jsx';
import { MobileCreatorStudioConversation } from './MobileCreatorStudioConversation.jsx';
import './mobile-creator-studio.css';

export function MobileCreatorStudioPage() {
  const view = useMainPageView();
  const model = view.creatorStudio.sessions;
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const characters = useSyncExternalStore(view.characters.subscribe, view.characters.getSnapshot);
  const [drawer, setDrawer] = useState(false);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [headerTarget, setHeaderTarget] = useState(null);
  const [cornerTarget, setCornerTarget] = useState(null);
  const initialized = useRef(false);
  const mountVersion = useRef(0);
  const target = characters.collection.items.find(item => item.id === state.active?.characterId);
  async function perform(action) {
    setBusy(true); setError(null);
    try { await action(); return true; }
    catch (cause) { setError(cause); return false; }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const version = ++mountVersion.current;
    if (!initialized.current) {
      initialized.current = true;
      void perform(async () => {
        await model.restoreRecent();
      });
    }
    return () => queueMicrotask(() => { if (mountVersion.current === version) { model.release(); initialized.current = false; } });
  }, [model]);
  useMobileBack(() => { setDrawer(false); return true; }, drawer && !picker);
  async function choose(characterId) {
    if (await perform(() => state.active ? model.selectCharacter(characterId) : model.create(characterId))) {
      setPicker(false); setDrawer(false);
    }
  }
  async function create() {
    if (await perform(() => model.create(target?.id || ''))) setDrawer(false);
  }
  return <div className="mobile-root-page mobile-creator-studio-page">
    <MobileHeader title={<><span className="creator-studio-heading-title">AI 创作工作室</span><span className="creator-studio-heading-preset" ref={setHeaderTarget} /></>} back={() => view.goBack()}
      leading={<button type="button" aria-label="工作室侧边栏" aria-expanded={drawer} onClick={() => { setDrawer(true); void perform(() => model.refresh()); }}><IconFlatListOutlineRegular size={20} /></button>}>
      <button type="button" aria-label="新建工作室对话" disabled={busy} onClick={() => void create()}><DshNewChatIcon size={22} /></button>
      <span className="creator-studio-heading-corner" ref={setCornerTarget} />
    </MobileHeader>
    <FailureAlert failure={error || state.error} className="creator-studio-error" />
    <section className="creator-studio-conversation" aria-label="工作室对话">
      {state.reference ? view.renderCreatorStudioConversation({ reference: state.reference, component: MobileCreatorStudioConversation,
        props: { model, headerTarget, cornerTarget, editing: state.editingSessionId === state.active?.sessionId, onCreate: create, onSelectCharacter: () => setPicker(true), onError: setError } }) :
        <div className="creator-studio-start">{busy || state.status === 'loading' ? <span className="creator-studio-spinner" role="status" aria-label="加载对话" /> :
          <button type="button" onClick={() => void perform(() => model.restoreRecent())}>重试</button>}</div>}
    </section>
    {drawer && !picker && <CreatorStudioSidebar model={model} state={state} target={target} busy={busy} error={error || state.error} perform={perform}
      onCreate={create} onSelectCharacter={() => setPicker(true)} onClose={() => setDrawer(false)} />}
    {picker && <CreatorStudioCharacterPicker characters={characters} selectedId={target?.id || ''} busy={busy} error={error} onSelect={choose} onClose={() => setPicker(false)} />}
  </div>;
}

function sessionGroups(items) {
  const groups = new Map();
  const now = Date.now();
  for (const item of [...items].sort((a, b) => a.pinned === b.pinned ? a.pinned ? a.pinIndex - b.pinIndex : b.updatedAt - a.updatedAt : a.pinned ? -1 : 1)) {
    const date = new Date(item.updatedAt);
    const label = item.pinned ? '置顶' : now - item.updatedAt < 30 * 86400000 ? '30 天内' : `${date.getFullYear()}年${date.getMonth() + 1}月`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  return [...groups];
}

export function CreatorStudioSidebar({ model, state, target, busy, error, perform, onCreate, onSelectCharacter, onClose }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [menuId, setMenuId] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [title, setTitle] = useState('');
  const [deletingIds, setDeletingIds] = useState(null);
  const menuRoot = useRef(null);
  useEffect(() => {
    if (!query.trim()) { setMatches(null); setSearchError(null); return; }
    const abort = new AbortController();
    setMatches(null); setSearchError(null);
    const timer = setTimeout(() => model.search(query.trim(), abort.signal).then(result => {
      if (!abort.signal.aborted) setMatches(result);
    }).catch(error => { if (!abort.signal.aborted) setSearchError(error); }), 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [model, query]);
  useEffect(() => {
    if (!menuId) return;
    const close = event => { if (!menuRoot.current?.contains(event.target)) setMenuId(''); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuId]);
  const contentHits = new Set(matches?.items.map(item => item.sessionId));
  const visible = state.items.filter(item => !query.trim() || item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || contentHits.has(item.sessionId));
  const groups = sessionGroups(visible);
  function toggle(id) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function close() { if (selecting) { setSelecting(false); setSelected(new Set()); } else onClose(); }
  async function remove() {
    const success = await perform(async () => {
      for (const id of deletingIds) {
        await model.delete(id);
        setSelected(current => { const next = new Set(current); next.delete(id); return next; });
        setDeletingIds(current => current?.filter(value => value !== id) || null);
      }
      if (!model.getSnapshot().active) await model.restoreRecent();
    });
    if (success) { setDeletingIds(null); setSelecting(false); }
  }
  async function pinSelected() {
    const unpin = state.items.filter(item => selected.has(item.sessionId)).every(item => item.pinned);
    if (await perform(async () => { for (const id of selected) await model.pin(id, !unpin); })) { setSelecting(false); setSelected(new Set()); }
  }
  return <>
    <MobileDialog title={selecting ? '选择对话' : '对话'} className="creator-studio-drawer" systemBarSurface busy={busy} onClose={close}>
      {!selecting && <>
        <div className="creator-studio-sidebar-search"><DshSearchIcon size={20} /><input type="search" aria-label="搜索对话内容" placeholder="搜索对话内容…" value={query} onChange={event => setQuery(event.target.value)} /></div>
        <div className="creator-studio-sidebar-actions">
          <button type="button" className="creator-studio-sidebar-action" disabled={busy} onClick={onCreate}><DshNewChatIcon size={20} />新对话</button>
          <button type="button" className="creator-studio-sidebar-action creator-studio-sidebar-character" aria-label={target ? `选择角色 ${characterName(target)}` : '选择角色'} disabled={busy} onClick={onSelectCharacter}>
            {target ? <Avatar as="span" src={characterAvatar(target)} name={characterName(target)} /> : <UserCircle size={20} />}
            <span>{target ? characterName(target) : '选择角色'}</span>
          </button>
        </div>
      </>}
      <FailureAlert failure={error || searchError} className="creator-studio-error" />
      <nav className="creator-studio-session-list" aria-label="工作室对话列表">
        {groups.map(([label, items], groupIndex) => <section key={label}>
          <div className="creator-studio-group-heading"><h3>{label}</h3>
            {!selecting && groupIndex === 0 && <button type="button" className="creator-studio-select-trigger" aria-label="管理对话" onClick={() => { setSelecting(true); setMenuId(''); }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><path d="M11 6h10M11 18h10" /></svg>
            </button>}
          </div>{items.map(item => <div className={`creator-studio-session-row${item.sessionId === state.active?.sessionId ? ' current' : ''}`} key={item.sessionId}>
          {selecting ? <label><input type="checkbox" checked={selected.has(item.sessionId)} onChange={() => toggle(item.sessionId)} /><span>{item.title}</span></label> : <>
            <button type="button" className="creator-studio-session-title" disabled={busy} aria-current={state.active?.sessionId === item.sessionId ? 'page' : undefined}
              onClick={() => void perform(() => model.open(item.sessionId)).then(success => success && onClose())}>{item.title}</button>
            <div className="creator-studio-session-menu" ref={menuId === item.sessionId ? menuRoot : undefined}>
              <button type="button" aria-label={`管理 ${item.title}`} aria-expanded={menuId === item.sessionId} onClick={() => setMenuId(menuId === item.sessionId ? '' : item.sessionId)}><DshEllipsisIcon size={20} /></button>
              {menuId === item.sessionId && <div role="menu">
                <button type="button" role="menuitem" onClick={() => { setRenaming(item); setTitle(item.title); setMenuId(''); }}><DshEditIcon size={18} />重命名对话</button>
                <button type="button" role="menuitem" onClick={() => { setDeletingIds([item.sessionId]); setMenuId(''); }}><DshTrashIcon size={18} />删除对话</button>
              </div>}
            </div>
          </>}
        </div>)}</section>)}
        {query.trim() && matches && !visible.length && <p className="mobile-state">没有匹配的对话</p>}
        {matches?.hasMore && <p className="mobile-state">结果较多，请缩小搜索范围</p>}
      </nav>
      {selecting && <footer className="creator-studio-selection-footer">
        <button type="button" disabled={busy || !selected.size} onClick={pinSelected}><PushPin size={20} />{state.items.filter(item => selected.has(item.sessionId)).every(item => item.pinned) && selected.size ? '取消置顶' : '置顶'}</button>
        <button type="button" disabled={busy || !selected.size} onClick={() => setDeletingIds([...selected])}><DshTrashIcon size={20} />删除</button>
      </footer>}
    </MobileDialog>
    {renaming && <MobileDialog title="重命名对话" busy={busy} onClose={() => setRenaming(null)}>
      <FailureAlert failure={error} />
      <input aria-label="对话名称" value={title} onChange={event => setTitle(event.target.value)} />
      <button type="button" disabled={busy || !title.trim()} onClick={() => void perform(() => model.rename(renaming.sessionId, title.trim())).then(success => success && setRenaming(null))}>保存</button>
    </MobileDialog>}
    {deletingIds && <MobileDialog title="删除对话" className="creator-studio-confirmation" busy={busy} onClose={() => setDeletingIds(null)}>
      <FailureAlert failure={error} />
      <p>删除选中的{deletingIds.length}个对话？</p>
      <div className="confirmation-actions">
        <button type="button" disabled={busy} onClick={() => setDeletingIds(null)}>取消</button>
        <button type="button" className="is-destructive" disabled={busy} onClick={remove}>{busy ? '删除中…' : '删除'}</button>
      </div>
    </MobileDialog>}
  </>;
}

export function CreatorStudioCharacterPicker({ characters, selectedId, busy, error, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const items = characters.collection.items.filter(item => (!group || item.group === group) && String(item.name || '').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <MobileDialog title="选择角色" className="creator-studio-character-picker" busy={busy} onClose={onClose}>
    <MobileSearch value={query} onChange={setQuery} label="搜索角色" />
    {characters.collection.groups.length > 0 && <div className="creator-studio-character-groups" role="group" aria-label="角色分组">
      {['', ...characters.collection.groups].map(id => <button type="button" key={id} aria-pressed={id === group} onClick={() => setGroup(id)}>{id || '全部角色'}</button>)}
    </div>}
    <FailureAlert failure={error || characters.error} />
    <div className="creator-studio-character-list" role="group" aria-label="角色">
      <button type="button" aria-pressed={!selectedId} disabled={busy} onClick={() => onSelect('')}><span>不选择角色</span>{!selectedId && <Check size={20} />}</button>
      {items.map(item => <button type="button" key={item.id} aria-pressed={item.id === selectedId} disabled={busy} onClick={() => onSelect(item.id)}>
        <Avatar as="span" src={item.avatar} name={item.name} /><span>{item.name}</span>{item.id === selectedId && <Check size={20} />}
      </button>)}
      {!items.length && <p className="mobile-state">{characters.status === 'loading' ? '正在加载…' : '没有匹配的角色'}</p>}
    </div>
  </MobileDialog>;
}
