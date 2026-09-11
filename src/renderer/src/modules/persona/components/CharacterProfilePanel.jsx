import { useEffect, useMemo, useState } from "react";
import { ChevronRightIcon, NewChatIcon, PencilIcon, PlusIcon } from "../../../ui/icons/index.jsx";
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
  const name = characterName(character);
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
      aria-label={`查看${name}`}
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

export function CharacterProfilePanel({
  characters,
  selectedCharacterId,
  onSelectCharacter,
  onStartConversation,
  onEditCharacter,
  onCreateFirstCharacter,
}) {
  const items = characters?.items || [];
  const requestedIndex = Math.max(0, items.findIndex((item) => item.id === selectedCharacterId));
  const requestedCharacter = items[requestedIndex] || null;
  const [displayedCharacterId, setDisplayedCharacterId] = useState(() => requestedCharacter?.id || "");
  const [remoteSwitching, setRemoteSwitching] = useState(false);
  const displayedIndex = items.findIndex((item) => item.id === displayedCharacterId);
  const selectedIndex = displayedIndex >= 0 ? displayedIndex : requestedIndex;
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

    if (distance <= 2 || reduceMotion) {
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
  }, [displayedCharacterId, items, requestedCharacter?.id, requestedIndex]);

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
    if (items.length < 2) return undefined;

    function handleWindowKeyDown(event) {
      const direction = characterDeckKeyDirection(event, hasBlockingCharacterOverlay(document));
      if (!direction) return;
      event.preventDefault();
      moveSelection(direction);
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [items, selectedIndex, onSelectCharacter]);

  if (!selectedCharacter) {
    return (
      <section className="character-profile-panel character-profile-empty" aria-label="角色简介">
        <button type="button" className="character-profile-create" onMouseDown={preventPointerFocus} onClick={onCreateFirstCharacter}>
          <PlusIcon />
          新建角色
        </button>
      </section>
    );
  }

  const name = characterName(selectedCharacter);
  const introduction = String(
    selectedCharacter.description
      || selectedCharacter.profileDescription
      || selectedCharacter.profileLike
      || "",
  ).trim();

  return (
    <section className="character-profile-panel" aria-label={`${name}的角色简介`} aria-busy={remoteSwitching || undefined}>
      <div
        className={`character-deck${remoteSwitching ? " is-remote-switching" : ""}`}
        aria-label="角色卡切换"
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
            <button type="button" className="character-deck-arrow is-previous" aria-label="上一个角色" onMouseDown={preventPointerFocus} onClick={() => moveSelection(-1)}>
              <ChevronRightIcon />
            </button>
            <button type="button" className="character-deck-arrow is-next" aria-label="下一个角色" onMouseDown={preventPointerFocus} onClick={() => moveSelection(1)}>
              <ChevronRightIcon />
            </button>
          </>
        ) : null}

      </div>

      <div className={`character-profile-copy${remoteSwitching ? " is-remote-switching" : ""}`}>
        <h1>{name}</h1>
        <p className={introduction ? "" : "is-empty"}>{introduction || "暂无简介"}</p>
      </div>

      <div className="character-profile-actions">
        <button type="button" className="character-profile-action is-primary" onMouseDown={preventPointerFocus} onClick={() => onStartConversation(selectedCharacter.id)}>
          <NewChatIcon />
          开始对话
        </button>
        <button type="button" className="character-profile-action is-secondary" onMouseDown={preventPointerFocus} onClick={() => onEditCharacter(selectedCharacter.id)}>
          <PencilIcon />
          编辑角色
        </button>
      </div>

    </section>
  );
}
