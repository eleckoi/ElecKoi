import { characterCover, characterName } from "./characterUtils.js";
import { assetSrc } from "../../../app/services/assets.js";
import { useEffect, useState } from "react";

export function CharacterCard({ character, active, selectable = false, selected = false, onClick }) {
  const name = characterName(character);
  const cover = characterCover(character);
  const resolvedCover = assetSrc(cover);
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => {
    setCoverFailed(false);
  }, [resolvedCover]);

  return (
    <button
      className={`character-card ${active ? "active" : ""} ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`}
      type="button"
      onClick={() => onClick(character.id)}
    >
      {selectable ? <span className="character-card-check" aria-hidden="true" /> : null}
      <div className="character-card-cover">
        {resolvedCover && !coverFailed ? <img src={resolvedCover} alt={name} onError={() => setCoverFailed(true)} /> : <span>{name.slice(0, 1)}</span>}
      </div>
      <strong>{name}</strong>
    </button>
  );
}
