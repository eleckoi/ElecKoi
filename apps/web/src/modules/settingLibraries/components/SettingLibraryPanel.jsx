import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EditorScopeTabs } from '../../../ui/ui/EditorScopeTabs.jsx';
import {
  Code,
  Copy,
  FileText,
  LinkSimple,
  PencilSimple,
  Plus,
  SlidersHorizontal,
  Trash,
} from "../../../ui/icons/interfaceIcons.jsx";
import { DshFolderClosedIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { SETTING_LIBRARY_CREATE_ICONS } from "../../../ui/icons/settingLibraryCreateIcons.jsx";
import { SettingLibraryManager } from "./SettingLibraryManager.jsx";
import { GlobalSettingLibrariesDirectory, GlobalSettingLibraryImport, useGlobalSettingLibraries } from './GlobalSettingLibraries.jsx';
import { ConfirmationDialog, SaveControl } from "./SettingLibraryControls.jsx";
import { SettingLibraryInspector } from "./SettingLibraryInspector.jsx";
import { SettingLibraryTree, SettingTreeActionsContext } from "./SettingLibraryTree.jsx";
import { EditorSidebarLayout } from "../../../ui/ui/EditorSidebarLayout.jsx";
import { EditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { MobileEditorActions } from '../../../ui/ui/MobileEditorActions.jsx';
import { EditorCollectionToolbar, EditorSelectionBar, useEditorMultiSelect } from '../../../ui/ui/EditorCollectionControls.jsx';
import { selectableTreeIds, selectedTreeRootIds, visibleTreeSelectionIds } from '../../../ui/ui/editorCollectionSelection.js';
import {
  PINNED_ENTRY_IDS,
  canTransferSettingNode,
  copySettingNode,
  createEntryDraft,
  createGroupDraft,
  createId,
  moveTreeNode,
  uniqueName,
} from "../model/settingLibraryEditing.js";
import {
  descendants,
  findSelected,
  hasSearchResults,
  nodeKey,
  parseNodeKey,
  treeNodes,
} from "../model/settingLibraryTree.js";
import { reportFailure } from "../../../utils/failureText.js";

import { useCharacterConfigurationDraft } from '../../../ui/hooks/useCharacterConfigurationDraft.js';

const CreateFolderIcon = SETTING_LIBRARY_CREATE_ICONS.group;
const CreateEntryIcon = SETTING_LIBRARY_CREATE_ICONS.entry;
const CreateReferenceIcon = SETTING_LIBRARY_CREATE_ICONS.reference;

function nodeIcon(entry) {
  if (entry?.contentMode === "ejs") return Code;
  if (entry?.dynamicMode === "ejs_reference") return LinkSimple;
  return FileText;
}

export const SettingLibraryPanel = forwardRef(function SettingLibraryPanel({ characterId, settingLibraries, globalSettingLibraries, onDirtyChange }, ref) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const scopePanelId = useId();
  const [scope, setScope] = useState('character');
  const [selectedKey, setSelectedKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [clipboard, setClipboard] = useState(null);
  const [roleExpandedKeys, setRoleExpandedKeys] = useState([]);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const nameInputRef = useRef(null);
  const expandedKeysRef = useRef([]);
  const roleExpandedKeysRef = useRef([]);
  const globals = useGlobalSettingLibraries(globalSettingLibraries, key => { setSelectedKey(key); setEditing(false); setContextMenu(null); });
  const draft = useCharacterConfigurationDraft({ characterId, configuration: settingLibraries, saveShortcut: false,
    onAdopt: loaded => {
      const expanded = loaded.expandedGroupIds.map(id => nodeKey('group', id));
      roleExpandedKeysRef.current = expanded;
      setRoleExpandedKeys(expanded);
    },
    prepareSave: snapshot => ({ ...snapshot, listAllExpanded: false,
      expandedGroupIds: roleExpandedKeysRef.current.map(parseNodeKey).filter(item => item.kind === 'group').map(item => item.id) }),
  });
  const { library: roleLibrary, setLibrary, setPersisted, libraryRef: roleLibraryRef, persistedRef,
    dirty: roleDirty, saving: roleSaving, error: roleError, saveNotice: roleNotice, changeLibrary: changeRoleLibrary, save: saveRole, discard: discardRole } = draft;
  const library = scope === 'global' ? globals.library : roleLibrary;
  const libraryRef = scope === 'global' ? globals.activeLibraryRef : roleLibraryRef;
  const setError = scope === 'global' ? globals.setError : draft.setError;
  const activeLibraryId = scope === 'global' ? globals.selection?.libraryId : characterId;
  const expandedKeys = scope === 'global'
    ? globals.expandedGroups[activeLibraryId] ?? (library?.listAllExpanded ? library.groups.map(group => nodeKey('group', group.id)) : library?.expandedGroupIds.map(id => nodeKey('group', id)) ?? [])
    : roleExpandedKeys;
  expandedKeysRef.current = expandedKeys;
  function setExpandedKeys(keys) {
    if (scope === 'global') globals.setExpandedGroups(current => ({ ...current, [activeLibraryId]: keys }));
    else { roleExpandedKeysRef.current = keys; setRoleExpandedKeys(keys); }
  }
  function readLibrary(libraryId = activeLibraryId) {
    return scope === 'global' ? globals.libraryRef.current?.libraries.find(item => item.id === libraryId) : roleLibraryRef.current;
  }
  function changeLibrary(updater, libraryId = activeLibraryId) {
    if (scope === 'global') globals.updateLibrary(libraryId, updater);
    else changeRoleLibrary(updater);
  }
  function selectTarget(key, libraryId = activeLibraryId) {
    if (scope === 'global') globals.select(libraryId, key);
    else selectNode(key);
  }
  function withExpandedGroups(value, ids) {
    const view = { listAllExpanded: false, expandedGroupIds: ids };
    return scope === 'global' ? { ...value, ...view } : { ...value, ...view,
      versions: value.versions.map(version => version.id === value.activeVersionId ? { ...version, ...view } : version) };
  }
  const dirty = roleDirty || globals.dirty;
  const saving = roleSaving || globals.saving;
  const error = roleError || globals.error;
  const saveNotice = roleNotice || globals.saveNotice;
  async function save() {
    if (roleDirty && !await saveRole()) return false;
    if (globals.dirty && !await globals.save()) return false;
    return true;
  }
  function discard() { discardRole(); globals.discard(); }
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    function shortcut(event) {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault(); if (dirty && !saving) void save();
      }
    }
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  });
  const settingLibrary = library;
  const selected = useMemo(() => findSelected(settingLibrary, selectedKey), [settingLibrary, selectedKey]);
  const nodes = useMemo(() => treeNodes(settingLibrary), [settingLibrary]);
  const selectionQuery = scope === 'global' && library?.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? '' : query;
  const searchHasResults = useMemo(() => settingLibrary ? hasSearchResults(settingLibrary, query) : false, [settingLibrary, query]);

  useEffect(() => { setClipboard(null); setDeleteTarget(null); }, [scope, activeLibraryId]);
  useEffect(() => {
    setSelectedKey('');
    setManagerOpen(false);
  }, [characterId]);

  function requestCloseInspector() {
    if (compact) setEditing(false);
    else setSelectedKey('');
  }

  function selectNode(key) {
    setSelectedKey(key);
    setEditing(false);
  }

  function openEditor(key = selectedKey) {
    setSelectedKey(key);
    setEditing(true);
  }

  function startTransfer(mode) {
    if (!selected.value || PINNED_ENTRY_IDS.has(selected.value.id)) return;
    setClipboard({ mode, target: { kind: selected.kind, id: selected.value.id } });
    selectNode('');
  }

  function pasteSelection() {
    const parentId = parentForNewNode();
    if (!clipboard || !canTransferSettingNode(libraryRef.current, clipboard.target, parentId)) {
      setError(tUi("不能粘贴到此文件夹，请选择其他位置。"));
      return;
    }
    if (clipboard.mode === 'cut') {
      handleMove({ dragId: nodeKey(clipboard.target.kind, clipboard.target.id), parentId: parentId ? nodeKey('group', parentId) : '',
        destinationIndex: Number.MAX_SAFE_INTEGER, expandParentId: parentId ? nodeKey('group', parentId) : '' });
      setSelectedKey(nodeKey(clipboard.target.kind, clipboard.target.id));
    } else {
      const copied = copySettingNode(libraryRef.current, clipboard.target, parentId);
      changeLibrary(copied.library);
      setSelectedKey(copied.key);
      if (parentId) handleExpandedKeysChange([...new Set([...expandedKeysRef.current, nodeKey('group', parentId)])]);
    }
    setClipboard(null);
  }

  function applyManagerChange(nextLibrary) {
    changeRoleLibrary(nextLibrary);
    const nextExpanded = nextLibrary.expandedGroupIds.map((id) => nodeKey("group", id));
    roleExpandedKeysRef.current = nextExpanded;
    setRoleExpandedKeys(nextExpanded);
    setSelectedKey("");
  }

  useImperativeHandle(ref, () => ({ save, discard }));

  function updateEntryById(id, updater) {
    changeLibrary((current) => ({
      ...current,
      entries: current.entries.map((entry) => entry.id === id
        ? (typeof updater === "function" ? updater(entry) : { ...entry, ...updater })
        : entry),
    }));
  }

  function updateGroup(patch) {
    if (selected.kind !== "group" || !selected.value) return;
    changeLibrary((current) => ({ ...current, groups: current.groups.map((group) => group.id === selected.value.id ? { ...group, ...patch } : group) }));
  }

  function parentForNewNode() {
    if (selected.kind === "group") return selected.value?.id || "";
    if (selected.kind === "entry") return selected.value?.groupId || "";
    return "";
  }

  function requestAddNode(kind, parentOverride, libraryId = activeLibraryId) {
    const parentId = parentOverride ?? parentForNewNode();
    const sourceLibrary = readLibrary(libraryId);
    if (!sourceLibrary) return;
    const order = 1 + Math.max(0,
      ...sourceLibrary.groups.filter((group) => group.parentId === parentId).map((group) => group.treeViewOrder),
      ...sourceLibrary.entries.filter((entry) => entry.groupId === parentId).map((entry) => entry.treeViewOrder),
    );
    let nextLibrary;
    let nextKey;
    if (kind === "group") {
      const names = new Set(sourceLibrary.groups.filter((group) => group.parentId === parentId).map((group) => group.name));
      const group = createGroupDraft(parentId, order, names);
      nextLibrary = { ...sourceLibrary, groups: [...sourceLibrary.groups, group] };
      nextKey = nodeKey("group", group.id);
    } else {
      const entry = createEntryDraft(parentId, order, sourceLibrary.entries, kind === "reference" ? "reference" : "standard");
      nextLibrary = { ...sourceLibrary, entries: [...sourceLibrary.entries, entry] };
      nextKey = nodeKey("entry", entry.id);
    }
    if (parentId) {
      const parentKey = nodeKey("group", parentId);
      const previousExpanded = scope === 'global' ? globals.expandedGroups[libraryId] ?? sourceLibrary.expandedGroupIds.map(id => nodeKey('group', id)) : expandedKeysRef.current;
      const nextExpanded = [...new Set([...previousExpanded, parentKey])];
      const nextGroupIds = nextExpanded.map(parseNodeKey).filter((item) => item.kind === "group").map((item) => item.id);
      if (scope === 'global') globals.setExpandedGroups(current => ({ ...current, [libraryId]: nextExpanded }));
      else { expandedKeysRef.current = nextExpanded; setExpandedKeys(nextExpanded); }
      nextLibrary = withExpandedGroups(nextLibrary, nextGroupIds);
    }
    changeLibrary(nextLibrary, libraryId);
    setMenuOpen(false);
    setContextMenu(null);
    selectTarget(nextKey, libraryId);
    openEditor(nextKey);
    requestAnimationFrame(() => nameInputRef.current?.select());
  }

  function askDelete(kind, id, libraryId = activeLibraryId) {
    const source = readLibrary(libraryId);
    const value = kind === "group" ? source.groups.find((group) => group.id === id) : source.entries.find((entry) => entry.id === id);
    if (!value || PINNED_ENTRY_IDS.has(id)) return;
    const name = kind === "group" ? value.name : value.title;
    const isReference = kind === "entry" && value.dynamicMode === "ejs_reference";
    setDeleteTarget({
      kind,
      id,
      libraryId,
      title: kind === "group" ? tUi("删除“{value0}”？", {value0: name}) : isReference ? tUi("删除这条 EJS引用设定？") : tUi("删除“{value0}”？", {value0: name || tUi("未命名设定")}),
      message: kind === "group"
        ? tUi("文件夹内的设定也会一起删除。")
        : isReference ? tUi("使用它的控制器将无法再通过 getwi 读取“{value0}”。", {value0: name || "未命名 EJS引用设定"}) : tUi("此操作会在保存后生效。"),
    });
    setContextMenu(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'batch') {
      const targets = deleteTarget.ids.map(parseNodeKey);
      changeLibrary(current => {
        const groups = new Set(targets.filter(target => target.kind === 'group').flatMap(target => [...descendants(current.groups, target.id)]));
        const entries = new Set(targets.filter(target => target.kind === 'entry').map(target => target.id));
        return { ...current, groups: current.groups.filter(group => !groups.has(group.id)),
          entries: current.entries.filter(entry => PINNED_ENTRY_IDS.has(entry.id) || !groups.has(entry.groupId) && !entries.has(entry.id)) };
      });
      selectNode(''); setDeleteTarget(null); multi.clear(); return;
    }
    const current = readLibrary(deleteTarget.libraryId);
    const removed = deleteTarget.kind === 'group' ? descendants(current.groups, deleteTarget.id) : new Set();
    const next = { ...current, groups: current.groups.filter(group => !removed.has(group.id)),
      entries: current.entries.filter(entry => deleteTarget.kind !== 'entry' || entry.id !== deleteTarget.id).filter(entry => !removed.has(entry.groupId)) };
    changeLibrary(next, deleteTarget.libraryId);
    if (deleteTarget.libraryId === activeLibraryId && !findSelected(next, selectedKey).value) selectNode('');
    setDeleteTarget(null);
  }

  function duplicateEntry(id, libraryId = activeLibraryId) {
    const targetLibrary = readLibrary(libraryId);
    const source = targetLibrary.entries.find((entry) => entry.id === id);
    if (!source || PINNED_ENTRY_IDS.has(id)) return;
    const timestamp = new Date().toISOString();
    const names = new Set(targetLibrary.entries.filter((entry) => entry.groupId === source.groupId).map((entry) => entry.title));
    const title = uniqueName(source.title ? tUi("{value0} 副本", {value0: source.title}) : tUi("新建设定"), names);
    const entry = {
      ...source,
      id: createId("setting"),
      title,
      treeViewOrder: Math.max(0, ...targetLibrary.entries.filter((item) => item.groupId === source.groupId).map((item) => item.treeViewOrder)) + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    changeLibrary((current) => ({ ...current, entries: [...current.entries, entry] }), libraryId);
    selectTarget(nodeKey("entry", entry.id), libraryId);
    setContextMenu(null);
  }

  function handleMove({ dragId, parentId, destinationIndex, expandParentId }) {
    const moved = parseNodeKey(dragId);
    const destinationParentId = parentId ? parseNodeKey(parentId).id : "";
    if (!moved.id || PINNED_ENTRY_IDS.has(moved.id)) return;
    const expandedParentKey = expandParentId || "";
    const nextExpandedKeys = expandedParentKey
      ? [...new Set([...expandedKeysRef.current, expandedParentKey])]
      : expandedKeysRef.current;
    const nextGroupIds = nextExpandedKeys.map(parseNodeKey).filter((item) => item.kind === "group").map((item) => item.id);
    if (expandedParentKey) {
      expandedKeysRef.current = nextExpandedKeys;
      setExpandedKeys(nextExpandedKeys);
    }
    changeLibrary((current) => {
      const next = moveTreeNode(current, moved, destinationParentId, destinationIndex);
      if (!expandedParentKey) return next;
      return withExpandedGroups(next, nextGroupIds);
    });
  }

  function handleExpandedKeysChange(nextKeys) {
    const nextGroupIds = nextKeys.map(parseNodeKey).filter((item) => item.kind === "group").map((item) => item.id);
    const applyViewState = value => value ? withExpandedGroups(value, nextGroupIds) : value;
    expandedKeysRef.current = nextKeys;
    setExpandedKeys(nextKeys);
    if (scope === 'global') return;
    libraryRef.current = applyViewState(libraryRef.current);
    persistedRef.current = applyViewState(persistedRef.current);
    setLibrary((current) => applyViewState(current));
    setPersisted((current) => applyViewState(current));
    void settingLibraries.saveViewState(characterId, nextGroupIds).catch(error => reportFailure(error, "保存设置库视图状态"))
  }

  function openContextMenu(event, node, sourceLibrary = library) {
    event.preventDefault();
    event.stopPropagation();
    if (compact) return;
    setMenuOpen(false);
    if (node.fixed) {
      setContextMenu({
        trigger: event.currentTarget, libraryId: scope === 'global' ? sourceLibrary.id : activeLibraryId,
        x: Math.min(event.clientX, window.innerWidth - 176),
        y: Math.min(event.clientY, window.innerHeight - 126),
        kind: "background",
        id: "",
        parentId: "",
      });
      return;
    }
    const nextContextMenu = {
      trigger: event.currentTarget, libraryId: scope === 'global' ? sourceLibrary.id : activeLibraryId,
      x: Math.min(event.clientX, window.innerWidth - 176),
      y: Math.min(event.clientY, window.innerHeight - 190),
      kind: node.nodeKind,
      id: node.recordId,
      parentId: node.nodeKind === "group"
        ? node.recordId
        : sourceLibrary.entries.find((entry) => entry.id === node.recordId)?.groupId || "",
    };
    setContextMenu(nextContextMenu);
  }

  function openTreeContextMenu(event, sourceLibrary = libraryRef.current) {
    event.preventDefault();
    if (!sourceLibrary) return;
    setMenuOpen(false);
    setContextMenu({
      trigger: event.currentTarget, libraryId: scope === 'global' ? sourceLibrary.id : activeLibraryId,
      x: Math.min(event.clientX, window.innerWidth - 176),
      y: Math.min(event.clientY, window.innerHeight - 126),
      kind: "background",
      id: "",
      parentId: "",
    });
  }

  function handleTreeMouseDown(event) {
    setContextMenu(null);
    if (event.button !== 0 || event.target.closest('[role="treeitem"]')) return;
    const tree = event.currentTarget;
    const treeRect = tree.getBoundingClientRect();
    const scrollbarHitWidth = Math.max(16, tree.offsetWidth - tree.clientWidth + 4);
    if (event.clientX >= treeRect.right - scrollbarHitWidth && event.clientX <= treeRect.right + 2) return;
    selectNode('');
  }

  const selectedIcon = selected.kind === "group" ? DshFolderClosedIcon : nodeIcon(selected.value);
  const SelectedIcon = selectedIcon || FileText;
  const multi = useEditorMultiSelect(selectableTreeIds(nodes), JSON.stringify([scope, activeLibraryId]));
  function copySelected() {
    const targets = selectedTreeRootIds(nodes, multi.selected).map(parseNodeKey);
    changeLibrary(current => targets.reduce((next, target) => {
      const value = target.kind === 'group' ? next.groups.find(item => item.id === target.id) : next.entries.find(item => item.id === target.id);
      return copySettingNode(next, target, target.kind === 'group' ? value.parentId : value.groupId).library;
    }, current));
    multi.clear();
  }
  function askDeleteBatch() { setDeleteTarget({ kind: 'batch', ids: selectedTreeRootIds(nodes, multi.selected), title: tUi("删除选中的 {value0} 项？", {value0: multi.selected.size}), message: tUi("所选文件夹及其内容会在保存后删除。") }); }
  const createItems = [{ label: tUi("文件夹"), Icon: CreateFolderIcon, run: () => requestAddNode('group') },
    { label: tUi("设定"), Icon: CreateEntryIcon, run: () => requestAddNode('entry') },
    { label: tUi("EJS引用设定"), Icon: CreateReferenceIcon, run: () => requestAddNode('reference') }];
  const inspector = !multi.active && selected.value && (!compact || editing) ? (
    <div className="setting-library-editor" key={JSON.stringify([scope, activeLibraryId])}>
    {globals.available ? <div className="setting-library-owner-path">{scope === 'global' ? tUi("全局设定库") : tUi("角色设定库")} / {library.name}</div> : null}
    <SettingLibraryInspector
      selected={selected}
      library={library}
      allowCustomPromptPositions={false}
      nameInputRef={nameInputRef}
      SelectedIcon={SelectedIcon}
      onClose={requestCloseInspector}
      onUpdateGroup={updateGroup}
      onDeleteGroup={() => askDelete("group", selected.value.id)}
      onUpdateEntry={(entry) => updateEntryById(entry.id, entry)}
      onEntriesChange={(entries) => changeLibrary((current) => ({ ...current, entries }))}
      onOpenEntry={(entryId) => openEditor(nodeKey("entry", entryId))}
      onPromptPositionsChange={(promptPositions, entries = library.entries) => changeLibrary((current) => ({ ...current, promptPositions, entries }))}
    />
    </div>
  ) : null;

  return (
    <EditorSidebarLayout
      className={`setting-library-layout${multi.active ? ' is-multiselect' : ''}`}
      inspector={inspector}
      inspectorTitle={selected.kind === 'group' ? tUi("编辑文件夹") : selected.value?.title || tUi("编辑设定")}
      onCloseInspector={requestCloseInspector}
      feedback={<SaveControl dirty={dirty} error={error} notice={saveNotice} saving={saving} onSave={save} />}
      aria-label={tUi("设定库")}
      onMouseDown={() => setMenuOpen(false)}
    >
      <div className="setting-library-browser editor-collection-browser">
        <EditorCollectionToolbar query={query} onQueryChange={setQuery} placeholder={scope === 'global' ? tUi("搜索全局设定库") : tUi("搜索设定")} selection={{ ...multi, toggle: () => { multi.toggle(); selectNode(''); setEditing(false); setContextMenu(null); } }} disabled={saving || !library}
          createItems={createItems}
          onManage={scope === 'character' ? () => setManagerOpen(true) : undefined}
          beforeSave={scope === 'global' ? <GlobalSettingLibraryImport state={globals} settingLibraries={settingLibraries} disabled={saving} /> : null}
          save={<SaveControl dirty={dirty} error={error} notice={saveNotice} saving={saving} onSave={save} />} />
        <EditorSelectionBar selection={multi} visibleIds={visibleTreeSelectionIds(nodes, selectionQuery)} disabled={saving} onCopy={copySelected} onDelete={askDeleteBatch} />

        <div id={scopePanelId} role={globals.available ? 'tabpanel' : undefined} aria-label={scope === 'character' ? tUi("角色设定库") : tUi("全局设定库")} className="setting-library-tree editor-sidebar-directory"
          onMouseDown={scope === 'character' ? handleTreeMouseDown : undefined} onContextMenu={scope === 'character' ? openTreeContextMenu : undefined}>
        {globals.available ? <EditorScopeTabs value={scope} panelId={scopePanelId} onChange={next => {
          setScope(next); setSelectedKey(''); globals.clear(); setEditing(false); setContextMenu(null);
          if (multi.active) multi.toggle();
        }} /> : null}
          {scope === 'global' ? <GlobalSettingLibrariesDirectory state={globals} query={query} disabled={saving} editor={{ compact, selection: multi, selectedKey, clipboard, openEditor, openContextMenu, openTreeContextMenu,
            moveLibrary: (id, drop) => {
              const moved = parseNodeKey(drop.dragId), parentId = drop.parentId ? parseNodeKey(drop.parentId).id : '';
              globals.updateLibrary(id, current => moveTreeNode(current, moved, parentId, drop.destinationIndex));
              if (drop.expandParentId) globals.setExpandedGroups(current => ({ ...current, [id]: [...new Set([...(current[id] ?? []), drop.expandParentId])] }));
            } }} /> : <>
          <div className={globals.available ? 'role-setting-library-container' : undefined}>
          <SettingTreeActionsContext.Provider value={{ openContextMenu, updateEntryById, selection: multi, saving, openEditor: compact && !multi.active ? openEditor : undefined }}>
            <SettingLibraryTree
              key={characterId}
              nodes={nodes}
              touchReorder={compact && !clipboard && !multi.active}
              dragEnabled={!clipboard && !multi.active}
              query={query}
              selectedId={multi.active ? '' : selectedKey}
              expandedIds={expandedKeys}
              onSelectedIdChange={key => { if (multi.active) { if (selectableTreeIds(nodes).includes(key)) multi.check(key, !multi.selected.has(key)); } else selectNode(key); }}
              onExpandedIdsChange={handleExpandedKeysChange}
              onMove={handleMove}
              ariaLabel={tUi("设定文件夹树")}
            />
          </SettingTreeActionsContext.Provider>
          {!library ? <p className="setting-library-loading" role={error ? 'alert' : 'status'}>{error || tUi("正在读取…")}</p> : !searchHasResults ? <p className="setting-library-empty">{tUi("没有匹配的设定")}</p> : null}
          </div>
          </>}
        </div>
        {compact && library && !multi.active && <MobileEditorActions label={tUi("设定操作")} selectionId={selectedKey} busy={saving} createItems={createItems}
          canEdit={Boolean(selected.value)} canModify={Boolean(selected.value) && !PINNED_ENTRY_IDS.has(selected.value.id)}
          clipboard={clipboard} canPaste={Boolean(clipboard && canTransferSettingNode(library, clipboard.target, parentForNewNode()))}
          onEdit={() => openEditor()} onMove={() => startTransfer('cut')} onPaste={pasteSelection} onCancel={() => setClipboard(null)}
          onDelete={() => askDelete(selected.kind, selected.value.id)}
          moreItems={selected.value && !PINNED_ENTRY_IDS.has(selected.value.id) ? [
            { label: tUi("复制"), Icon: Copy, run: () => startTransfer('copy') },
            { label: tUi("重命名"), Icon: PencilSimple, run: () => { openEditor(); requestAnimationFrame(() => nameInputRef.current?.select()); } },
          ] : []} />}
      </div>

      {managerOpen ? (
        <SettingLibraryManager
          characterId={characterId}
          settingLibraries={settingLibraries}
          library={roleLibrary}
          onChange={applyManagerChange}
          onClose={() => setManagerOpen(false)}
          onError={setError}
        />
      ) : null}

      {contextMenu ? <EditorContextMenu menu={contextMenu} label={tUi("设定操作")} onClose={() => setContextMenu(null)} actions={[
        ...(['background', 'group'].includes(contextMenu.kind) ? [
          { label: tUi("新建文件夹"), icon: CreateFolderIcon, run: () => requestAddNode('group', contextMenu.parentId, contextMenu.libraryId) },
          { label: tUi("新建设定"), icon: CreateEntryIcon, run: () => requestAddNode('entry', contextMenu.parentId, contextMenu.libraryId) },
          { label: tUi("新建 EJS引用设定"), icon: CreateReferenceIcon, run: () => requestAddNode('reference', contextMenu.parentId, contextMenu.libraryId) },
        ] : []),
        ...(contextMenu.kind === 'entry' ? [{ label: tUi("复制"), icon: Copy, run: () => duplicateEntry(contextMenu.id, contextMenu.libraryId) }] : []),
        ...(contextMenu.kind !== 'background' ? [
          { label: tUi("重命名"), icon: PencilSimple, run: () => { selectTarget(nodeKey(contextMenu.kind, contextMenu.id), contextMenu.libraryId); openEditor(nodeKey(contextMenu.kind, contextMenu.id)); requestAnimationFrame(() => nameInputRef.current?.select()); } },
          { label: tUi("删除"), icon: Trash, danger: true, run: () => askDelete(contextMenu.kind, contextMenu.id, contextMenu.libraryId) },
        ] : []),
      ].map(action => ({ ...action, disabled: saving }))} /> : null}
      <ConfirmationDialog target={deleteTarget} confirmLabel={tUi("删除")} tone="destructive" onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </EditorSidebarLayout>
  );
});
