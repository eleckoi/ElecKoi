import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useMemo, useState } from "react";
import { Button, IconProjectAddOutlineRegular, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { PencilIcon, PlusIcon, CharacterManagerIcon, ImportIcon, ExportIcon, TrashIcon } from "../../../ui/icons/index.jsx";
import { GroupNameDialog } from "../../../ui/ui/GroupNameDialog.jsx";
import { ConfirmationDialog } from "../../../ui/ui/ConfirmationDialog.jsx";
import { useEditorContextMenu } from "../../../ui/ui/EditorContextMenu.jsx";
import { CharacterGroupList } from "./CharacterGroupList.jsx";
import { CharacterImportDialog } from "./CharacterImportDialog.jsx";
import { DeleteCharacterDialog } from "./DeleteCharacterDialog.jsx";
import { ALL_CHARACTERS, characterGroup, characterName } from "./characterUtils.js";
import { SidebarSectionHeader } from "../../../ui/ui/SidebarSectionHeader.jsx";
import { useSidebarListScroll } from "../../../ui/hooks/useSidebarListScroll.js";
import { SidebarScrollArea } from "../../../ui/ui/SidebarScrollArea.jsx";
import { LIST_COLLAPSE_AREAS, usePersistentCollapseState } from "../../settings/index.js";
import { openCharacterManagerWindow } from "../window/openCharacterManagerWindow.js";
import { openCharacterEditorWindow } from '../window/openCharacterEditorWindow.js';
import { FailureAlert } from '../../../ui/ui/FailureAlert.jsx';
import { useCatalogSlots } from '../../../ui/ui/CatalogSlotsContext.jsx';

export function CharacterListPanel({ characters, activeCharacterId, artworkMode, onSelectCharacter, onOpenCharacterChat, onSaveCharacterGroups, onImportPreparedCharacters, onPrepareCharacterImports, onDiscardCharacterImports, onCreateCharacter, onDeleteCharacters, onExportCharacters, home }) {
  const tUi = useProductTranslation();
  const { render, actions } = useCatalogSlots();
  const [localKeyword, setLocalKeyword] = useState("");
  const { keyword = localKeyword, setKeyword = setLocalKeyword } = home || {};
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [listTab, setListTab] = useState("characters");
  const [selectedGroup, setSelectedGroup] = useState(ALL_CHARACTERS);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState("add");
  const [editingGroupName, setEditingGroupName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState(null);
  const groupContext = useEditorContextMenu();
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [characterMenu, setCharacterMenu] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingCharacter, setDeletingCharacter] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const scrollRef = useSidebarListScroll();
  const [groupSortError, setGroupSortError] = useState(null);

  const groups = useMemo(() => {
    const names = [...new Set((characters.groups || []).map((group) => group.trim()).filter(Boolean))];
    for (const item of characters.items || []) {
      const group = characterGroup(item);
      if (group && !names.includes(group)) names.push(group);
    }
    return names;
  }, [characters]);
  const [collapsedGroups, setCollapsedGroups, collapseStateReady] = usePersistentCollapseState(
    LIST_COLLAPSE_AREAS.characters,
    {},
    characters.active_character_id || characters.groups?.length || characters.items?.length
      ? [ALL_CHARACTERS, ...groups]
      : undefined,
  );

  function toggleGroup(group) {
    setCollapsedGroups((current) => ({ ...current, [group]: !current[group] }));
  }

  useEffect(() => {
    function closeContextMenus(event) {
      if (event.type === "keydown" && event.key !== "Escape") return;
      setCreateMenuOpen(false);
    }
    window.addEventListener("pointerdown", closeContextMenus);
    window.addEventListener("keydown", closeContextMenus);
    return () => {
      window.removeEventListener("pointerdown", closeContextMenus);
      window.removeEventListener("keydown", closeContextMenus);
    };
  }, []);

  function openGroupMenu(event, group) {
    groupContext.open(event, group);
    setCreateMenuOpen(false);
    setCharacterMenu(null);
  }

  function openCharacterMenu(event, character) {
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget;
    const rowRect = row.getBoundingClientRect();
    const requestedX = event.clientX || rowRect.left + 18;
    const requestedY = event.clientY || rowRect.top + rowRect.height / 2;
    setCharacterMenu({
      character,
      returnFocus: row,
      x: requestedX,
      y: requestedY,
    });
    setExportError(null);
    groupContext.close();
  }

  function requestDeleteCharacter() {
    if (!characterMenu) return;
    setDeleteError(null);
    setPendingDelete({ character: characterMenu.character, returnFocus: characterMenu.returnFocus });
    setCharacterMenu(null);
  }

  async function exportCharacter(character, format) {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      const result = await onExportCharacters([character.id], format);
      if (result?.failures?.length) setExportError(result.failures[0].message);
    } catch (cause) {
      setExportError(cause ?? tUi('导出失败，请重试。'));
    } finally {
      setExporting(false);
    }
  }

  function selectCharacterAction(id) {
    if (!characterMenu) return;
    if (id === 'delete') { requestDeleteCharacter(); return; }
    const character = characterMenu.character;
    setCharacterMenu(null);
    if (id === 'edit') openCharacterEditorWindow(character.id);
    else if (id.startsWith('export-')) void exportCharacter(character, id.slice(7));
  }

  function cancelDeleteCharacter() {
    if (deletingCharacter) return;
    setDeleteError(null);
    setPendingDelete(null);
  }

  async function confirmDeleteCharacter() {
    if (!pendingDelete || deletingCharacter) return;
    setDeletingCharacter(true);
    setDeleteError(null);
    try {
      await onDeleteCharacters([pendingDelete.character.id]);
      setPendingDelete(null);
    } catch (error) {
      setDeleteError(error ?? tUi("删除失败，请重试。"));
    } finally {
      setDeletingCharacter(false);
    }
  }

  function openAddGroupDialog() {
    setCreateMenuOpen(false);
    setGroupError(null);
    setGroupDialogMode("add");
    setEditingGroupName("");
    setNewGroupName("");
    setGroupDialogOpen(true);
    groupContext.close();
  }

  function openRenameGroupDialog(group) {
    setGroupError(null);
    setGroupDialogMode("rename");
    setEditingGroupName(group);
    setNewGroupName(group);
    setGroupDialogOpen(true);
    groupContext.close();
  }

  async function reorderGroups(sourceGroup, targetGroup) {
    const sourceIndex = groups.indexOf(sourceGroup);
    const targetIndex = groups.indexOf(targetGroup);
    if (savingGroup || sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const ordered = [...groups];
    ordered.splice(sourceIndex, 1);
    ordered.splice(targetIndex, 0, sourceGroup);
    setGroupSortError(null);
    setSavingGroup(true);
    try {
      await onSaveCharacterGroups(ordered);
    } catch (error) {
      setGroupSortError(error);
    } finally {
      setSavingGroup(false);
    }
  }

  async function saveGroupDialog() {
    const name = newGroupName.trim();
    if (savingGroup || !name || name === editingGroupName) return;
    if (name === ALL_CHARACTERS || groups.includes(name)) {
      setGroupError(new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, tUi("分组名称已存在"), { what: tUi("分组") }));
      return;
    }
    setGroupError(null);
    setSavingGroup(true);
    try {
      if (groupDialogMode === "rename") {
        const nextGroups = groups.map((group) => (group === editingGroupName ? name : group));
        const assignments = (characters.items || []).filter((item) => characterGroup(item) === editingGroupName).map((item) => ({ characterId: item.id, group: name }));
        await onSaveCharacterGroups(nextGroups, assignments);
        home?.onGroupChange(editingGroupName, name);
        if (!home && selectedGroup === editingGroupName) setSelectedGroup(name);
      } else {
        await onSaveCharacterGroups([...groups, name]);
        if (!home) setSelectedGroup(name);
      }
      setNewGroupName("");
      setEditingGroupName("");
      setGroupDialogOpen(false);
    } catch (error) {
      setGroupError(error);
    } finally {
      setSavingGroup(false);
    }
  }

  function chooseGroupAction(action) {
    const group = groupContext.menu.target;
    if (action === "add") return openAddGroupDialog();
    if (action === "rename") return openRenameGroupDialog(group);
    if (action === "delete") {
      groupContext.close();
      setGroupError(null);
      setGroupToDelete(group);
    }
  }

  async function deleteGroup() {
    if (!groupToDelete || savingGroup) return;
    setGroupError(null);
    setSavingGroup(true);
    try {
      const remaining = groups.filter(group => group !== groupToDelete);
      const targetGroup = home ? "" : (remaining[0] || "");
      const assignments = (characters.items || []).filter(item => characterGroup(item) === groupToDelete)
        .map(item => ({ characterId: item.id, group: targetGroup }));
      await onSaveCharacterGroups(remaining, assignments);
      home?.onGroupChange(groupToDelete);
      if (!home && selectedGroup === groupToDelete) setSelectedGroup(ALL_CHARACTERS);
      setGroupToDelete(null);
    } catch (error) {
      setGroupError(error);
    } finally {
      setSavingGroup(false);
    }
  }

  function createInSelectedGroup() {
    setCreateMenuOpen(false);
    onCreateCharacter(home ? home.group : selectedGroup === ALL_CHARACTERS ? "" : selectedGroup);
  }

  function openImportDialog() {
    setCreateMenuOpen(false);
    setImportOpen(true);
  }

  function toggleCreateMenu(event) {
    event.stopPropagation();
    setCreateMenuOpen((current) => !current);
  }

  const createMenu = createMenuOpen && (
    <div className="character-create-menu" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" onClick={createInSelectedGroup}><CharacterManagerIcon /><span>{tUi("新建角色")}</span></button>
      <button type="button" onClick={openImportDialog}><ImportIcon /><span>{tUi("导入角色卡")}</span></button>
      {actions('eleckoi.character.library.menu.actions', { surface: 'pc-sidebar', menu: 'create', busy: false, onDismiss: () => setCreateMenuOpen(false) })}
    </div>
  );
  const onReorderGroup = savingGroup ? undefined : reorderGroups;

  return (<>
    <aside className="character-list-panel">
      {home && <div className="character-home-create">
        <button type="button" data-dsh-control aria-expanded={createMenuOpen}
          onPointerDown={(event) => event.stopPropagation()} onClick={toggleCreateMenu}>
          <CharacterManagerIcon size={14} /><span>{tUi("新建角色")}</span>
        </button>
        {createMenu}
      </div>}
      <SidebarSectionHeader title={tUi(home ? "角色卡" : "角色")} value={keyword} onValueChange={setKeyword}
        compact={Boolean(home)}
        compactActions={home && <>{home.sortMenu}<Tooltip label={tUi("新建分组")} side="bottom" delayMs={500} portal>
          <Button data-dsh-control variant="ghost" size="sm" className="sidebar-section-action"
            aria-label={tUi("新建分组")} aria-haspopup="dialog" onClick={openAddGroupDialog}>
            <IconProjectAddOutlineRegular size={16} />
          </Button>
        </Tooltip></>}
        searchLabel={home ? tUi("搜索角色名称") : undefined}
        renderSearch={fallback => render('eleckoi.character.library.search', { surface: 'pc-sidebar', value: keyword, onChange: setKeyword }, fallback)}
        placeholder={tUi("搜索角色名称")} createLabel={tUi("新建角色")}
        createExpanded={createMenuOpen} onCreatePointerDown={(event) => event.stopPropagation()}
        onCreate={toggleCreateMenu}
        onSearchFocus={() => setCreateMenuOpen(false)} />

      {!home && createMenu}

      {!home && <><button className="character-manager-entry" type="button" onClick={openCharacterManagerWindow}>
        <CharacterManagerIcon />
        <span>{tUi("角色卡管理器")}</span>
      </button>

      <div className="character-list-tabs" role="tablist" aria-label={tUi("角色与群聊")}>
        <button className={listTab === "characters" ? "active" : ""} type="button" onClick={() => setListTab("characters")}>
          {tUi("角色")}</button>
        <button className={listTab === "groups" ? "active" : ""} type="button" onClick={() => setListTab("groups")}>
          {tUi("群聊")}</button>
      </div>

      <SidebarScrollArea ref={scrollRef} className="character-list-scroll">
        {groupSortError && <FailureAlert failure={groupSortError} className="character-group-sort-error" />}
        {listTab === "characters" && collapseStateReady ? (
          render('eleckoi.character.library.groups', {
            surface: 'pc-sidebar', groups, allGroup: ALL_CHARACTERS, selectedGroup, onSelectGroup: setSelectedGroup, collapsedGroups, onToggleGroup: toggleGroup,
          }, <CharacterGroupList
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
            onReorderGroup={onReorderGroup}
            onGroupContextMenu={openGroupMenu}
          />)
        ) : listTab === "groups" ? (
          <div className="character-empty-groups">
            <strong>{tUi("暂无群聊")}</strong>
            <span>{tUi("群聊角色和多人对话以后放在这里。")}</span>
          </div>
        ) : null}
      </SidebarScrollArea></>}

      {groupContext.menu && <Menu open anchor={null} contextual portal autoFocus
        anchorPoint={{ x: groupContext.menu.x, y: groupContext.menu.y }}
        returnFocus={() => groupContext.menu.trigger} onClose={groupContext.close} onSelect={chooseGroupAction}
        items={[
          { id: 'add', label: tUi('新建分组'), icon: <IconProjectAddOutlineRegular size={16} /> },
          { id: 'rename', label: tUi('重命名分组'), icon: <PencilIcon /> },
          { id: 'delete-divider', type: 'separator' },
          { id: 'delete', label: tUi('删除分组'), icon: <TrashIcon />, danger: true },
        ]}>
        {actions('eleckoi.character.library.group.menu.actions', {
          surface: 'pc-sidebar', group: groupContext.menu.target, onDismiss: groupContext.close,
        })}
      </Menu>}

      {importOpen ? (
        <CharacterImportDialog
          onClose={() => setImportOpen(false)}
          onImported={onImportPreparedCharacters}
          onPrepare={onPrepareCharacterImports}
          onDiscard={onDiscardCharacterImports}
        />
      ) : null}

      {characterMenu ? <Menu open anchor={null} contextual portal autoFocus
        anchorPoint={{ x: characterMenu.x, y: characterMenu.y }}
        returnFocus={() => characterMenu.returnFocus}
        onClose={() => setCharacterMenu(null)} onSelect={selectCharacterAction}
        items={[
          { id: 'edit', label: tUi('编辑角色卡'), icon: <PencilIcon /> },
          { id: 'export', label: tUi('导出角色'), icon: <ExportIcon />, disabled: exporting || !onExportCharacters,
            submenu: ['png', 'zip'].map(format => ({ id: `export-${format}`, label: format.toUpperCase() })) },
          { id: 'delete-divider', type: 'separator' },
          { id: 'delete', label: tUi('删除角色'), icon: <TrashIcon />, danger: true },
        ]}>
        {actions('eleckoi.character.library.item.menu.actions', {
          surface: 'pc-sidebar', character: characterMenu.character, busy: exporting,
          onDismiss: () => { setCharacterMenu(null); characterMenu.returnFocus?.focus(); },
        })}
      </Menu> : null}
      <FailureAlert failure={exportError} className="character-export-error" />

      {pendingDelete ? (
        <DeleteCharacterDialog
          character={{ ...pendingDelete.character, name: characterName(pendingDelete.character, tUi) }}
          deleting={deletingCharacter}
          error={deleteError}
          returnFocus={pendingDelete.returnFocus}
          onCancel={cancelDeleteCharacter}
          onConfirm={confirmDeleteCharacter}
        />
      ) : null}

      {groupDialogOpen ? (
        <GroupNameDialog
          title={groupDialogMode === "rename" ? tUi("重命名该组") : tUi(home ? "新建分组" : "添加分组")}
          value={newGroupName}
          onChange={name => { setNewGroupName(name); setGroupError(null); }}
          onConfirm={saveGroupDialog}
          onCancel={() => setGroupDialogOpen(false)}
          busy={savingGroup}
          error={groupError}
        />
      ) : null}
      {groupToDelete && <ConfirmationDialog open destructive busy={savingGroup}
        title={tUi('删除分组？')} description={tUi('删除“{value0}”分组，角色卡保留。', { value0: groupToDelete })}
        confirmLabel={tUi('删除')} onCancel={() => setGroupToDelete(null)} onConfirm={deleteGroup}>
        {groupError && <FailureAlert failure={groupError} />}
      </ConfirmationDialog>}
    </aside>
    {home?.renderShelf({ onGroupContextMenu: openGroupMenu, onReorderGroup, groupSortError })}
  </>);
}
