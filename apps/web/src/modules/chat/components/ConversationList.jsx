import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon, PinIcon, TrashIcon, WindowIcon } from "../../../ui/icons/index.jsx";
import { ALL_CHARACTERS, characterAvatar, characterCover, characterGroup, characterName } from "../../../utils/characterDisplay.js";
import { SidebarCharacterArtwork } from "../../../ui/ui/SidebarCharacterArtwork.jsx";
import { formatDate } from "../../../utils/format.js";
import { SidebarSectionHeader } from "../../../ui/ui/SidebarSectionHeader.jsx";
import { SidebarScrollArea } from "../../../ui/ui/SidebarScrollArea.jsx";

export function ConversationList({
  keyword,
  setKeyword,
  sessions,
  sessionId,
  pinnedIds,
  characters,
  artworkMode,
  onLoadChat,
  onOpenCharacterChat,
  onGoCharacterSettings,
  onTogglePinChat,
  onOpenChatWindow,
  onHideChat,
}) {
  const tUi = useProductTranslation();
  const listRef = useRef(null);
  const searchRowRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
  const [characterPickerStyle, setCharacterPickerStyle] = useState(null);
  const [collapsedPickerGroups, setCollapsedPickerGroups] = useState({});
  const resolvedArtworkMode = artworkMode === "avatar" ? "avatar" : "cover";
  const characterById = useMemo(
    () => new Map((characters?.items || []).map((character) => [character.id, character])),
    [characters?.items],
  );

  const groupedCharacters = useMemo(() => {
    const names = [...new Set((characters?.groups || []).map((group) => group.trim()).filter(Boolean))];
    for (const character of characters?.items || []) {
      const group = characterGroup(character);
      if (group && !names.includes(group)) names.push(group);
    }
    const items = characters?.items || [];
    return [
      { group: ALL_CHARACTERS, items },
      ...names.map((group) => ({
        group,
        items: items.filter((character) => characterGroup(character) === group),
      })),
    ];
  }, [characters]);

  const updateCharacterPickerPosition = useCallback(() => {
    const list = listRef.current;
    const searchRow = searchRowRef.current;
    if (!list || !searchRow || typeof window === "undefined") return;
    const listRect = list.getBoundingClientRect();
    const searchRect = searchRow.getBoundingClientRect();
    const top = Math.round(searchRect.bottom - 2);
    const availableHeight = Math.max(96, window.innerHeight - top - 10);
    setCharacterPickerStyle({
      left: `${Math.round(listRect.left + 10)}px`,
      top: `${top}px`,
      width: `${Math.max(0, Math.round(listRect.width - 20))}px`,
      maxHeight: `${Math.min(430, availableHeight)}px`,
    });
  }, []);

  useLayoutEffect(() => {
    if (!addCharacterOpen) {
      setCharacterPickerStyle(null);
      return undefined;
    }
    updateCharacterPickerPosition();
    window.addEventListener("resize", updateCharacterPickerPosition);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateCharacterPickerPosition) : null;
    if (observer && listRef.current) observer.observe(listRef.current);
    if (observer && searchRowRef.current) observer.observe(searchRowRef.current);
    return () => {
      window.removeEventListener("resize", updateCharacterPickerPosition);
      observer?.disconnect();
    };
  }, [addCharacterOpen, updateCharacterPickerPosition]);

  useEffect(() => {
    function closeMenu() {
      setMenu(null);
      setAddCharacterOpen(false);
    }

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeMenu);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeMenu);
    };
  }, []);

  function openContextMenu(event, item) {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      item,
      x: event.clientX,
      y: event.clientY,
    });
  }

  async function runMenuAction(action) {
    if (!menu?.item) return;
    const item = menu.item;
    setMenu(null);
    await action(item);
  }

  return (
    <aside className="conversation-list" ref={listRef}>
      <SidebarSectionHeader ref={searchRowRef} title={tUi("消息")} value={keyword} onValueChange={setKeyword}
        placeholder={tUi("搜索会话名称")} searchLabel={tUi("搜索会话")} createLabel={tUi("新建对话")}
        createExpanded={addCharacterOpen} onCreatePointerDown={(event) => event.stopPropagation()}
        onCreate={() => setAddCharacterOpen((open) => !open)} onSearchFocus={() => setAddCharacterOpen(false)} />

      {addCharacterOpen && characterPickerStyle && typeof document !== "undefined" ? createPortal(
        <div
          className="conversation-character-picker"
          style={characterPickerStyle}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {groupedCharacters.map(({ group, items }) => (
            <section className="conversation-character-picker-group" key={group}>
              <button
                className="conversation-character-picker-group-row"
                type="button"
                onClick={() => setCollapsedPickerGroups((current) => ({ ...current, [group]: !current[group] }))}
              >
                <span>
                  <span className={`conversation-character-picker-arrow ${collapsedPickerGroups[group] ? "collapsed" : ""}`}>
                    <ChevronRightIcon />
                  </span>
                  {group === ALL_CHARACTERS ? tUi(ALL_CHARACTERS) : group}
                </span>
                <em>{items.length}</em>
              </button>
              {!collapsedPickerGroups[group] && items.length ? (
                <div className="conversation-character-picker-characters">
                  {items.map((character) => {
                    const name = characterName(character, tUi);
                    return (
                      <button
                        type="button"
                        key={character.id}
                        onClick={() => {
                          setAddCharacterOpen(false);
                          onOpenCharacterChat(character.id);
                        }}
                      >
                        <SidebarCharacterArtwork
                          mode={resolvedArtworkMode}
                          name={name}
                          avatar={characterAvatar(character)}
                          cover={characterCover(character)}
                        />
                        <span>{name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ))}
          {!(characters?.items || []).length ? (
            <div className="conversation-character-picker-empty">
              <strong>{tUi("还未创建角色")}</strong>
              <span>{tUi("先创建角色卡，再添加到聊天列表。")}</span>
              <button
                type="button"
                onClick={() => {
                  setAddCharacterOpen(false);
                  onGoCharacterSettings();
                }}
              >
                {tUi("去创建角色")}</button>
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}

      <SidebarScrollArea className="conversation-scroll">
        {sessions.map((item, index) => {
          const pinned = pinnedIds.includes(item.id);
          const nextPinned = pinnedIds.includes(sessions[index + 1]?.id);
          const active = item.id === sessionId;
          const characterTitle = item.character_name || tUi("未命名角色");
          const currentCharacter = characterById.get(item.character_id);
          const avatar = currentCharacter ? characterAvatar(currentCharacter) : item.character_avatar || "";
          const cover = currentCharacter
            ? characterCover(currentCharacter)
            : item.character_persona?.assistant_cover || avatar;
          return (
            <button
              className={`conversation-item is-${resolvedArtworkMode}-artwork ${pinned ? "pinned" : ""} ${pinned && !nextPinned ? "pin-boundary" : ""} ${active ? "active" : ""}`}
              type="button"
              key={item.id}
              onClick={() => onLoadChat(item.id)}
              onContextMenu={(event) => openContextMenu(event, item)}
            >
              <SidebarCharacterArtwork mode={resolvedArtworkMode} name={characterTitle} avatar={avatar} cover={cover} />
              <div className="conversation-main">
                <b>{characterTitle}</b>
                <span>{item.summary || tUi("暂无历史对话")}</span>
              </div>
              <div className="conversation-meta">
                <time>{formatDate(item.updated_at, tUi)}</time>
              </div>
            </button>
          );
        })}
      </SidebarScrollArea>

      {menu && typeof document !== "undefined" ? createPortal(
        <div
          className="conversation-context-menu"
          style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => runMenuAction((item) => onTogglePinChat(item.id))}>
            <PinIcon />
            <span>{pinnedIds.includes(menu.item.id) ? tUi("取消置顶") : tUi("置顶")}</span>
          </button>
          <button type="button" onClick={() => runMenuAction((item) => onOpenChatWindow(item.id))}>
            <WindowIcon />
            <span>{tUi("打开独立聊天窗口")}</span>
          </button>
          <div className="context-separator" />
          <button type="button" onClick={() => runMenuAction((item) => onHideChat(item.id))}>
            <TrashIcon />
            <span>{tUi("从消息列表中删除")}</span>
          </button>
        </div>,
        document.body,
      ) : null}
    </aside>
  );
}
