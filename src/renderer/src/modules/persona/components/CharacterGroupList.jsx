import { ChevronRightIcon } from "../../../ui/icons/index.jsx";
import { CharacterContactRow } from "./CharacterContactRow.jsx";
import { ALL_CHARACTERS, characterGroup } from "./characterUtils.js";

export function CharacterGroupList({
  groups,
  characters,
  activeCharacterId,
  artworkMode,
  collapsedGroups,
  onToggleGroup,
  onSelectGroup,
  onSelectCharacter,
  onOpenCharacterChat,
  onCharacterContextMenu,
  draggingGroup,
  dragOverGroup,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onGroupContextMenu,
}) {
  return [ALL_CHARACTERS, ...groups].map((group) => {
    const isAllCharacters = group === ALL_CHARACTERS;
    const collapsed = Boolean(collapsedGroups[group]);
    const groupCharacters = isAllCharacters
      ? (characters.items || [])
      : (characters.items || []).filter((item) => characterGroup(item) === group);

    return (
      <section className="character-group-block" key={group}>
        <button
          className={`character-group-row ${draggingGroup === group ? "dragging" : ""} ${
            dragOverGroup === group && draggingGroup !== group ? "drag-over" : ""
          }`}
          type="button"
          draggable={!isAllCharacters}
          onClick={() => {
            onSelectGroup?.(group);
            onToggleGroup(group);
          }}
          onContextMenu={isAllCharacters ? undefined : (event) => onGroupContextMenu(event, group)}
          onDragStart={(event) => {
            if (isAllCharacters) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", group);
            onDragStart(group);
          }}
          onDragEnter={(event) => {
            if (isAllCharacters) return;
            event.preventDefault();
            onDragOver(group);
          }}
          onDragOver={(event) => {
            if (isAllCharacters) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            onDragOver(group);
          }}
          onDrop={(event) => {
            if (isAllCharacters) return;
            event.preventDefault();
            onDrop(group);
          }}
          onDragEnd={onDragEnd}
        >
          <span>
            <span className={`character-group-toggle ${collapsed ? "collapsed" : ""}`} title={collapsed ? "展开分组" : "收起分组"}>
              <ChevronRightIcon />
            </span>
            {group}
          </span>
          <em>{groupCharacters.length}</em>
        </button>
        {!collapsed && groupCharacters.length ? (
          <div className="character-contact-list">
            {groupCharacters.map((character) => (
              <CharacterContactRow
                key={character.id}
                character={character}
                active={character.id === activeCharacterId}
                artworkMode={artworkMode}
                onClick={onSelectCharacter}
                onDoubleClick={onOpenCharacterChat}
                onContextMenu={onCharacterContextMenu}
              />
            ))}
          </div>
        ) : null}
      </section>
    );
  });
}
