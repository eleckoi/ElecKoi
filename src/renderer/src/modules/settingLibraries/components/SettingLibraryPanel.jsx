import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { adjustMoveIndex, Tree as ArboristTree } from "react-arborist";
import {
  Books,
  ChatCircleDots,
  Code,
  Copy,
  FilePlus,
  FileText,
  FolderPlus,
  LinkSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { getSettingLibrary, saveSettingLibrary, saveSettingLibraryViewState } from "../api/settingLibraryApi.js";
import { DshFolderClosedIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { SettingLibraryManager } from "./SettingLibraryManager.jsx";
import { ConfirmationDialog, SaveControl } from "./SettingLibraryControls.jsx";
import { SettingLibraryInspector } from "./SettingLibraryInspector.jsx";
import { SettingTreeActionsContext, SettingTreeCursor, SettingTreeNode } from "./SettingLibraryTree.jsx";
import {
  PINNED_ENTRY_IDS,
  createEntryDraft,
  createGroupDraft,
  createId,
  deleteOpening,
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

function nodeIcon(entry) {
  if (entry?.kind === "opening") return ChatCircleDots;
  if (entry?.dynamicMode === "ejs_controller") return Code;
  if (entry?.dynamicMode === "ejs_reference") return LinkSimple;
  return FileText;
}

export const SettingLibraryPanel = forwardRef(function SettingLibraryPanel({ characterId, onDirtyChange }, ref) {
  const [library, setLibrary] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const nameInputRef = useRef(null);
  const libraryRef = useRef(null);
  const persistedRef = useRef(null);
  const expandedKeysRef = useRef([]);
  const savePromiseRef = useRef(null);
  const treeRef = useRef(null);
  const treeViewportRef = useRef(null);
  const [treeHeight, setTreeHeight] = useState(0);
  const dirty = useMemo(() => JSON.stringify(library) !== JSON.stringify(persisted), [library, persisted]);
  const selected = useMemo(() => findSelected(library, selectedKey), [library, selectedKey]);
  const nodes = useMemo(() => treeNodes(library), [library]);
  const initialOpenState = useMemo(() => Object.fromEntries(expandedKeys.map((key) => [key, true])), [expandedKeys]);
  const searchHasResults = useMemo(() => library ? hasSearchResults(library, query) : false, [library, query]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    expandedKeysRef.current = expandedKeys;
  }, [expandedKeys]);

  useEffect(() => {
    const element = treeViewportRef.current;
    if (!element) return undefined;
    const updateHeight = () => setTreeHeight(Math.max(0, Math.floor(element.getBoundingClientRect().height)));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [library !== null]);

  useEffect(() => {
    if (saveNotice !== "saved") return undefined;
    const timeout = window.setTimeout(() => setSaveNotice(""), 1600);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);

  useEffect(() => {
    let active = true;
    setError("");
    setSaveNotice("");
    getSettingLibrary(characterId).then((loaded) => {
      if (!active) return;
      libraryRef.current = loaded;
      persistedRef.current = loaded;
      setLibrary(loaded);
      setPersisted(loaded);
      setExpandedKeys(loaded.expandedGroupIds.map((id) => nodeKey("group", id)));
      setSelectedKey("");
      setManagerOpen(false);
    }).catch((cause) => active && setError(cause?.message || "读取设定库失败"));
    return () => { active = false; };
  }, [characterId]);

  function changeLibrary(updater) {
    setError("");
    setSaveNotice("");
    setLibrary((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      libraryRef.current = next;
      return next;
    });
  }

  async function save() {
    if (!libraryRef.current) return false;
    if (savePromiseRef.current) {
      const inFlight = savePromiseRef.current;
      const saved = await inFlight;
      if (savePromiseRef.current === inFlight) savePromiseRef.current = null;
      if (!saved) return false;
      if (JSON.stringify(libraryRef.current) !== JSON.stringify(persistedRef.current)) return save();
      return true;
    }

    const task = (async () => {
      const snapshot = libraryRef.current;
      setSaving(true);
      setError("");
      setSaveNotice("");
      try {
        const saved = await saveSettingLibrary(characterId, {
          ...snapshot,
          listAllExpanded: false,
          expandedGroupIds: expandedKeysRef.current.map(parseNodeKey).filter((item) => item.kind === "group").map((item) => item.id),
        });
        persistedRef.current = saved;
        setPersisted(saved);
        if (libraryRef.current === snapshot) {
          libraryRef.current = saved;
          setLibrary(saved);
          setSaveNotice("saved");
        }
        return true;
      } catch (cause) {
        setError(cause?.message || "保存设定库失败");
        return false;
      } finally {
        setSaving(false);
      }
    })();

    savePromiseRef.current = task;
    try {
      return await task;
    } finally {
      if (savePromiseRef.current === task) savePromiseRef.current = null;
    }
  }

  function discard() {
    libraryRef.current = persistedRef.current;
    setLibrary(persistedRef.current);
    setError("");
    setSaveNotice("");
  }

  function requestCloseInspector() {
    setSelectedKey("");
    treeRef.current?.deselectAll();
  }

  function applyManagerChange(nextLibrary) {
    changeLibrary(nextLibrary);
    const nextExpanded = nextLibrary.expandedGroupIds.map((id) => nodeKey("group", id));
    expandedKeysRef.current = nextExpanded;
    setExpandedKeys(nextExpanded);
    setSelectedKey("");
    treeRef.current?.deselectAll();
  }

  function requestSelection(key, contextMenuAfterSelection = null) {
    const nextKey = String(key || "");
    if (!nextKey) {
      setSelectedKey("");
      if (contextMenuAfterSelection) setContextMenu(contextMenuAfterSelection);
      return;
    }
    if (nextKey === selectedKey) {
      if (contextMenuAfterSelection) setContextMenu(contextMenuAfterSelection);
      return;
    }
    setSelectedKey(nextKey);
    if (contextMenuAfterSelection) setContextMenu(contextMenuAfterSelection);
  }

  useEffect(() => {
    function handleSaveShortcut(event) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLocaleLowerCase() !== "s") return;
      event.preventDefault();
      if (dirty && !saving) void save();
    }

    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [characterId, dirty, expandedKeys, library, saving]);

  useImperativeHandle(ref, () => ({ save, discard }), [library, persisted, expandedKeys, saving]);

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

  function requestAddNode(kind, parentOverride) {
    const parentId = parentOverride ?? parentForNewNode();
    const sourceLibrary = libraryRef.current;
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
    changeLibrary(nextLibrary);
    if (parentId) {
      const parentKey = nodeKey("group", parentId);
      setExpandedKeys((current) => [...new Set([...current, parentKey])]);
      requestAnimationFrame(() => treeRef.current?.open(parentKey));
    }
    setMenuOpen(false);
    setContextMenu(null);
    setSelectedKey(nextKey);
    requestAnimationFrame(() => nameInputRef.current?.select());
  }

  function askDelete(kind, id) {
    const value = kind === "group" ? library.groups.find((group) => group.id === id) : library.entries.find((entry) => entry.id === id);
    if (!value || PINNED_ENTRY_IDS.has(id)) return;
    const name = kind === "group" ? value.name : value.title;
    const isReference = kind === "entry" && value.dynamicMode === "ejs_reference";
    setDeleteTarget({
      kind,
      id,
      title: kind === "group" ? `删除“${name}”？` : isReference ? "删除这条引用条目？" : `删除“${name || "未命名设定"}”？`,
      message: kind === "group"
        ? "文件夹内的设定也会一起删除。"
        : isReference ? `使用它的控制器将无法再通过 getwi 读取“${name || "未命名引用条目"}”。` : "此操作会在保存后生效。",
    });
    setContextMenu(null);
  }

  function askDeleteOpening(message) {
    setDeleteTarget({
      kind: "opening",
      id: selected.value.id,
      messageId: message.id,
      title: `删除“${message.title || "未命名开场白"}”？`,
      message: "这条开场白会从角色设定中移除。",
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "opening") {
      updateEntryById(deleteTarget.id, (entry) => deleteOpening(entry, deleteTarget.messageId));
      setDeleteTarget(null);
      return;
    }
    changeLibrary((current) => {
      if (deleteTarget.kind === "entry") return { ...current, entries: current.entries.filter((entry) => entry.id !== deleteTarget.id) };
      const removed = descendants(current.groups, deleteTarget.id);
      return {
        ...current,
        groups: current.groups.filter((group) => !removed.has(group.id)),
        entries: current.entries.filter((entry) => !removed.has(entry.groupId)),
      };
    });
    setSelectedKey(nodeKey("entry", "fixed-opening-assistant"));
    setDeleteTarget(null);
  }

  function duplicateEntry(id) {
    const source = library.entries.find((entry) => entry.id === id);
    if (!source || PINNED_ENTRY_IDS.has(id)) return;
    const timestamp = new Date().toISOString();
    const names = new Set(library.entries.filter((entry) => entry.groupId === source.groupId).map((entry) => entry.title));
    const title = uniqueName(source.title ? `${source.title} 副本` : "新建设定", names);
    const entry = {
      ...source,
      id: createId("setting"),
      title,
      treeViewOrder: Math.max(0, ...library.entries.filter((item) => item.groupId === source.groupId).map((item) => item.treeViewOrder)) + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    changeLibrary((current) => ({ ...current, entries: [...current.entries, entry] }));
    setSelectedKey(nodeKey("entry", entry.id));
    setContextMenu(null);
  }

  function handleMove({ dragIds, parentId, parentNode, index }) {
    const moved = parseNodeKey(String(dragIds[0] || ""));
    if (!moved.id || PINNED_ENTRY_IDS.has(moved.id)) return;
    const siblings = parentNode?.children || [];
    const siblingIds = siblings.map((node) => node.id);
    const destinationSlot = adjustMoveIndex({ index, dragIds, siblingIds });
    const dragged = new Set(dragIds);
    const postRemovalSiblings = siblings.filter((node) => !dragged.has(node.id));
    const destinationIndex = postRemovalSiblings
      .slice(0, destinationSlot)
      .filter((node) => !node.data.fixed)
      .length;
    const destinationParentId = parentId ? parseNodeKey(parentId).id : "";
    changeLibrary((current) => moveTreeNode(current, moved, destinationParentId, destinationIndex));
  }

  function disableDrop({ parentNode, index }) {
    if (query || (!parentNode.isRoot && parentNode.data.nodeKind !== "group")) return true;
    if (!parentNode.isRoot) return false;
    const firstMovableIndex = (parentNode.children || []).findIndex((node) => !node.data.fixed);
    return firstMovableIndex > 0 && index < firstMovableIndex;
  }

  function handleToggle(id) {
    if (query) return;
    const nextKeys = treeRef.current?.isOpen(id)
      ? [...new Set([...expandedKeysRef.current, id])]
      : expandedKeysRef.current.filter((key) => key !== id);
    const nextGroupIds = nextKeys.map(parseNodeKey).filter((item) => item.kind === "group").map((item) => item.id);
    const applyViewState = (value) => value ? {
      ...value,
      listAllExpanded: false,
      expandedGroupIds: nextGroupIds,
      versions: value.versions.map((version) => version.id === value.activeVersionId
        ? { ...version, listAllExpanded: false, expandedGroupIds: nextGroupIds }
        : version),
    } : value;
    expandedKeysRef.current = nextKeys;
    setExpandedKeys(nextKeys);
    libraryRef.current = applyViewState(libraryRef.current);
    persistedRef.current = applyViewState(persistedRef.current);
    setLibrary((current) => applyViewState(current));
    setPersisted((current) => applyViewState(current));
    void saveSettingLibraryViewState(characterId, nextGroupIds).catch(() => {});
  }

  function openContextMenu(event, node) {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
    if (node.fixed) {
      setContextMenu({
        x: Math.min(event.clientX, window.innerWidth - 176),
        y: Math.min(event.clientY, window.innerHeight - 126),
        kind: "background",
        id: "",
        parentId: "",
      });
      return;
    }
    const nextContextMenu = {
      x: Math.min(event.clientX, window.innerWidth - 176),
      y: Math.min(event.clientY, window.innerHeight - 190),
      kind: node.nodeKind,
      id: node.recordId,
      parentId: node.nodeKind === "group"
        ? node.recordId
        : library.entries.find((entry) => entry.id === node.recordId)?.groupId || "",
    };
    requestSelection(String(node.key), nextContextMenu);
  }

  function openTreeContextMenu(event) {
    event.preventDefault();
    setMenuOpen(false);
    setContextMenu({
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
    requestCloseInspector();
  }

  if (!library) return <div className="setting-library-loading">{error || "正在读取…"}</div>;

  const selectedIcon = selected.kind === "group" ? DshFolderClosedIcon : nodeIcon(selected.value);
  const SelectedIcon = selectedIcon || FileText;

  return (
    <section className="setting-library-layout" aria-label="设定库" onMouseDown={() => setMenuOpen(false)}>
      <div className="setting-library-browser">
        <div className="setting-library-toolbar" onMouseDown={(event) => event.stopPropagation()}>
          <label className="setting-library-search">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设定" aria-label="搜索设定" />
          </label>
          <div className="setting-library-add-wrap">
            <button type="button" className="setting-library-create-button" aria-label="新建" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Plus size={16} />新建</button>
            {menuOpen ? (
              <div className="setting-library-popover" role="menu">
                <button type="button" role="menuitem" onClick={() => requestAddNode("group")}><FolderPlus size={16} />文件夹</button>
                <button type="button" role="menuitem" onClick={() => requestAddNode("entry")}><FilePlus size={16} />设定</button>
                <button type="button" role="menuitem" onClick={() => requestAddNode("reference")}><LinkSimple size={16} />引用条目</button>
              </div>
            ) : null}
          </div>
          <button type="button" className="setting-library-manage-button" aria-expanded={managerOpen} onClick={() => { setMenuOpen(false); setManagerOpen(true); }}><Books size={16} />管理</button>
          <SaveControl dirty={dirty} error={error} notice={saveNotice} saving={saving} onSave={save} />
        </div>

        <div ref={treeViewportRef} className="setting-library-tree" onMouseDown={handleTreeMouseDown}>
          <SettingTreeActionsContext.Provider value={{ openContextMenu, updateEntryById }}>
            {treeHeight > 0 ? (
              <ArboristTree
                key={characterId}
                ref={treeRef}
                data={nodes}
                selection={selectedKey || undefined}
                initialOpenState={initialOpenState}
                openByDefault={false}
                rowHeight={38}
                indent={18}
                width="100%"
                height={treeHeight}
                paddingTop={8}
                paddingBottom={24}
                disableMultiSelection
                disableDrag={(data) => Boolean(query) || data.fixed}
                disableDrop={disableDrop}
                searchTerm={query}
                searchMatch={(node, term) => node.data.searchText.includes(term.trim().toLocaleLowerCase())}
                onMove={handleMove}
                onToggle={handleToggle}
                onSelect={(selectedNodes) => setSelectedKey(selectedNodes[0]?.id || "")}
                onContextMenu={openTreeContextMenu}
                renderCursor={SettingTreeCursor}
                aria-label="设定文件夹树"
              >
                {SettingTreeNode}
              </ArboristTree>
            ) : null}
          </SettingTreeActionsContext.Provider>
          {!searchHasResults ? <p className="setting-library-empty">没有匹配的设定</p> : null}
        </div>
      </div>

      {managerOpen ? (
        <SettingLibraryManager
          characterId={characterId}
          library={library}
          onChange={applyManagerChange}
          onClose={() => setManagerOpen(false)}
          onError={setError}
        />
      ) : selected.value ? (
        <SettingLibraryInspector
          selected={selected}
          library={library}
          nameInputRef={nameInputRef}
          SelectedIcon={SelectedIcon}
          onClose={requestCloseInspector}
          onUpdateGroup={updateGroup}
          onDeleteGroup={() => askDelete("group", selected.value.id)}
          onUpdateEntry={(entry) => updateEntryById(entry.id, entry)}
          onEntriesChange={(entries) => changeLibrary((current) => ({ ...current, entries }))}
          onOpenEntry={(entryId) => setSelectedKey(nodeKey("entry", entryId))}
          onRequestDeleteOpening={askDeleteOpening}
          onPromptPositionsChange={(promptPositions, entries = library.entries) => changeLibrary((current) => ({ ...current, promptPositions, entries }))}
        />
      ) : null}

      {contextMenu ? (
        <div className="setting-library-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onMouseDown={(event) => event.stopPropagation()}>
          {contextMenu.kind === "background" || contextMenu.kind === "group" ? (
            <>
              <button type="button" role="menuitem" onClick={() => requestAddNode("group", contextMenu.parentId)}><FolderPlus size={15} />新建文件夹</button>
              <button type="button" role="menuitem" onClick={() => requestAddNode("entry", contextMenu.parentId)}><FilePlus size={15} />新建设定</button>
              <button type="button" role="menuitem" onClick={() => requestAddNode("reference", contextMenu.parentId)}><LinkSimple size={15} />新建引用条目</button>
            </>
          ) : null}
          {contextMenu.kind === "entry" ? <button type="button" role="menuitem" onClick={() => duplicateEntry(contextMenu.id)}><Copy size={15} />复制</button> : null}
          {contextMenu.kind !== "background" ? <button type="button" role="menuitem" onClick={() => { setContextMenu(null); requestAnimationFrame(() => nameInputRef.current?.select()); }}><PencilSimple size={15} />重命名</button> : null}
          {contextMenu.kind !== "background" ? <button type="button" role="menuitem" className="is-destructive" onClick={() => askDelete(contextMenu.kind, contextMenu.id)}><Trash size={15} />删除</button> : null}
        </div>
      ) : null}
      <ConfirmationDialog target={deleteTarget} confirmLabel="删除" tone="destructive" onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </section>
  );
});
