import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PencilIcon, PlusIcon, CharacterManagerIcon, ImportIcon, TrashIcon } from "../../../ui/icons/index.jsx";
import { AddGroupDialog } from "./AddGroupDialog.jsx";
import { CharacterGroupList } from "./CharacterGroupList.jsx";
import { CharacterManagerModal } from "./CharacterManagerModal.jsx";
import { CharacterImportDialog } from "./CharacterImportDialog.jsx";
import { DeleteCharacterDialog } from "./DeleteCharacterDialog.jsx";
import { ALL_CHARACTERS, characterGroup, characterName } from "./characterUtils.js";
import { DshSearchField } from "../../../ui/ui/DshSearchField.jsx";
import { SidebarCreateButton } from "../../../ui/ui/SidebarCreateButton.jsx";
import { LIST_COLLAPSE_AREAS, usePersistentCollapseState } from "../../settings/index.js";

export function CharacterListPanel({ characters, activeCharacterId, artworkMode, onSelectCharacter, onOpenCharacterChat, onSaveCharacterGroups, onImportPreparedCharacters, onCreateCharacter, onDeleteCharacters }) {
  const [keyword, setKeyword] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [listTab, setListTab] = useState("characters");
  const [selectedGroup, setSelectedGroup] = useState(ALL_CHARACTERS);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState("add");
  const [editingGroupName, setEditingGroupName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [groupMenu, setGroupMenu] = useState(null);
  const [characterMenu, setCharacterMenu] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingCharacter, setDeletingCharacter] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const characterMenuRef = useRef(null);
  const [draggingGroup, setDraggingGroup] = useState("");
  const [dragOverGroup, setDragOverGroup] = useState("");

  const groups = useMemo(() => {
    const names = [...new Set((characters.groups || []).map((group) => group.trim()).filter(Boolean))];
    for (const item of characters.items || []) {
      const group = characterGroup(item);
      if (group && !names.includes(group)) names.push(group);
    }
    return names;
  }, [characters]);
  const [collapsedGroups, setCollapsedGroups] = usePersistentCollapseState(
    LIST_COLLAPSE_AREAS.characters,
    {},
    characters.active_character_id || characters.groups?.length || characters.items?.length
      ? [ALL_CHARACTERS, ...groups]
      : undefined,
  );

  const visibleCharacters = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    return (characters.items || []).filter((item) => {
      const inGroup = selectedGroup === ALL_CHARACTERS || characterGroup(item) === selectedGroup;
      const matches = !key || `${characterName(item)} ${characterGroup(item)}`.toLowerCase().includes(key);
      return inGroup && matches;
    });
  }, [characters, keyword, selectedGroup]);

  function countByGroup(group) {
    return (characters.items || []).filter((item) => characterGroup(item) === group).length;
  }

  function toggleGroup(group) {
    setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }));
  }

  useEffect(() => {
    function closeContextMenus(event) {
      if (event.type === "keydown" && event.key !== "Escape") return;
      setGroupMenu(null);
      setCharacterMenu(null);
      setCreateMenuOpen(false);
    }
    window.addEventListener("pointerdown", closeContextMenus);
    window.addEventListener("keydown", closeContextMenus);
    return () => {
      window.removeEventListener("pointerdown", closeContextMenus);
      window.removeEventListener("keydown", closeContextMenus);
    };
  }, []);

  useEffect(() => {
    characterMenuRef.current?.querySelector("button")?.focus();
  }, [characterMenu]);

  function openGroupMenu(event, group) {
    event.preventDefault();
    event.stopPropagation();
    setGroupMenu({ group, x: event.clientX, y: event.clientY });
    setCharacterMenu(null);
  }

  function openCharacterMenu(event, character) {
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget;
    const rowRect = row.getBoundingClientRect();
    const menuWidth = 148;
    const menuHeight = 44;
    const requestedX = event.clientX || rowRect.left + 18;
    const requestedY = event.clientY || rowRect.top + rowRect.height / 2;
    setCharacterMenu({
      character,
      returnFocus: row,
      x: Math.max(8, Math.min(requestedX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(requestedY, window.innerHeight - menuHeight - 8)),
    });
    setGroupMenu(null);
  }

  function requestDeleteCharacter() {
    if (!characterMenu) return;
    setDeleteError("");
    setPendingDelete({ character: characterMenu.character, returnFocus: characterMenu.returnFocus });
    setCharacterMenu(null);
  }

  function cancelDeleteCharacter() {
    if (deletingCharacter) return;
    setDeleteError("");
    setPendingDelete(null);
  }

  async function confirmDeleteCharacter() {
    if (!pendingDelete || deletingCharacter) return;
    setDeletingCharacter(true);
    setDeleteError("");
    try {
      await onDeleteCharacters([pendingDelete.character.id]);
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败，请重试。");
    } finally {
      setDeletingCharacter(false);
    }
  }

  function openAddGroupDialog() {
    setGroupDialogMode("add");
    setEditingGroupName("");
    setNewGroupName("");
    setGroupDialogOpen(true);
    setGroupMenu(null);
  }

  function openRenameGroupDialog(group) {
    setGroupDialogMode("rename");
    setEditingGroupName(group);
    setNewGroupName(group);
    setGroupDialogOpen(true);
    setGroupMenu(null);
  }

  async function reorderGroups(sourceGroup, targetGroup) {
    if (!sourceGroup || !targetGroup || sourceGroup === targetGroup) return;
    const ordered = groups.filter((group) => group !== sourceGroup);
    const targetIndex = ordered.indexOf(targetGroup);
    ordered.splice(targetIndex < 0 ? ordered.length : targetIndex, 0, sourceGroup);
    await onSaveCharacterGroups(ordered);
  }

  async function saveGroupDialog() {
    const name = newGroupName.trim();
    if (!name) return;
    if (name === ALL_CHARACTERS) return;
    if (groupDialogMode === "rename") {
      if (name === editingGroupName || groups.includes(name)) return;
      const nextGroups = groups.map((group) => (group === editingGroupName ? name : group));
      const assignments = (characters.items || []).filter((item) => characterGroup(item) === editingGroupName).map((item) => ({ characterId: item.id, group: name }));
      await onSaveCharacterGroups(nextGroups, assignments);
      if (selectedGroup === editingGroupName) setSelectedGroup(name);
    } else {
      if (groups.includes(name)) return;
      await onSaveCharacterGroups([...groups, name]);
      setSelectedGroup(name);
    }
    setNewGroupName("");
    setEditingGroupName("");
    setGroupDialogOpen(false);
  }

  async function deleteGroup(group) {
    setGroupMenu(null);
    const remaining = groups.filter((item) => item !== group);
    const targetGroup = remaining[0] || "";
    const nextGroups = remaining;
    const assignments = (characters.items || []).filter((item) => characterGroup(item) === group).map((item) => ({ characterId: item.id, group: targetGroup }));
    await onSaveCharacterGroups(nextGroups, assignments);
    if (selectedGroup === group) setSelectedGroup(ALL_CHARACTERS);
  }

  function exportCharacters() {
    const character = (characters.items || []).find((item) => item.id === activeCharacterId) || characters.items?.[0];
    if (!character) return;
    const card = {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: characterName(character),
        personality: "",
        scenario: "",
        first_mes: character.persona?.opening || "",
        mes_example: "",
        creator_notes: "",
        post_history_instructions: "",
        alternate_greetings: [],
        tags: [],
        creator: "ElecKoi",
        character_version: "1",
        extensions: { eleckoi_compatible: true },
      },
    };
    const blob = new Blob([JSON.stringify(card, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${characterName(character).replace(/[\\/:*?"<>|]/g, "-") || "ElecKoi角色"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function createInSelectedGroup() {
    setCreateMenuOpen(false);
    onCreateCharacter(selectedGroup === ALL_CHARACTERS ? "" : selectedGroup);
  }

  function openImportDialog() {
    setCreateMenuOpen(false);
    setImportOpen(true);
  }

  return (
    <aside className="character-list-panel">
      <div className="search-row character-list-search">
        <DshSearchField value={keyword} onValueChange={setKeyword} placeholder="搜索角色…" ariaLabel="搜索角色" />
        <SidebarCreateButton
          title="新建"
          expanded={createMenuOpen}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setCreateMenuOpen((current) => !current);
          }}
        />
      </div>

      {createMenuOpen ? (
        <div className="character-create-menu" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={createInSelectedGroup}><CharacterManagerIcon /><span>新建角色</span></button>
          <button type="button" onClick={openImportDialog}><ImportIcon /><span>导入角色卡</span></button>
        </div>
      ) : null}

      <button className="character-manager-entry" type="button" onClick={() => setManagerOpen(true)}>
        <CharacterManagerIcon />
        <span>角色卡管理器</span>
      </button>

      <div className="character-list-tabs" role="tablist" aria-label="角色与群聊">
        <button className={listTab === "characters" ? "active" : ""} type="button" onClick={() => setListTab("characters")}>
          角色
        </button>
        <button className={listTab === "groups" ? "active" : ""} type="button" onClick={() => setListTab("groups")}>
          群聊
        </button>
      </div>

      <div className="character-list-scroll">
        {listTab === "characters" ? (
          <CharacterGroupList
            groups={groups}
            characters={characters}
            activeCharacterId={activeCharacterId}
            artworkMode={artworkMode}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            onSelectGroup={(group) => {
              setSelectedGroup(group);
            }}
            onSelectCharacter={onSelectCharacter}
            onOpenCharacterChat={onOpenCharacterChat}
            onCharacterContextMenu={openCharacterMenu}
            draggingGroup={draggingGroup}
            dragOverGroup={dragOverGroup}
            onDragStart={(group) => setDraggingGroup(group)}
            onDragOver={setDragOverGroup}
            onDrop={(group) => reorderGroups(draggingGroup, group)}
            onDragEnd={() => {
              setDraggingGroup("");
              setDragOverGroup("");
            }}
            onGroupContextMenu={openGroupMenu}
          />
        ) : (
          <div className="character-empty-groups">
            <strong>暂无群聊</strong>
            <span>群聊角色和多人对话以后放在这里。</span>
          </div>
        )}
      </div>

      {managerOpen ? (
        <CharacterManagerModal
          characters={characters}
          groups={groups}
          visibleCharacters={visibleCharacters}
          activeCharacterId={activeCharacterId}
          selectedGroup={selectedGroup}
          keyword={keyword}
          groupDialogOpen={groupDialogOpen}
          groupDialogTitle={groupDialogMode === "rename" ? "重命名该组" : "添加分组"}
          newGroupName={newGroupName}
          onClose={() => setManagerOpen(false)}
          onSelectGroup={setSelectedGroup}
          onKeywordChange={setKeyword}
          onSelectCharacter={onSelectCharacter}
          onGroupContextMenu={openGroupMenu}
          onOpenGroupDialog={openAddGroupDialog}
          onCloseGroupDialog={() => setGroupDialogOpen(false)}
          onGroupNameChange={setNewGroupName}
          onAddGroup={saveGroupDialog}
          onOpenImport={openImportDialog}
          onExportCharacters={exportCharacters}
          onDeleteCharacters={onDeleteCharacters}
          countByGroup={countByGroup}
        />
      ) : null}

      {groupMenu ? (
        <div className="character-group-context-menu" style={{ left: `${groupMenu.x}px`, top: `${groupMenu.y}px` }} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={openAddGroupDialog}>
            <PlusIcon />
            <span>添加分组</span>
          </button>
          <button type="button" onClick={() => openRenameGroupDialog(groupMenu.group)}>
            <PencilIcon />
            <span>重命名该组</span>
          </button>
          <button type="button" onClick={() => deleteGroup(groupMenu.group)}>
            <TrashIcon />
            <span>删除分组</span>
          </button>
        </div>
      ) : null}

      {importOpen ? (
        <CharacterImportDialog
          onClose={() => setImportOpen(false)}
          onImported={onImportPreparedCharacters}
        />
      ) : null}

      {characterMenu ? createPortal(
        <div
          ref={characterMenuRef}
          className="character-context-menu"
          role="menu"
          aria-label={`${characterName(characterMenu.character)}的操作`}
          style={{ left: `${characterMenu.x}px`, top: `${characterMenu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" className="is-danger" onClick={requestDeleteCharacter}>
            <TrashIcon />
            <span>删除角色</span>
          </button>
        </div>,
        document.body,
      ) : null}

      {pendingDelete ? (
        <DeleteCharacterDialog
          character={{ ...pendingDelete.character, name: characterName(pendingDelete.character) }}
          deleting={deletingCharacter}
          error={deleteError}
          returnFocus={pendingDelete.returnFocus}
          onCancel={cancelDeleteCharacter}
          onConfirm={confirmDeleteCharacter}
        />
      ) : null}

      {!managerOpen && groupDialogOpen ? (
        <AddGroupDialog
          title={groupDialogMode === "rename" ? "重命名该组" : "添加分组"}
          value={newGroupName}
          onChange={setNewGroupName}
          onConfirm={saveGroupDialog}
          onCancel={() => setGroupDialogOpen(false)}
        />
      ) : null}
    </aside>
  );
}
