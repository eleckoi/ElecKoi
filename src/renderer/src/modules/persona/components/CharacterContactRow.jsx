import { characterAvatar, characterCover, characterName } from "./characterUtils.js";
import { SidebarCharacterArtwork } from "../../../ui/ui/SidebarCharacterArtwork.jsx";

export function CharacterContactRow({ character, active, artworkMode, onClick, onDoubleClick, onContextMenu }) {
  const name = characterName(character);
  const avatar = characterAvatar(character);
  const resolvedArtworkMode = artworkMode === "avatar" ? "avatar" : "cover";

  return (
    <button
      className={`character-contact-row is-${resolvedArtworkMode}-artwork ${active ? "active" : ""}`}
      type="button"
      onClick={() => onClick(character.id)}
      onDoubleClick={() => onDoubleClick(character.id)}
      onContextMenu={(event) => onContextMenu?.(event, character)}
    >
      <SidebarCharacterArtwork mode={resolvedArtworkMode} name={name} avatar={avatar} cover={characterCover(character)} />
      <div className="character-contact-copy">
        <strong>{name}</strong>
      </div>
    </button>
  );
}
