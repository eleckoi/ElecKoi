import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { useMemo, useState } from 'react';
import { DotsThree, PushPin, Trash } from '@phosphor-icons/react';
import { MessagesPage } from '../../../../packages/client/features/dsh-client-conversations/src/page.jsx';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { resolveChatWallpaper } from '../modules/appearance/index.js';
import { characterAvatar, characterCover, characterName } from '../utils/characterDisplay.js';
import { SidebarCharacterArtwork } from '../ui/ui/SidebarCharacterArtwork.jsx';
import { MobileDialog, MobileHeader, MobileState, useMobileScroll } from './MobileChrome.jsx';
import { FailureAlert } from '../ui/ui/FailureAlert.jsx';
import { formatDate } from '../utils/format.js';
import { MobileSwipeRow } from './MobileSwipeRow.jsx';
import { MobileBackIcon } from './MobileIcons.jsx';
import { MobileConversationPage } from './MobileConversationPage.jsx';

export function MobileMessagesPage() {
  const tUi = useProductTranslation();
  const view = useMainPageView();
  const { chat } = view;
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(null);
  const [hideEntry, setHideEntry] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const characters = useMemo(() => new Map(chat.characters.items.map(item => [item.id, item])), [chat.characters.items]);
  if (view.route.kind === 'conversation') {
    const wallpaper = resolveChatWallpaper({ character: chat.chatBackgroundCharacter, persona: chat.chatPersona,
      globalWallpaper: view.appearance.globalChatWallpaper });
    return <MobileConversationPage wallpaper={chat.sessionId || chat.chatCharacter?.character_id ? wallpaper : undefined}>
      <MessagesPage submitOnEnter={false} headerLeading={<button type="button" className="mobile-conversation-back" aria-label={tUi("返回")} onClick={view.goBack}><MobileBackIcon /></button>} />
    </MobileConversationPage>;
  }
  async function run(action) {
    setBusy(true); setError(null);
    try { await action(); setMenu(null); }
    catch (cause) { setError(cause); }
    finally { setBusy(false); }
  }
  return <div className="mobile-root-page">
    <MobileHeader title={tUi("消息")} onSearch={view.openSearch} onAdd={() => setPicker(true)} addLabel={tUi("新建对话")} />
    <MobileMessageList sessions={chat.filteredSessions} characters={characters} pinnedIds={chat.pinnedIds} artworkMode={view.appearance.sidebarCharacterArtwork} loading={view.routeBusy || busy} onOpen={view.selectConversation} onMenu={setMenu}
      onPin={item => run(() => chat.togglePinChat(item.id))} onHide={setHideEntry} />
    {error && !menu && !hideEntry && <FailureAlert failure={error} className="mobile-inline-error" />}
    {picker && <MobileDialog title={tUi("选择角色")} onClose={() => setPicker(false)}>
      <div className="mobile-picker-list">{chat.characters.items.map(item => <button type="button" key={item.id} disabled={view.routeBusy} onClick={async () => { setPicker(false); await view.openCharacterConversation(item.id); }}>
        <SidebarCharacterArtwork mode={view.appearance.sidebarCharacterArtwork} name={characterName(item, tUi)} cover={characterCover(item)} avatar={characterAvatar(item)} /><span>{characterName(item, tUi)}</span>
      </button>)}</div>
      {!chat.characters.items.length && <button type="button" onClick={() => { setPicker(false); view.selectPanel('character'); }}>{tUi("创建角色")}</button>}
    </MobileDialog>}
    {menu && <MobileDialog title={menu.character_name || tUi("会话操作")} busy={busy} onClose={() => setMenu(null)}>
      <button type="button" disabled={busy} onClick={() => run(() => chat.togglePinChat(menu.id))}><PushPin size={22} />{chat.pinnedIds.includes(menu.id) ? tUi("取消置顶") : tUi("置顶会话")}</button>
      <button type="button" disabled={busy} onClick={() => { setHideEntry(menu); setMenu(null); }}><Trash size={22} />{tUi("隐藏会话入口")}</button>
      <FailureAlert failure={error} />
    </MobileDialog>}
    {hideEntry && <MobileDialog title={tUi("删除消息入口？")} busy={busy} onClose={() => setHideEntry(null)}>
      <p>{tUi("只会从消息列表隐藏这个入口；角色和聊天记录都会保留。")}</p>
      <button type="button" disabled={busy} onClick={() => run(async () => { await chat.hideChatEntry(hideEntry.id); setHideEntry(null); })}>{tUi("删除入口")}</button>
      <FailureAlert failure={error} />
    </MobileDialog>}
  </div>;
}

export function MobileMessageList({ sessions, characters, pinnedIds, artworkMode = 'cover', loading, onOpen, onMenu, onPin, onHide }) {
  const tUi = useProductTranslation();
  const ref = useMobileScroll('messages');
  const [openKey, setOpenKey] = useState(null);
  return <div ref={ref} className={`mobile-scroll mobile-message-list${sessions.length ? '' : ' is-empty'}`}>
    {sessions.map(item => {
      const character = characters.get(item.character_id);
      const name = item.character_name || characterName(character, tUi);
      return <MobileSwipeRow key={item.id} rowKey={item.id} openKey={openKey} onOpenKeyChange={setOpenKey} disabled={loading} actions={[
        { label: pinnedIds.includes(item.id) ? tUi("取消置顶") : tUi("置顶"), icon: <PushPin size={19} />, onClick: () => onPin(item) },
        { label: tUi("删除"), icon: <Trash size={19} />, destructive: true, onClick: () => onHide(item) },
      ]}>{safeClick => <div className={`mobile-message-row${pinnedIds.includes(item.id) ? ' is-pinned' : ''}`}>
        <button type="button" className="mobile-message-open" disabled={loading} onClick={() => safeClick(() => onOpen(item.id))} onContextMenu={event => { event.preventDefault(); onMenu(item); }}>
          <SidebarCharacterArtwork mode={artworkMode} name={name} cover={characterCover(character) || item.character_persona?.assistant_cover || item.character_avatar} avatar={characterAvatar(character) || item.character_avatar} />
          <span className="mobile-message-text"><span className="mobile-message-heading"><strong>{name}</strong><time>{formatDate(item.updated_at, tUi)}</time></span><span className="mobile-message-preview">{item.summary || tUi("暂无历史对话")}</span></span>
        </button>
        <button type="button" className="mobile-message-menu" aria-label={tUi("{value0}的会话操作", {value0: name})} onClick={() => onMenu(item)}><DotsThree size={22} /></button>
      </div>}</MobileSwipeRow>;
    })}
    {!sessions.length && <MobileState empty={tUi("暂无会话")} />}
  </div>;
}
