import { useMemo, useState } from "react";
import { ExportIcon, ImportIcon, PlusIcon, TrashIcon, XIcon } from "../../../ui/icons/index.jsx";
import { DshSearchField } from "../../../ui/ui/DshSearchField.jsx";
import { AddGroupDialog } from "./AddGroupDialog.jsx";
import { CharacterCard } from "./CharacterCard.jsx";
import { ALL_CHARACTERS } from "./characterUtils.js";

export function CharacterManagerModal({
  characters,
  groups,
  visibleCharacters,
  activeCharacterId,
  selectedGroup,
  keyword,
  groupDialogOpen,
  groupDialogTitle,
  newGroupName,
  onClose,
  onSelectGroup,
  onKeywordChange,
  onSelectCharacter,
  onGroupContextMenu,
  onOpenGroupDialog,
  onCloseGroupDialog,
  onGroupNameChange,
  onAddGroup,
  onOpenImport,
  onExportCharacters,
  onDeleteCharacters,
  countByGroup,
}) {
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const selectedCount = selectedIds.length;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleSelected(characterId) {
    setSelectedIds((current) => (current.includes(characterId) ? current.filter((id) => id !== characterId) : [...current, characterId]));
  }

  function cancelDeleteMode() {
    setDeleteMode(false);
    setSelectedIds([]);
  }

  async function confirmDelete() {
    if (!selectedIds.length) return;
    await onDeleteCharacters(selectedIds);
    cancelDeleteMode();
  }

  return (
    <div className="character-manager-overlay" onMouseDown={onClose}>
      <div className="character-manager-window" onMouseDown={(event) => event.stopPropagation()}>
        <aside className="character-manager-groups">
          <button
            className={`character-manager-group ${selectedGroup === ALL_CHARACTERS ? "active" : ""}`}
            type="button"
            onClick={() => onSelectGroup(ALL_CHARACTERS)}
          >
            <span>{ALL_CHARACTERS}</span>
            <em>{characters.items?.length || 0}</em>
          </button>
          <small>分组</small>
          <div className="character-manager-group-list">
            {groups.map((group) => (
              <button
                className={`character-manager-group ${selectedGroup === group ? "active" : ""}`}
                type="button"
                key={group}
                onClick={() => onSelectGroup(group)}
                onContextMenu={(event) => onGroupContextMenu(event, group)}
              >
                <span>{group}</span>
                <em>{countByGroup(group)}</em>
              </button>
            ))}
          </div>
          <button className="character-add-group-button" type="button" onClick={onOpenGroupDialog}>
            <PlusIcon />
            添加分组
          </button>
        </aside>

        <section className="character-manager-main">
          <div className="character-manager-titlebar">
            <h2>角色卡管理器</h2>
            <DshSearchField
              className="character-manager-search"
              value={keyword}
              onValueChange={onKeywordChange}
              placeholder="搜索角色…"
              ariaLabel="搜索角色"
            />
            {!deleteMode ? (
              <>
                <button type="button" onClick={onOpenImport}>
                  <ImportIcon />
                  导入角色
                </button>
                <button type="button" onClick={onExportCharacters}>
                  <ExportIcon />
                  导出角色
                </button>
                <button type="button" onClick={() => setDeleteMode(true)}>
                  <TrashIcon />
                  删除
                </button>
              </>
            ) : (
              <>
                <button className="character-manager-confirm-delete" type="button" disabled={!selectedCount} onClick={confirmDelete}>
                  确认{selectedCount ? ` ${selectedCount}` : ""}
                </button>
                <button type="button" onClick={cancelDeleteMode}>
                  取消
                </button>
              </>
            )}
            <button className="character-manager-close" type="button" onClick={onClose}>
              <XIcon />
            </button>
          </div>

          <div className="character-manager-grid">
            {visibleCharacters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                active={character.id === activeCharacterId}
                selectable={deleteMode}
                selected={selectedSet.has(character.id)}
                onClick={deleteMode ? toggleSelected : onSelectCharacter}
              />
            ))}
            {!visibleCharacters.length ? <p className="character-manager-empty">这个分组里还没有角色卡。</p> : null}
          </div>
        </section>

        {groupDialogOpen ? (
          <AddGroupDialog title={groupDialogTitle} value={newGroupName} onChange={onGroupNameChange} onConfirm={onAddGroup} onCancel={onCloseGroupDialog} />
        ) : null}
      </div>
    </div>
  );
}
