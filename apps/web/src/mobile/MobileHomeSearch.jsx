import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { X } from '@phosphor-icons/react';
import { DshSearchField } from '../ui/ui/DshSearchField.jsx';
import { Avatar } from '../ui/ui/Avatar.jsx';
import { SidebarCharacterArtwork } from '../ui/ui/SidebarCharacterArtwork.jsx';
import { characterAvatar, characterCover, characterGroup, characterName } from '../utils/characterDisplay.js';
import { filterConversationSessions } from '../modules/chat/model/chatSessionView.js';
import { catalogItem } from '../modules/models/model/modelProviderCatalog.js';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { MobileProviderLogo } from './MobileModelConfigDetail.jsx';
import { useMobileBack } from './MobileChrome.jsx';
import './mobile-search.css';
import { bestEffort } from "../utils/swallowedFailure.js";

export function MobileHomeSearch({ history, onCommit, onForget, onClear, onClose }) {
  const tUi = useProductTranslation();
  const view = useMainPageView();
  const { chat } = view;
  const models = useSyncExternalStore(view.models.subscribe, view.models.getSnapshot);
  const characters = useSyncExternalStore(view.characters.subscribe, view.characters.getSnapshot);
  const [query, setQuery] = useState('');
  const [closing, setClosing] = useState(false);
  const pageRef = useRef(null);
  const motionRef = useRef(null);
  const closingRef = useRef(false);
  const queryKey = query.trim();
  const key = queryKey.toLocaleLowerCase();
  const characterMap = useMemo(() => new Map(chat.characters.items.map(item => [item.id, item])), [chat.characters.items]);
  const sessions = filterConversationSessions(chat.visibleConversationSessions, queryKey);
  const characterResults = chat.characters.items.filter(item => `${characterName(item, tUi)} ${characterGroup(item)}`.toLocaleLowerCase().includes(key));
  const modelResults = models.configs.filter(config => {
    const provider = catalogItem(config.provider, tUi);
    return [config.name, config.model, config.base_url, provider.id, provider.label].join(' ').toLocaleLowerCase().includes(key);
  });
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const page = pageRef.current;
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      motionRef.current = page.animate?.([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2,0,0,1)' });
    }
    const focus = window.setTimeout(() => page.querySelector('input')?.focus({ preventScroll: true }), 100);
    return () => {
      window.clearTimeout(focus); motionRef.current?.cancel();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  async function dismiss(action) {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    pageRef.current.querySelector('input')?.blur();
    const from = getComputedStyle(pageRef.current).transform;
    motionRef.current?.cancel();
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const motion = pageRef.current.animate?.([{ transform: from }, { transform: 'translateY(100%)' }], { duration: 240, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
      motionRef.current = motion;
      if (motion) await motion.finished.catch(bestEffort);
    }
    onClose(action);
  }
  useMobileBack(() => { void dismiss(); return true; });
  function open(action) {
    onCommit(queryKey);
    void dismiss(action);
  }
  return <section ref={pageRef} className="mobile-home-search" aria-label={tUi("搜索")} inert={closing ? true : undefined}>
    <header><h1>{tUi("搜索")}</h1><button type="button" onClick={() => dismiss()}>{tUi("取消")}</button></header>
    <div className="mobile-home-search-field" onKeyDown={event => {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
      event.preventDefault(); if (queryKey) onCommit(queryKey); event.target.blur();
    }}><DshSearchField value={query} onValueChange={setQuery} ariaLabel={tUi("会话、角色、模型")} placeholder={tUi("会话、角色、模型")} /></div>
    <div className="mobile-home-search-scroll">
      {!key ? <><div className="mobile-search-section-heading"><h2>{tUi("最近搜索")}</h2>{history.length > 0 && <button type="button" aria-label={tUi("清空搜索记录")} onClick={onClear}><X size={18} /></button>}</div>
        {history.length ? <div className="mobile-search-history">{history.map(term => <div key={term}><button type="button" onClick={() => setQuery(term)}>{term}</button><button type="button" aria-label={tUi("删除搜索记录 {value0}", {value0: term})} onClick={() => onForget(term)}><X size={16} /></button></div>)}</div> : <p className="mobile-search-empty">{tUi("还没有搜索记录")}</p>}
      </> : <>
        {sessions.length > 0 && <section aria-label={tUi("会话结果")}><h2>{tUi("会话 ")}<span>{sessions.length}</span></h2>{sessions.map(item => {
          const character = characterMap.get(item.character_id);
          const name = item.character_name || characterName(character, tUi);
          return <button type="button" className="mobile-search-result" key={item.id} disabled={view.routeBusy} onClick={() => open(() => view.selectConversation(item.id))}>
            <SidebarCharacterArtwork mode={view.appearance.sidebarCharacterArtwork} name={name} cover={characterCover(character) || item.character_persona?.assistant_cover || item.character_avatar} avatar={characterAvatar(character) || item.character_avatar} />
            <span><strong>{name}</strong><small>{item.summary || tUi("暂无历史对话")}</small></span></button>;
        })}</section>}
        {characterResults.length > 0 && <section aria-label={tUi("角色结果")}><h2>{tUi("角色 ")}<span>{characterResults.length}</span></h2>{characterResults.map(item => <button type="button" className="mobile-search-result" key={item.id} onClick={() => open(() => {
          chat.selectCharacter(item.id); view.openSearchRoute({ panel: 'character', kind: 'character-profile', characterId: item.id });
        })}><Avatar name={characterName(item, tUi)} src={characterAvatar(item)} /><span><strong>{characterName(item, tUi)}</strong>{characterGroup(item) && <small>{characterGroup(item)}</small>}</span></button>)}</section>}
        {models.status === 'loading' && <p role="status">{tUi("正在读取模型…")}</p>}
        {models.error && <p role="alert">{models.error}</p>}
        {characters.status === 'loading' && <p role="status">{tUi("正在读取角色…")}</p>}
        {characters.error && <p role="alert">{characters.error}</p>}
        {modelResults.length > 0 && <section aria-label={tUi("模型结果")}><h2>{tUi("模型 ")}<span>{modelResults.length}</span></h2>{modelResults.map(config => <button type="button" className="mobile-search-result" key={config.id} onClick={() => open(() => view.openSearchRoute({ panel: 'model', kind: 'model-editor', configId: config.id }))}>
          <MobileProviderLogo provider={catalogItem(config.provider, tUi)} /><span><strong>{config.name || config.model || tUi("未命名配置")}</strong><small>{[catalogItem(config.provider, tUi).label, config.model].filter(Boolean).join(' · ')}</small></span></button>)}</section>}
        {!sessions.length && !characterResults.length && !modelResults.length && models.status === 'ready' && characters.status === 'ready' && <p className="mobile-search-empty">{tUi("没有匹配结果")}</p>}
      </>}
    </div>
  </section>;
}
