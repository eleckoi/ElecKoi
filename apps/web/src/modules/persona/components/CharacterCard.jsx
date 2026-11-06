import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { characterCover, characterName } from "./characterUtils.js";
import { assetSrc } from "../../../app/services/assets.js";
import { Avatar } from "../../../ui/ui/Avatar.jsx";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function CharacterCard({ character, active, artworkAspectRatio = 0.76, authorName: authorNameSource, authorAvatar = "", selectable = false, selected = false, onClick, onDoubleClick, onContextMenu }) {
  const tUi = useProductTranslation();
  const authorName = authorNameSource === undefined ? tUi("用户") : authorNameSource;
  const name = characterName(character, tUi);
  const cover = characterCover(character);
  const resolvedCover = assetSrc(cover);
  const [coverFailed, setCoverFailed] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    setCoverFailed(false);
  }, [resolvedCover]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const grid = card?.parentElement;
    if (!card || !grid || typeof ResizeObserver === "undefined") return undefined;

    const updateSpan = () => {
      const gridStyle = getComputedStyle(grid);
      const rowHeight = Number.parseFloat(gridStyle.gridAutoRows) || 4;
      const rowGap = Number.parseFloat(gridStyle.rowGap) || 18;
      const span = Math.ceil((card.getBoundingClientRect().height + rowGap) / (rowHeight + rowGap));
      card.style.gridRowEnd = `span ${Math.max(1, span)}`;
    };

    const observer = new ResizeObserver(updateSpan);
    observer.observe(card);
    updateSpan();
    return () => observer.disconnect();
  }, []);

  const hasCover = Boolean(resolvedCover && !coverFailed);

  return (
    <button
      ref={cardRef}
      className={`character-card ${active ? "active" : ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`}
      style={{ "--character-artwork-ratio": artworkAspectRatio }}
      type="button"
      onClick={() => onClick(character.id)}
      onDoubleClick={onDoubleClick ? () => onDoubleClick(character.id) : undefined}
      onContextMenu={onContextMenu ? (event) => onContextMenu(event, character) : undefined}
      aria-pressed={selectable ? selected : undefined}
      title={onDoubleClick ? tUi("双击编辑角色") : undefined}
    >
      {selectable ? <span className="character-card-check" aria-hidden="true" /> : null}
      <div className={`character-card-cover ${hasCover ? "has-image" : "is-fallback"}`}>
        {hasCover ? <img src={resolvedCover} alt={name} onError={() => setCoverFailed(true)} /> : <span>{name.slice(0, 1)}</span>}
      </div>
      <span className="character-card-copy">
        <strong>{name}</strong>
        <span className="character-card-owner">
          <Avatar as="span" src={authorAvatar} name={authorName} className="character-card-owner-avatar" />
          <span>{authorName}</span>
        </span>
      </span>
    </button>
  );
}
