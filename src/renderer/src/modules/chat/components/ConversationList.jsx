import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon, PinIcon, TrashIcon, WindowIcon } from "../../../ui/icons/index.jsx";
import { ALL_CHARACTERS, characterAvatar, characterCover, characterGroup, characterName } from "../../../utils/characterDisplay.js";
import { SidebarCharacterArtwork } from "../../../ui/ui/SidebarCharacterArtwork.jsx";
import { formatDate } from "../../../utils/format.js";
import { DshSearchField } from "../../../ui/ui/DshSearchField.jsx";
import { SidebarCreateButton } from "../../../ui/ui/SidebarCreateButton.jsx";

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
  onRemoveChat,
}) {
  const [menu, setMenu] = useState(null);
  const [addCharacterOpen, setAddCharacterOpen] = useState(false);
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
    <aside className="conversation-list">
      <div className="search-row">
        <DshSearchField value={keyword} onValueChange={setKeyword} placeholder="搜索会话…" ariaLabel="搜索会话" />
        <SidebarCreateButton
          title="新建对话"
          expanded={addCharacterOpen}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setAddCharacterOpen((open) => !open)}
        />
      </div>

      {addCharacterOpen ? (
        <div className="conversation-character-picker" onPointerDown={(event) => event.stopPropagation()}>
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
                  {group}
                </span>
                <em>{items.length}</em>
              </button>
              {!collapsedPickerGroups[group] && items.length ? (
                <div className="conversation-character-picker-characters">
                  {items.map((character) => {
                    const name = characterName(character);
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
              <strong>还未创建角色</strong>
              <span>先创建角色卡，再添加到聊天列表。</span>
              <button
                type="button"
                onClick={() => {
                  setAddCharacterOpen(false);
                  onGoCharacterSettings();
                }}
              >
                去创建角色
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="conversation-scroll">
        {sessions.map((item, index) => {
          const pinned = pinnedIds.includes(item.id);
          const nextPinned = pinnedIds.includes(sessions[index + 1]?.id);
          const active = item.id === sessionId;
          const characterTitle = item.character_name || "未命名角色";
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
                <span>{item.summary || "暂无历史对话"}</span>
              </div>
              <div className="conversation-meta">
                <time>{formatDate(item.updated_at)}</time>
              </div>
            </button>
          );
        })}
      </div>

      {menu && typeof document !== "undefined" ? createPortal(
        <div
          className="conversation-context-menu"
          style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => runMenuAction((item) => onTogglePinChat(item.id))}>
            <PinIcon />
            <span>{pinnedIds.includes(menu.item.id) ? "取消置顶" : "置顶"}</span>
          </button>
          <button type="button" onClick={() => runMenuAction((item) => onOpenChatWindow(item.id))}>
            <WindowIcon />
            <span>打开独立聊天窗口</span>
          </button>
          <div className="context-separator" />
          <button type="button" onClick={() => runMenuAction((item) => onRemoveChat(item.id))}>
            <TrashIcon />
            <span>从消息列表中删除</span>
          </button>
        </div>,
        document.body,
      ) : null}
    </aside>
  );
}
