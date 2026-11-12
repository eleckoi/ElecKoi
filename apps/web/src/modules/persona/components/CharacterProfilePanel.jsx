import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useMemo, useState } from "react";
import { ChevronRightIcon, PencilIcon } from "../../../ui/icons/index.jsx";
import { ChatCircleDots } from "../../../ui/icons/interfaceIcons.jsx";
import logoIcon from "../../../assets/eleckoi-app-icon.png";
import { assetSrc } from "../../../app/services/assets.js";
import { characterCover, characterName } from "./characterUtils.js";
import {
  characterDeckKeyDirection,
  hasBlockingCharacterOverlay,
  preventPointerFocus,
} from "./characterProfileKeyboard.js";

function wrappedDistance(index, selectedIndex, total) {
  if (total < 2) return 0;
  let distance = index - selectedIndex;
  const half = total / 2;
  if (distance > half) distance -= total;
  if (distance < -half) distance += total;
  return distance;
}

function CharacterDeckCard({ character, offset, selected, onSelect }) {
  const tUi = useProductTranslation();
  const name = characterName(character, tUi);
  const cover = assetSrc(characterCover(character));
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    setCoverFailed(false);
  }, [cover]);

  return (
    <button
      type="button"
      className={`character-deck-card${selected ? " is-selected" : ""}`}
      style={{
        "--deck-offset": offset,
        "--deck-distance": Math.abs(offset),
      }}
      aria-label={tUi("查看{value0}", {value0: name})}
      aria-pressed={selected}
      tabIndex={Math.abs(offset) <= 2 ? 0 : -1}
      onMouseDown={preventPointerFocus}
      onClick={() => onSelect(character.id)}
    >
      <span className="character-deck-card-art">
        {cover && !coverFailed ? (
          <img src={cover} alt="" draggable="false" onError={() => setCoverFailed(true)} />
        ) : (
          <span aria-hidden="true">{name.slice(0, 1)}</span>
        )}
      </span>
    </button>
  );
}

function CharacterPortrait({ character }) {
  const tUi = useProductTranslation();
  const cover = assetSrc(characterCover(character));
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [cover]);
  return <div className="character-profile-portrait">
    {cover && !failed ? <img src={cover} alt={tUi("{value0}立绘", {value0: characterName(character, tUi)})} onError={() => setFailed(true)} /> : <span>{characterName(character, tUi).slice(0, 1)}</span>}
  </div>;
}

export function CharacterProfilePanel({
  characters,
  selectedCharacterId,
  onSelectCharacter,
  onStartConversation,
  onEditCharacter,
  onCreateFirstCharacter,
  presentation = 'deck',
}) {
  const tUi = useProductTranslation();
  const items = characters?.items || [];
  const requestedIndex = Math.max(0, items.findIndex((item) => item.id === selectedCharacterId));
  const requestedCharacter = items[requestedIndex] || null;
  const [displayedCharacterId, setDisplayedCharacterId] = useState(() => requestedCharacter?.id || "");
  const [remoteSwitching, setRemoteSwitching] = useState(false);
  const displayedIndex = items.findIndex((item) => item.id === displayedCharacterId);
  const single = presentation === 'single';
  const selectedIndex = single ? requestedIndex : displayedIndex >= 0 ? displayedIndex : requestedIndex;
  const selectedCharacter = items[selectedIndex] || null;

  useEffect(() => {
    const targetId = requestedCharacter?.id || "";
    if (!targetId || targetId === displayedCharacterId) {
      setRemoteSwitching(false);
      if (!targetId && displayedCharacterId) setDisplayedCharacterId("");
      return undefined;
    }

    const fromIndex = items.findIndex((item) => item.id === displayedCharacterId);
    const distance = fromIndex >= 0
      ? Math.abs(wrappedDistance(requestedIndex, fromIndex, items.length))
      : Number.POSITIVE_INFINITY;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (single || distance <= 2 || reduceMotion) {
      setRemoteSwitching(false);
      setDisplayedCharacterId(targetId);
      return undefined;
    }

    setRemoteSwitching(true);
    const timer = window.setTimeout(() => {
      setDisplayedCharacterId(targetId);
      setRemoteSwitching(false);
    }, 90);

    return () => window.clearTimeout(timer);
  }, [single, displayedCharacterId, items, requestedCharacter?.id, requestedIndex]);

  const visibleCards = useMemo(
    () => items
      .map((character, index) => ({
        character,
        offset: wrappedDistance(index, selectedIndex, items.length),
      }))
      .filter(({ offset }) => Math.abs(offset) <= 2),
    [items, selectedIndex],
  );

  function moveSelection(direction) {
    if (items.length < 2) return;
    const nextIndex = (selectedIndex + direction + items.length) % items.length;
    onSelectCharacter(items[nextIndex].id);
  }

  useEffect(() => {
    if (single || items.length < 2) return undefined;

    function handleWindowKeyDown(event) {
      const direction = characterDeckKeyDirection(event, hasBlockingCharacterOverlay(document));
      if (!direction) return;
      event.preventDefault();
      moveSelection(direction);
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [single, items, selectedIndex, onSelectCharacter]);

  if (!selectedCharacter) {
    return (
      <section className="character-profile-panel character-profile-empty" aria-label={tUi("角色简介")}>
        <div className="chat-empty-guide">
          <img src={logoIcon} alt="" draggable="false" />
          <strong>{tUi("还没有角色")}</strong>
          <span>{tUi("先创建一个角色，再开始第一段对话。")}</span>
          <button type="button" onMouseDown={preventPointerFocus} onClick={onCreateFirstCharacter}>{tUi("新建角色")}</button>
        </div>
      </section>
    );
  }

  const name = characterName(selectedCharacter, tUi);
  const introduction = String(
    selectedCharacter.description
      || selectedCharacter.profileDescription
      || selectedCharacter.profileLike
      || "",
  ).trim();

  const copy = <div className={`character-profile-copy${!single && remoteSwitching ? ' is-remote-switching' : ''}`}>
    <h1>{name}</h1><p className={introduction ? '' : 'is-empty'}>{introduction || tUi("暂无简介")}</p>
  </div>;
  const actions = <div className="character-profile-actions">
    <button type="button" className="character-profile-action is-primary" onMouseDown={preventPointerFocus} onClick={() => onStartConversation(selectedCharacter.id)}><ChatCircleDots aria-hidden="true" />{tUi("进入对话")}</button>
    <button type="button" className="character-profile-action is-secondary" onMouseDown={preventPointerFocus} onClick={() => onEditCharacter(selectedCharacter.id)}><PencilIcon />{tUi("编辑角色")}</button>
  </div>;

  if (single) return <section className="character-profile-panel is-single-portrait" aria-label={tUi("{value0}的角色简介", {value0: name})}>
    <div className="character-profile-scroll"><CharacterPortrait character={selectedCharacter} />{copy}</div>
    {actions}
  </section>;

  return (
    <section className="character-profile-panel" aria-label={tUi("{value0}的角色简介", {value0: name})} aria-busy={remoteSwitching || undefined}>
      <div
        className={`character-deck${remoteSwitching ? " is-remote-switching" : ""}`}
        aria-label={tUi("角色卡切换")}
      >
        {visibleCards.map(({ character, offset }) => (
          <CharacterDeckCard
            key={character.id}
            character={character}
            offset={offset}
            selected={offset === 0}
            onSelect={onSelectCharacter}
          />
        ))}

        {items.length > 1 ? (
          <>
            <button type="button" className="character-deck-arrow is-previous" aria-label={tUi("上一个角色")} onMouseDown={preventPointerFocus} onClick={() => moveSelection(-1)}>
              <ChevronRightIcon />
            </button>
            <button type="button" className="character-deck-arrow is-next" aria-label={tUi("下一个角色")} onMouseDown={preventPointerFocus} onClick={() => moveSelection(1)}>
              <ChevronRightIcon />
            </button>
          </>
        ) : null}

      </div>

      {copy}
      {actions}

    </section>
  );
}
