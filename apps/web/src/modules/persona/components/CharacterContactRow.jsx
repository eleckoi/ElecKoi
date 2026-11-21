import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useRowDragPreview } from "@deepseek-ai/dsh-client-ui-primitives";
import { characterAvatar, characterCover, characterName } from "./characterUtils.js";
import { SidebarCharacterArtwork } from "../../../ui/ui/SidebarCharacterArtwork.jsx";

const DRAG_PREVIEW_PROPERTIES = ['--list'];

function rowHalf(event) {
  const { top, height } = event.currentTarget.getBoundingClientRect();
  return event.clientY < top + height / 2 ? 'before' : 'after';
}

export function CharacterContactRow({ character, active, artworkMode, onClick, onDoubleClick, onContextMenu, drag }) {
  const tUi = useProductTranslation();
  const name = characterName(character, tUi);
  const cover = characterCover(character);
  const avatar = artworkMode === "square"
    ? character.persona?.assistant_square || character.squareImage || characterAvatar(character) || cover
    : characterAvatar(character);
  const resolvedArtworkMode = artworkMode === "square" || artworkMode === "avatar" ? "avatar" : "cover";
  const dragPreview = useRowDragPreview('character-home-row-drag-preview', DRAG_PREVIEW_PROPERTIES);

  return (
    <button
      className={`character-contact-row is-${resolvedArtworkMode}-artwork ${active ? "active" : ""}`}
      type="button"
      onClick={() => onClick(character.id)}
      onDoubleClick={onDoubleClick && (() => onDoubleClick(character.id))}
      onContextMenu={(event) => onContextMenu?.(event, character)}
      draggable={drag ? true : undefined}
      data-character-drop={drag?.marker}
      aria-keyshortcuts={drag ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      onKeyDown={drag && (event => {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        drag.move(event.key === 'ArrowUp' ? 'before' : 'after');
      })}
      onDragStart={drag && (event => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', character.id);
        drag.start();
        dragPreview.start(event);
      })}
      onDragOver={drag?.active ? event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        drag.hover(rowHalf(event));
      } : undefined}
      onDragLeave={drag?.active ? event => {
        if (!event.currentTarget.contains(event.relatedTarget)) drag.hover(null);
      } : undefined}
      onDrop={drag?.active ? event => {
        event.preventDefault();
        drag.drop(rowHalf(event));
      } : undefined}
      onDragEnd={() => { if (dragPreview.clear()) drag?.end(); }}
    >
      <SidebarCharacterArtwork mode={resolvedArtworkMode} name={name} avatar={avatar} cover={cover} />
      <div className="character-contact-copy">
        <strong>{name}</strong>
      </div>
    </button>
  );
}
