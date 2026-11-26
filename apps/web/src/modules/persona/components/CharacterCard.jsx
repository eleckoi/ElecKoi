import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { characterCover, characterName } from "./characterUtils.js";
import { assetSrc, coverSources } from "../../../app/services/assets.js";
import { Avatar } from "../../../ui/ui/Avatar.jsx";
import { useState } from "react";

export function CharacterCard({ character, active, artworkAspectRatio = 0.76, artworkWidth, selectable = false, selected = false, onClick, onDoubleClick, onContextMenu }) {
  const tUi = useProductTranslation();
  const authorName = character?.authorName?.trim() || tUi("未填写作者");
  const authorAvatar = character?.authorAvatar || "";
  const name = characterName(character, tUi);
  const cover = characterCover(character);
  const resolvedCover = assetSrc(cover);
  const [failure, setFailure] = useState(null);
  const failed = failure?.source === resolvedCover ? failure.stage : 0;
  const sources = artworkWidth ? coverSources(cover, artworkWidth, artworkAspectRatio) : { src: resolvedCover };
  const hasCover = Boolean(resolvedCover && failed < 2);

  return (
    <button
      className={`character-card ${active ? "active" : ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`}
      style={{ "--character-artwork-ratio": artworkAspectRatio }}
      type="button"
      onClick={event => onClick(character.id, event.currentTarget)}
      onDoubleClick={onDoubleClick ? () => onDoubleClick(character.id) : undefined}
      onContextMenu={onContextMenu ? (event) => onContextMenu(event, character) : undefined}
      aria-pressed={selectable ? selected : undefined}
      title={onDoubleClick ? tUi("双击编辑角色") : undefined}
    >
      {selectable ? <span className="character-card-check" aria-hidden="true" /> : null}
      <div className={`character-card-cover ${hasCover ? "has-image" : "is-fallback"}`}>
        {hasCover ? <img {...(failed ? { src: resolvedCover } : sources)} alt={name} loading="lazy" decoding="async"
          onError={() => setFailure({ source: resolvedCover, stage: !failed && sources.src !== resolvedCover ? 1 : 2 })} /> : <span>{name.slice(0, 1)}</span>}
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
