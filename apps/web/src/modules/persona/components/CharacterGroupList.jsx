import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Fragment, useState } from 'react';
import { useCatalogSlots } from '../../../ui/ui/CatalogSlotsContext.jsx';
import { useSidebarGroupCollapse } from '../../../ui/hooks/useSidebarGroupCollapse.js';
import { ChevronRightIcon } from "../../../ui/icons/index.jsx";
import { CharacterContactRow } from "./CharacterContactRow.jsx";
import { ALL_CHARACTERS, characterGroup } from "./characterUtils.js";

export function CharacterGroupList({
  groups,
  characters,
  activeCharacterId,
  artworkMode,
  collapsedGroups,
  allLabel,
  showCount = true,
  onToggleGroup,
  onSelectGroup,
  onSelectCharacter,
  onOpenCharacterChat,
  onCharacterContextMenu,
  onReorderGroup,
  onGroupContextMenu,
  onReorderCharacter,
}) {
  const tUi = useProductTranslation();
  const { render } = useCatalogSlots();
  const keepCollapsedHeading = useSidebarGroupCollapse(collapsedGroups);
  const [draggingGroup, setDraggingGroup] = useState("");
  const [dragOverGroup, setDragOverGroup] = useState("");
  const [characterDrag, setCharacterDrag] = useState(null);
  const orderedGroups = [ALL_CHARACTERS, ...groups];
  const draggingIndex = orderedGroups.indexOf(draggingGroup);
  function endDrag() {
    setDraggingGroup("");
    setDragOverGroup("");
  }

  return orderedGroups.map((group, index) => {
    const isAllCharacters = group === ALL_CHARACTERS;
    const canReorder = !isAllCharacters && Boolean(onReorderGroup);
    const canDrop = canReorder && draggingIndex > 0 && draggingGroup !== group;
    const collapsed = Boolean(collapsedGroups[group]);
    const groupCharacters = isAllCharacters
      ? (characters.items || [])
      : (characters.items || []).filter((item) => characterGroup(item) === group);
    const reorderable = onReorderCharacter && groupCharacters.length > 1;

    function rowDrag(character, index) {
      const sameGroup = characterDrag?.group === group;
      const marker = sameGroup && characterDrag.target === character.id ? characterDrag.half : undefined;
      return {
        start: () => setCharacterDrag({ group, source: character.id }),
        active: sameGroup && characterDrag.source !== character.id,
        marker,
        hover: half => setCharacterDrag(current => {
          if (current?.group !== group) return current;
          const overThisRow = current.target === character.id;
          if (half === null ? !overThisRow : overThisRow && current.half === half) return current;
          return { ...current, target: half === null ? null : character.id, half };
        }),
        drop: half => {
          setCharacterDrag(null);
          onReorderCharacter(group, characterDrag.source, character.id, half);
        },
        end: () => setCharacterDrag(null),
        move: half => {
          const neighbor = groupCharacters[index + (half === 'before' ? -1 : 1)];
          if (neighbor) onReorderCharacter(group, character.id, neighbor.id, half);
        },
      };
    }

    return (
      <section className="character-group-block" key={group}>
        <button
          className={`character-group-row${draggingGroup === group ? " dragging" : ""}`}
          type="button"
          aria-expanded={!collapsed}
          aria-keyshortcuts={canReorder ? "Alt+ArrowUp Alt+ArrowDown" : undefined}
          draggable={canReorder}
          data-drop-position={canDrop && dragOverGroup === group ? (draggingIndex < index ? "after" : "before") : undefined}
          onClick={(event) => {
            if (!collapsed) keepCollapsedHeading(event.currentTarget);
            onSelectGroup?.(group);
            onToggleGroup(group);
          }}
          onContextMenu={!isAllCharacters && onGroupContextMenu ? (event) => onGroupContextMenu(event, group) : undefined}
          onKeyDown={(event) => {
            if (!canReorder || !event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
            const neighbor = orderedGroups[index + (event.key === "ArrowUp" ? -1 : 1)];
            if (neighbor && neighbor !== ALL_CHARACTERS) {
              event.preventDefault();
              onReorderGroup(group, neighbor);
            }
          }}
          onDragStart={(event) => {
            if (!canReorder) return;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", group);
            setDraggingGroup(group);
          }}
          onDragOver={(event) => {
            if (!canDrop) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragOverGroup(group);
          }}
          onDragLeave={(event) => {
            if (dragOverGroup === group && !event.currentTarget.contains(event.relatedTarget)) setDragOverGroup("");
          }}
          onDrop={(event) => {
            if (!canDrop) return;
            event.preventDefault();
            endDrag();
            onReorderGroup(draggingGroup, group);
          }}
          onDragEnd={endDrag}
        >
          <span>
            <span className={`character-group-toggle ${collapsed ? "collapsed" : ""}`} title={collapsed ? tUi("展开分组") : tUi("收起分组")}>
              <ChevronRightIcon />
            </span>
            {isAllCharacters ? allLabel ?? tUi(ALL_CHARACTERS) : group}
          </span>
          {showCount && <em>{groupCharacters.length}</em>}
        </button>
        {!collapsed && groupCharacters.length ? (
          <div className="character-contact-list">
            {groupCharacters.map((character, rowIndex) => (
              <Fragment key={character.id}>{render('eleckoi.character.library.item', {
                surface: 'pc-sidebar', character, selected: character.id === activeCharacterId, selecting: false,
                onSelect: () => onSelectCharacter(character.id),
                onOpenConversation: onOpenCharacterChat && (() => onOpenCharacterChat(character.id)),
                onOpenMenu: event => onCharacterContextMenu(event, character),
              }, <CharacterContactRow
                character={character}
                active={character.id === activeCharacterId}
                artworkMode={artworkMode}
                onClick={onSelectCharacter}
                onDoubleClick={onOpenCharacterChat}
                onContextMenu={onCharacterContextMenu}
                drag={reorderable ? rowDrag(character, rowIndex) : undefined}
              />)}</Fragment>
            ))}
          </div>
        ) : null}
      </section>
    );
  });
}
