import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { useEffect, useMemo, useState } from "react";
import { CopyIcon, ExportIcon, ImportIcon, PencilIcon, PlusIcon, TrashIcon } from "../../../ui/icons/index.jsx";
import { Input, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { FailureAlert } from "../../../ui/ui/FailureAlert.jsx";
import { GroupAssignmentMenu } from "../../../ui/ui/GroupAssignmentMenu.jsx";
import { openCharacterEditorWindow } from "../window/openCharacterEditorWindow.js";
import { AddGroupDialog } from "./AddGroupDialog.jsx";
import { CharacterCard } from "./CharacterCard.jsx";
import { CharacterImportDialog } from "./CharacterImportDialog.jsx";
import { ALL_CHARACTERS, characterGroup, characterName } from "./characterUtils.js";

const CHARACTER_ARTWORK_RATIOS = [0.76, 0.68, 0.84, 0.72];

export function characterArtworkAspectRatio(index) {
  return CHARACTER_ARTWORK_RATIOS[index % CHARACTER_ARTWORK_RATIOS.length];
}

export function CharacterManager({ characters, persona, onSaveGroups, onDeleteCharacters, onImportCharacters, onPrepareImports, onDiscardImports, onExportCharacters, onDuplicateCharacter }) {
  const tUi = useProductTranslation();
  const [selectedGroup, setSelectedGroup] = useState(ALL_CHARACTERS);
  const [keyword, setKeyword] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [groupMenu, setGroupMenu] = useState(null);
  const [cardGroupMenu, setCardGroupMenu] = useState(null);
  const [groupDialog, setGroupDialog] = useState(null);
  const [groupDraft, setGroupDraft] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [duplicatingIds, setDuplicatingIds] = useState([]);

  const groups = useMemo(() => {
    const names = [...new Set((characters.groups || []).map((group) => group.trim()).filter(Boolean))];
    for (const character of characters.items || []) {
      const group = characterGroup(character);
      if (group && !names.includes(group)) names.push(group);
    }
    return names;
  }, [characters]);
  const visibleCharacters = useMemo(() => {
    const key = keyword.trim().toLocaleLowerCase();
    return (characters.items || []).filter((character) => {
      const inGroup = selectedGroup === ALL_CHARACTERS || characterGroup(character) === selectedGroup;
      const matches = !key || `${characterName(character, tUi)} ${characterGroup(character)}`.toLocaleLowerCase().includes(key);
      return inGroup && matches;
    });
  }, [characters, keyword, selectedGroup, tUi]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectionMode = deleteMode || Boolean(exportFormat);
  // 导出目标的名字取自完整角色列表（而不是当前可见列表），
  // 这样即使目标被搜索/分组隐藏，选择条也仍然点名它，不会静默导出看不见的卡。
  const exportTargetNames = useMemo(() => {
    const names = new Map((characters.items || []).map((character) => [character.id, characterName(character, tUi)]));
    return selectedIds.map((characterId) => names.get(characterId) || characterId);
  }, [characters, selectedIds, tUi]);
  const exportTargetsText = exportTargetNames.join("、");
  const exportTargetsLine = exportTargetNames.length ? tUi("将导出：{value0}", {value0: exportTargetsText}) : "";
  const allVisibleSelected = Boolean(visibleCharacters.length)
    && visibleCharacters.every((character) => selectedSet.has(character.id));

  // 角色卡在别处被删除（另一个窗口、或导出途中）时，把失效的勾选一并剔除。
  // 不剔除的话会留下一个导不出去的幽灵目标：清单只能显示裸 id，点导出必然失败，
  // 用户只能靠「清空」脱身。这个 effect 同时覆盖删除模式。
  useEffect(() => {
    const existing = new Set((characters.items || []).map((character) => character.id));
    setSelectedIds((current) => {
      const next = current.filter((characterId) => existing.has(characterId));
      return next.length === current.length ? current : next;
    });
  }, [characters]);

  useEffect(() => {
    if (selectedGroup !== ALL_CHARACTERS && !groups.includes(selectedGroup)) setSelectedGroup(ALL_CHARACTERS);
  }, [groups, selectedGroup]);

  useEffect(() => {
    function closeMenus(event) {
      if (event.type === "keydown" && event.key !== "Escape") return;
      setGroupMenu(null);
      setCardGroupMenu(null);
    }
    window.addEventListener("pointerdown", closeMenus);
    window.addEventListener("keydown", closeMenus);
    return () => {
      window.removeEventListener("pointerdown", closeMenus);
      window.removeEventListener("keydown", closeMenus);
    };
  }, []);

  // Escape 退出导出勾选模式（与 App 其他选择页一致）。弹层打开时让弹层先消费 Escape。
  useEffect(() => {
    if (!exportFormat) return undefined;
    function leaveExportMode(event) {
      if (event.key !== "Escape") return;
      if (exporting || groupMenu || cardGroupMenu || groupDialog || importOpen) return;
      event.preventDefault();
      setExportFormat("");
      setSelectedIds([]);
      setExportNotice("");
    }
    window.addEventListener("keydown", leaveExportMode);
    return () => window.removeEventListener("keydown", leaveExportMode);
  }, [exportFormat, exporting, groupMenu, cardGroupMenu, groupDialog, importOpen]);

  function countByGroup(group) {
    return (characters.items || []).filter((character) => characterGroup(character) === group).length;
  }

  function openGroupMenu(event, group = selectedGroup === ALL_CHARACTERS ? "" : selectedGroup) {
    event.preventDefault();
    event.stopPropagation();
    if (group) setSelectedGroup(group);
    setCardGroupMenu(null);
    setGroupMenu({
      group,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 164)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 116)),
    });
  }

  function openGroupDialog(mode, group = "") {
    setGroupDialog({ mode, group });
    setGroupDraft(group);
    setGroupMenu(null);
    setCardGroupMenu(null);
  }

  function openCardGroupMenu(event, character) {
    event.preventDefault();
    event.stopPropagation();
    if (selectionMode) return;
    setGroupMenu(null);
    setCardGroupMenu({ character, x: event.clientX, y: event.clientY });
  }

  async function moveCharacterToGroup(group) {
    const character = cardGroupMenu?.character;
    if (!character || characterGroup(character) === group) return;
    setError(null);
    try {
      await onSaveGroups(groups, [{ characterId: character.id, group }]);
      setCardGroupMenu(null);
    } catch (cause) {
      setError(cause ?? tUi("移动角色卡失败，请重试。"));
    }
  }

  async function duplicateCharacter(characterId) {
    if (duplicatingIds.includes(characterId)) return;
    setCardGroupMenu(null);
    setError(null);
    setDuplicatingIds(current => [...current, characterId]);
    try { await onDuplicateCharacter(characterId); }
    catch (cause) { setError(cause ?? tUi("复制角色卡失败，请重试。")); }
    finally { setDuplicatingIds(current => current.filter(id => id !== characterId)); }
  }

  async function saveGroup() {
    const name = groupDraft.trim();
    if (!name || name === ALL_CHARACTERS) return;
    setError(null);
    try {
      if (groupDialog?.mode === "rename") {
        if (name === groupDialog.group || groups.includes(name)) return;
        const nextGroups = groups.map((group) => group === groupDialog.group ? name : group);
        const assignments = (characters.items || [])
          .filter((character) => characterGroup(character) === groupDialog.group)
          .map((character) => ({ characterId: character.id, group: name }));
        await onSaveGroups(nextGroups, assignments);
        setSelectedGroup(name);
      } else {
        if (groups.includes(name)) return;
        await onSaveGroups([...groups, name]);
        setSelectedGroup(name);
      }
      setGroupDialog(null);
      setGroupDraft("");
    } catch (cause) {
      setError(cause ?? tUi("保存分组失败，请重试。"));
    }
  }

  async function deleteGroup(group) {
    setGroupMenu(null);
    setError(null);
    try {
      const remaining = groups.filter((item) => item !== group);
      const targetGroup = remaining[0] || "";
      const assignments = (characters.items || [])
        .filter((character) => characterGroup(character) === group)
        .map((character) => ({ characterId: character.id, group: targetGroup }));
      await onSaveGroups(remaining, assignments);
      setSelectedGroup(ALL_CHARACTERS);
    } catch (cause) {
      setError(cause ?? tUi("删除分组失败，请重试。"));
    }
  }

  function toggleSelected(characterId) {
    if (selectedIds.includes(characterId)) {
      setSelectedIds(selectedIds.filter((id) => id !== characterId));
      return;
    }
    setError(null);
    setSelectedIds([...selectedIds, characterId]);
  }

  function cancelDeleteMode() {
    setDeleteMode(false);
    setSelectedIds([]);
  }

  /** 进入勾选模式时不预选角色；格式默认 PNG，可在选择条中切换。 */
  function startExport() {
    if (exporting) return;
    setExportFormat("png");
    setError(null);
    setExportNotice("");
    setSelectedIds([]);
  }

  function cancelExport() {
    setExportFormat("");
    setSelectedIds([]);
    setExportNotice("");
    setError(null);
  }

  /** 选择期内换格式：勾选保持不变，"先选卡再决定导什么格式"不用重来。 */
  function changeExportFormat(format) {
    if (exporting) return;
    setExportFormat(format);
  }

  function selectAllVisible() {
    const merged = [...new Set([...selectedIds, ...visibleCharacters.map((character) => character.id)])];
    setSelectedIds(merged);
    setError(null);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function confirmExport() {
    if (!selectedIds.length || exporting) return;
    setError(null);
    setExportNotice("");
    setExporting(true);
    try {
      const result = await onExportCharacters([...selectedIds], exportFormat);
      const failures = result?.failures || [];
      const written = result?.written || [];
      if (result?.canceled) {
        const writtenIds = new Set(written.map(item => item.characterId));
        setSelectedIds(current => current.filter(id => !writtenIds.has(id)));
        if (written.length) setExportNotice(tUi("已导出 {value0} 张 · {value1} → {value2}", {value0: written.length, value1: exportFormat.toUpperCase(), value2: result.directory}));
        if (failures.length) setError(failures[0].message);
        return;
      }
      if (failures.length) {
        // 只留下失败的：成功的移出勾选，重试时不会把同一张卡导出两遍。
        const failed = new Set(failures.map((failure) => failure.characterId));
        setSelectedIds((current) => current.filter((characterId) => failed.has(characterId)));
        setError(tUi("{value0}（已导出 {value1} 张，其余已从勾选中移除）", {value0: failures[0].message, value1: written.length}));
        return;
      }
      // 成功后保留勾选与模式：用户可以直接换成另一种格式再导一次。
      setExportNotice(tUi("已导出 {value0} 张 · {value1} → {value2}", {value0: written.length, value1: exportFormat.toUpperCase(), value2: result?.directory || ""}));
    } catch (cause) {
      setError(cause ?? tUi("导出失败，请重试。"));
    } finally {
      setExporting(false);
    }
  }

  async function confirmDelete() {
    if (!selectedIds.length) return;
    setError(null);
    try {
      await onDeleteCharacters(selectedIds);
      cancelDeleteMode();
    } catch (cause) {
      setError(cause ?? tUi("删除失败，请重试。"));
    }
  }

  return (
    <section className="character-manager-window" aria-label={tUi("角色卡管理器")}>
      <aside className="character-manager-groups" onContextMenu={(event) => openGroupMenu(event)}>
        <button
          className={`character-manager-group ${selectedGroup === ALL_CHARACTERS ? "active" : ""}`}
          type="button"
          onClick={() => setSelectedGroup(ALL_CHARACTERS)}
        >
          <span>{tUi(ALL_CHARACTERS)}</span>
          <em>{characters.items?.length || 0}</em>
        </button>
        <small>{tUi("分组")}</small>
        <div className="character-manager-group-list">
          {groups.map((group) => (
            <button
              className={`character-manager-group ${selectedGroup === group ? "active" : ""}`}
              type="button"
              key={group}
              onClick={() => setSelectedGroup(group)}
              onContextMenu={(event) => openGroupMenu(event, group)}
            >
              <span>{group}</span>
              <em>{countByGroup(group)}</em>
            </button>
          ))}
        </div>
        <Button data-dsh-control variant="outline" className="character-add-group-button" type="button" onClick={() => openGroupDialog("add")}>
          <PlusIcon />
          {tUi("添加分组")}</Button>
      </aside>

      <section className="character-manager-main">
        <header className="character-manager-titlebar">
          {exportFormat ? (
            <section className="character-manager-selection-bar" aria-label={tUi("导出选择")}>
              <div className="character-manager-selection-summary">
                <span className="character-manager-selection-count">{tUi("已选 ")}{selectedIds.length}{tUi(" 张")}</span>
                <div className="character-manager-format-switch" role="group" aria-label={tUi("导出格式")}>
                  <button
                    type="button"
                    aria-pressed={exportFormat === "png"}
                    disabled={exporting}
                    onClick={() => changeExportFormat("png")}
                  >
                    PNG
                  </button>
                  <button
                    type="button"
                    aria-pressed={exportFormat === "json"}
                    disabled={exporting}
                    onClick={() => changeExportFormat("json")}
                  >
                    JSON
                  </button>
                </div>
              </div>
              <Input data-dsh-control type="search" icon={<IconSearchOutlineRegular />}
                className="character-manager-search"
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                placeholder={tUi("搜索角色…")}
                aria-label={tUi("搜索角色")}
              />
              <div className="character-manager-selection-actions">
                <Button data-dsh-control variant="outline" type="button" disabled={exporting || allVisibleSelected} onClick={selectAllVisible}>
                  {tUi("全选当前列表")}</Button>
                <Button data-dsh-control variant="outline" type="button" disabled={exporting || !selectedIds.length} onClick={clearSelection}>{tUi("清空")}</Button>
                <Button data-dsh-control variant="outline" type="button" disabled={exporting} onClick={cancelExport}>{exportNotice ? tUi("完成") : tUi("取消")}</Button>
                <Button data-dsh-control variant="primary"
                  className="character-manager-confirm-export"
                  type="button"
                  disabled={!selectedIds.length || exporting}
                  onClick={confirmExport}
                >
                  {exporting ? tUi("导出中…") : tUi("导出 {value0} 张", {value0: selectedIds.length})}
                </Button>
              </div>
              <p className="character-manager-selection-targets" title={exportTargetsText}>
                <span>{exportTargetsLine}</span>
                <span className="character-manager-selection-notice" role="status">{exportNotice}</span>
              </p>
            </section>
          ) : (
            <>
              <h2>{tUi("角色卡管理器")}</h2>
              <Input data-dsh-control type="search" icon={<IconSearchOutlineRegular />}
                className="character-manager-search"
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                placeholder={tUi("搜索角色…")}
                aria-label={tUi("搜索角色")}
              />
              {deleteMode ? (
                <>
                  <Button data-dsh-control variant="primary" className="character-manager-confirm-delete" type="button" disabled={!selectedIds.length} onClick={confirmDelete}>
                    {tUi("确认")}{selectedIds.length ? ` ${selectedIds.length}` : ""}
                  </Button>
                  <Button data-dsh-control variant="outline" type="button" onClick={cancelDeleteMode}>{tUi("取消")}</Button>
                </>
              ) : (
                <>
                  <Button data-dsh-control variant="outline" type="button" onClick={() => setImportOpen(true)}><ImportIcon />{tUi("导入角色")}</Button>
                  <Button data-dsh-control variant="outline" type="button" disabled={!characters.items?.length} onClick={startExport}>
                    <ExportIcon />{tUi("导出角色")}</Button>
                  <Button data-dsh-control variant="outline" type="button" disabled={!characters.items?.length} onClick={() => setDeleteMode(true)}><TrashIcon />{tUi("删除")}</Button>
                </>
              )}
            </>
          )}
        </header>

        <div className="character-manager-scroll">
          <FailureAlert failure={error} className="character-manager-error" />
          {visibleCharacters.length ? (
            <div className="character-manager-grid">
              {visibleCharacters.map((character, index) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  artworkAspectRatio={characterArtworkAspectRatio(index)}
                  authorName={persona?.user_name || tUi("用户")}
                  authorAvatar={persona?.user_avatar || ""}
                  selectable={selectionMode}
                  selected={selectedSet.has(character.id)}
                  onClick={selectionMode ? toggleSelected : openCharacterEditorWindow}
                  onContextMenu={selectionMode ? undefined : openCardGroupMenu}
                />
              ))}
            </div>
          ) : <p className="character-manager-empty">{tUi("这个分组里还没有角色卡。")}</p>}
        </div>
      </section>

      {groupMenu ? (
        <div className="character-group-context-menu" style={{ left: `${groupMenu.x}px`, top: `${groupMenu.y}px` }} onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => openGroupDialog("add")}><PlusIcon /><span>{tUi("添加分组")}</span></button>
          {groupMenu.group ? (
            <>
              <button type="button" onClick={() => openGroupDialog("rename", groupMenu.group)}><PencilIcon /><span>{tUi("重命名该组")}</span></button>
              <button type="button" onClick={() => deleteGroup(groupMenu.group)}><TrashIcon /><span>{tUi("删除分组")}</span></button>
            </>
          ) : null}
        </div>
      ) : null}

      {cardGroupMenu ? (
        <GroupAssignmentMenu
          x={cardGroupMenu.x}
          y={cardGroupMenu.y}
          label={tUi("{value0}的操作", {value0: characterName(cardGroupMenu.character, tUi)})}
          currentGroupId={characterGroup(cardGroupMenu.character)}
          groups={groups.map((group) => ({ id: group, name: group }))}
          onMove={moveCharacterToGroup}
          actions={[
            { label: tUi("编辑角色卡"), icon: PencilIcon, run: () => { setCardGroupMenu(null); openCharacterEditorWindow(cardGroupMenu.character.id); } },
            { label: tUi("复制角色卡"), icon: CopyIcon, disabled: duplicatingIds.includes(cardGroupMenu.character.id), run: () => void duplicateCharacter(cardGroupMenu.character.id) },
          ]}
        />
      ) : null}

      {groupDialog ? (
        <AddGroupDialog
          title={groupDialog.mode === "rename" ? tUi("重命名该组") : tUi("添加分组")}
          value={groupDraft}
          onChange={setGroupDraft}
          onConfirm={saveGroup}
          onCancel={() => setGroupDialog(null)}
        />
      ) : null}
      {importOpen ? <CharacterImportDialog onClose={() => setImportOpen(false)} onImported={onImportCharacters} onPrepare={onPrepareImports} onDiscard={onDiscardImports} /> : null}
    </section>
  );
}
