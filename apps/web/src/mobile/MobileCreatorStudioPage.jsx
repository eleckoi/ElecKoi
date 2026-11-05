import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, UserCircle } from '@phosphor-icons/react';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { Avatar } from '../ui/ui/Avatar.jsx';
import { characterAvatar, characterName } from '../utils/characterDisplay.js';
import { IconFlatListOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { DshNewChatIcon } from '../ui/icons/dshComposerIcons.jsx';
import { MobileDialog, MobileHeader, MobileSearch } from './MobileChrome.jsx';
import { FailureAlert } from '../ui/ui/FailureAlert.jsx';
import { MobileCreatorStudioConversation } from './MobileCreatorStudioConversation.jsx';
import './mobile-creator-studio.css';

export function MobileCreatorStudioPage() {
  const view = useMainPageView();
  const model = view.creatorStudio.sessions;
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  const characters = useSyncExternalStore(view.characters.subscribe, view.characters.getSnapshot);
  const drawer = useSyncExternalStore(view.navigation.sidebar.subscribe, view.navigation.sidebar.getSnapshot).shown;
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
  async function choose(characterId) {
    if (await perform(() => state.active ? model.selectCharacter(characterId) : model.create(characterId))) {
      setPicker(false); view.navigation.closeSidebar();
    }
  }
  async function create() {
    if (await perform(() => model.create(target?.id || ''))) view.navigation.closeSidebar();
  }
  return <div className="mobile-root-page mobile-creator-studio-page">
    <MobileHeader title={<><span className="creator-studio-heading-title">AI 创作工作室</span><span className="creator-studio-heading-preset" ref={setHeaderTarget} /></>} back={() => view.goBack()}
      leading={<button type="button" aria-label="工作室侧边栏" aria-expanded={drawer} onClick={view.openWorkspaceDrawer}><IconFlatListOutlineRegular size={20} /></button>}>
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
    {picker && <CreatorStudioCharacterPicker characters={characters} selectedId={target?.id || ''} busy={busy} error={error} onSelect={choose} onClose={() => setPicker(false)} />}
  </div>;
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
