import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CaretRight,
  Code,
  Copy,
  FileText,
  GitBranch,
  LinkSimple,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  SlidersHorizontal,
  Trash,
  X,
} from "../../../ui/icons/interfaceIcons.jsx";
import { Avatar } from "../../../ui/ui/Avatar.jsx";
import { conversationPreviewText } from "../../../ui/messages/conversationPreviewText.js";
import { UnsavedChangesDialog } from "../../../ui/ui/UnsavedChangesDialog.jsx";
import { FailureAlert } from "../../../ui/ui/FailureAlert.jsx";
import { DshFolderClosedIcon, DshFolderOpenIcon, DshTriangleRightIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { SETTING_LIBRARY_CREATE_ICONS } from "../../../ui/icons/settingLibraryCreateIcons.jsx";
import { PINNED_ENTRY_IDS, canTransferSettingNode, copySettingNode, moveTreeNode, createEntryDraft, createGroupDraft, createId, uniqueName } from "../model/settingLibraryEditing.js";
import { descendants, findSelected, nodeKey, parseNodeKey } from "../model/settingLibraryTree.js";
import { DynamicSettingsNameDialog } from "./DynamicSettingsDialogs.jsx";
import { ConfirmationDialog, SaveControl } from "./SettingLibraryControls.jsx";
import { SettingEntryGlyph, SettingLibraryEntryEditor } from "./SettingLibraryEntryEditor.jsx";
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { EditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { MobileEditorActions } from '../../../ui/ui/MobileEditorActions.jsx';
import { useTouchReorder } from '../../../ui/tree/useTouchReorder.js';
import { BranchSettingsSplitView } from "./BranchSettingsSplitView.jsx";
import { DEFAULT_INSPECTOR_WIDTH } from "../../../ui/hooks/editorSidebarSizing.js";

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function conversationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function versionName(item) {
  const identity = (item.summary || item.title || "对话设定").replace(/\s+/g, " ").trim().slice(0, 18) || "对话设定";
  const date = new Date(item.updatedAt);
  const suffix = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${identity}${suffix ? ` · ${suffix}` : ""}`.slice(0, 60);
}

function isEditableEntry(entry) {
  return entry?.kind === "normal";
}

function treeChildren(library, parentId) {
  return [
    ...library.groups.filter((group) => group.parentId === parentId).map((value) => ({ kind: "group", value })),
    ...library.entries.filter((entry) => entry.groupId === parentId).map((value) => ({ kind: "entry", value })),
  ].sort((left, right) => left.value.treeViewOrder - right.value.treeViewOrder || left.value.id.localeCompare(right.value.id));
}

function matchesNode(node, query) {
  if (!query) return true;
  const source = node.kind === "group"
    ? node.value.name
    : `${node.value.title}\n${node.value.content}`;
  return source.toLocaleLowerCase().includes(query);
}

function visibleTreeRows(library, expandedIds, query) {
  const rows = [];
  const walk = (parentId, level) => {
    for (const node of treeChildren(library, parentId)) {
      if (query) {
        const childRows = [];
        const collect = (childParentId, childLevel) => {
          for (const child of treeChildren(library, childParentId)) {
            if (child.kind === "group") {
              const before = childRows.length;
              collect(child.value.id, childLevel + 1);
              if (matchesNode(child, query) || childRows.length > before) childRows.splice(before, 0, { ...child, level: childLevel });
            } else if (matchesNode(child, query)) childRows.push({ ...child, level: childLevel });
          }
        };
        if (node.kind === "group") {
          collect(node.value.id, level + 1);
          if (matchesNode(node, query) || childRows.length) rows.push({ ...node, level }, ...childRows);
        } else if (matchesNode(node, query)) rows.push({ ...node, level });
        continue;
      }
      rows.push({ ...node, level });
      if (node.kind === "group" && expandedIds.has(node.value.id)) walk(node.value.id, level + 1);
    }
  };
  walk("", 0);
  return rows;
}

function EntryIcon({ entry }) {
  if (entry.contentMode === "ejs") return <Code size={17} aria-hidden="true" />;
  if (entry.dynamicMode === "ejs_reference") return <LinkSimple size={17} aria-hidden="true" />;
  if (entry.kind !== "normal") return <FileText size={17} aria-hidden="true" />;
  return <SettingEntryGlyph iconId={entry.iconId} size={17} aria-hidden="true" />;
}

export const DynamicSettingsPanel = forwardRef(function DynamicSettingsPanel({ characterId, settingLibraries, onDirtyChange }, ref) {
  const { compact } = useEditorPresentation();
  const [editing, setEditing] = useState(false);
  const [clipboard, setClipboard] = useState(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [library, setLibrary] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [query, setQuery] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [nameDialog, setNameDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [pendingBack, setPendingBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
  const branchNumbersRef = useRef(new Map());
  const libraryRef = useRef(null);
  const persistedRef = useRef(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const selectedSessionIdRef = useRef("");
  const selectedItem = items.find((item) => item.sessionId === selectedSessionId) || null;
  const selected = useMemo(() => findSelected(library, selectedKey), [library, selectedKey]);
  const dirty = useMemo(() => Boolean(library && persisted && !sameValue(library, persisted)), [library, persisted]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const rows = useMemo(
    () => library ? visibleTreeRows(library, expandedIds, normalizedQuery) : [],
    [library, expandedIds, normalizedQuery],
  );
  const touch = useTouchReorder({ enabled: compact && Boolean(library) && !normalizedQuery && !clipboard,
    onSelect: key => { setSelectedKey(key); setEditing(false); }, onMove: ({ dragId, parentId, destinationIndex }) => {
      const moved = parseNodeKey(dragId);
      if (moved.kind === 'entry' && !isEditableEntry(libraryRef.current?.entries.find(entry => entry.id === moved.id))) return;
      changeLibrary(current => moveTreeNode(current, moved, parentId, destinationIndex));
    } });
  const filteredItems = useMemo(() => items.filter((item) => {
    if (!normalizedQuery) return true;
    return `${item.characterName}\n${item.title}\n${item.summary}`.toLocaleLowerCase().includes(normalizedQuery);
  }), [items, normalizedQuery]);

  function updateItems(loaded) {
    for (const item of loaded) {
      if (!branchNumbersRef.current.has(item.sessionId)) {
        branchNumbersRef.current.set(item.sessionId, branchNumbersRef.current.size + 1);
      }
    }
    setItems(loaded);
  }

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    selectedSessionIdRef.current = "";
    libraryRef.current = null;
    persistedRef.current = null;
    setSelectedSessionId("");
    setLibrary(null);
    setPersisted(null);
    setItems([]);
    branchNumbersRef.current = new Map();
    void settingLibraries.readConversations(characterId).then((loaded) => {
      if (!active) return;
      updateItems(loaded);
      setLoading(false);
    }).catch((cause) => {
      if (!active) return;
      setError(cause ?? "读取分支设定失败");
      setLoading(false);
    });
    return () => { active = false; };
  }, [characterId, settingLibraries]);

  useEffect(() => {
    return settingLibraries.subscribe((kind, id, snapshot) => {
      if (kind !== "conversations" || id !== characterId
        || dirtyRef.current || savingRef.current) return;
      if (snapshot.status === "error") {
        setLoading(false);
        setError(snapshot.error || "读取分支设定失败");
        return;
      }
      if (snapshot.status !== "ready") return;
      const loaded = snapshot.value;
      setError(null);
      setLoading(false);
      updateItems(loaded);
      const sessionId = selectedSessionIdRef.current;
      if (!sessionId) return;
      const next = loaded.find((item) => item.sessionId === sessionId) || null;
      if (!next) {
        selectedSessionIdRef.current = "";
        setSelectedSessionId("");
        setLibrary(null);
        setPersisted(null);
        libraryRef.current = null;
        persistedRef.current = null;
        return;
      }
      setLibrary(next.library);
      setPersisted(next.library);
      libraryRef.current = next.library;
      persistedRef.current = next.library;
    });
  }, [characterId, settingLibraries]);

  useEffect(() => {
    if (notice !== "saved") return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 1600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function openConversation(item) {
    setEditing(false);
    setClipboard(null);
    setManagerOpen(false);
    setSelectedSessionId(item.sessionId);
    setLibrary(item.library);
    setPersisted(item.library);
    libraryRef.current = item.library;
    persistedRef.current = item.library;
    setSelectedKey("");
    setExpandedIds(new Set(item.library.expandedGroupIds || []));
    setQuery("");
    setError(null);
    setNotice("");
  }

  function changeLibrary(updater) {
    setError(null);
    setNotice("");
    setLibrary((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      libraryRef.current = next;
      return next;
    });
  }

  async function refreshItems(preferredSessionId = "") {
    const loaded = await settingLibraries.readConversations(characterId);
    updateItems(loaded);
    const next = loaded.find((item) => item.sessionId === preferredSessionId) || null;
    if (!next) {
      setSelectedSessionId("");
      setLibrary(null);
      setPersisted(null);
      libraryRef.current = null;
      persistedRef.current = null;
      return null;
    }
    setLibrary(next.library);
    setPersisted(next.library);
    libraryRef.current = next.library;
    persistedRef.current = next.library;
    return next;
  }

  async function save() {
    if (!selectedSessionId || !libraryRef.current || saving) return false;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setNotice("");
    try {
      await settingLibraries.saveConversation(characterId, selectedSessionId, libraryRef.current);
      await refreshItems(selectedSessionId);
      setNotice("saved");
      return true;
    } catch (cause) {
      setError(cause ?? "保存分支设定失败");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function discard() {
    libraryRef.current = persistedRef.current;
    setLibrary(persistedRef.current);
    setError(null);
    setNotice("");
  }

  useImperativeHandle(ref, () => ({ save, discard }), [selectedSessionId, saving]);

  function closeConversation() {
    if (dirty) {
      setPendingBack(true);
      return;
    }
    setSelectedSessionId("");
    setLibrary(null);
    setPersisted(null);
    setSelectedKey("");
    setQuery("");
  }

  function targetGroupId() {
    if (selected.kind === "group") return selected.value?.id || "";
    if (selected.kind === "entry") return selected.value?.groupId || "";
    return "";
  }

  function closeEditor() { if (compact) setEditing(false); else setSelectedKey(''); }
  function startTransfer(mode) {
    if (!selected.value || PINNED_ENTRY_IDS.has(selected.value.id)) return;
    setClipboard({ mode, target: { kind: selected.kind, id: selected.value.id } });
    setSelectedKey('');
    setEditing(false);
  }
  function pasteSelection() {
    const parentId = targetGroupId();
    if (!clipboard || !canTransferSettingNode(libraryRef.current, clipboard.target, parentId)) {
      setError('不能粘贴到此文件夹，请选择其他位置。'); return;
    }
    if (clipboard.mode === 'cut') {
      changeLibrary(current => moveTreeNode(current, clipboard.target, parentId, Number.MAX_SAFE_INTEGER));
      setSelectedKey(nodeKey(clipboard.target.kind, clipboard.target.id));
    } else {
      const copied = copySettingNode(libraryRef.current, clipboard.target, parentId);
      changeLibrary(copied.library);
      setSelectedKey(copied.key);
    }
    if (parentId) setExpandedIds(current => new Set([...current, parentId]));
    setClipboard(null);
  }
  function requestVersion() {
    setManagerOpen(false);
    setNameDialog({ type: 'version', title: '保存为设定版本', label: '版本名称', value: versionName(selectedItem), confirmLabel: '保存' });
  }
  function requestReset() {
    setManagerOpen(false);
    setResetTarget({ title: '清空这段对话的分支设定？', message: '将删除这段对话里由 AI 和你产生的全部设定改动，并回归母设定。母设定不会被修改。' });
  }

  function nextOrder(parentId) {
    return 1 + Math.max(0,
      ...library.groups.filter((group) => group.parentId === parentId).map((group) => group.treeViewOrder),
      ...library.entries.filter((entry) => entry.groupId === parentId).map((entry) => entry.treeViewOrder),
    );
  }

  function createEntry(kind = "standard", parentOverride) {
    const parentId = parentOverride ?? targetGroupId();
    const entry = createEntryDraft(parentId, nextOrder(parentId), library.entries, kind);
    changeLibrary((current) => ({ ...current, entries: [...current.entries, entry] }));
    if (parentId) setExpandedIds((current) => new Set([...current, parentId]));
    setSelectedKey(nodeKey("entry", entry.id));
    setEditing(true);
    setAddMenuOpen(false);
    setContextMenu(null);
  }

  function createGroup(name) {
    const parentId = nameDialog?.parentId || "";
    const siblingNames = new Set(library.groups.filter((group) => group.parentId === parentId).map((group) => group.name));
    const group = { ...createGroupDraft(parentId, nextOrder(parentId), siblingNames), name };
    changeLibrary((current) => ({ ...current, groups: [...current.groups, group] }));
    if (parentId) setExpandedIds((current) => new Set([...current, parentId]));
    setSelectedKey(nodeKey("group", group.id));
    setNameDialog(null);
    setContextMenu(null);
  }

  function duplicateEntry(id) {
    const source = library.entries.find((entry) => entry.id === id);
    if (!source || PINNED_ENTRY_IDS.has(id)) return;
    const timestamp = new Date().toISOString();
    const names = new Set(library.entries.filter((entry) => entry.groupId === source.groupId).map((entry) => entry.title));
    const copy = {
      ...source,
      id: createId("session-setting"),
      title: uniqueName(source.title ? `${source.title} 副本` : "新建设定", names),
      createdAt: timestamp,
      updatedAt: timestamp,
      treeViewOrder: nextOrder(source.groupId || ""),
    };
    changeLibrary((current) => ({ ...current, entries: [...current.entries, copy] }));
    setSelectedKey(nodeKey("entry", copy.id));
    setContextMenu(null);
  }

  function openContextMenu(event, row = null) {
    event.preventDefault();
    event.stopPropagation();
    if (compact) return;
    setAddMenuOpen(false);
    const kind = row?.kind || "background";
    const id = row?.value?.id || "";
    const parentId = kind === "group" ? id : kind === "entry" ? row.value.groupId || "" : "";
    setContextMenu({
      trigger: event.currentTarget,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 230),
      kind,
      id,
      parentId,
    });
  }

  function requestDeleteSelected() { requestDelete(selected); }

  function requestDelete(target) {
    if (!target.value) return;
    if (target.kind === "entry" && !isEditableEntry(target.value)) return;
    const isGroup = target.kind === "group";
    setDeleteTarget({
      title: isGroup ? `删除文件夹“${target.value.name}”？` : `删除设定“${target.value.title || "未命名设定"}”？`,
      message: isGroup
        ? "文件夹及其中设定会从当前对话移除，母设定不会被修改。"
        : "这条设定会从当前对话移除，母设定不会被删除。",
      kind: target.kind,
      id: target.value.id,
    });
  }

  function confirmDeleteSelected() {
    const target = deleteTarget;
    if (!target) return;
    const current = libraryRef.current;
    const removed = target.kind === 'group' ? descendants(current.groups, target.id) : new Set();
    const next = { ...current, groups: current.groups.filter(group => !removed.has(group.id)),
      entries: current.entries.filter(entry => target.kind !== 'entry' || entry.id !== target.id).filter(entry => !removed.has(entry.groupId)) };
    changeLibrary(next);
    if (!findSelected(next, selectedKey).value) setSelectedKey('');
    setDeleteTarget(null);
  }

  async function resetConversation() {
    if (!selectedSessionId || saving) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await settingLibraries.resetConversation(characterId, selectedSessionId);
      await refreshItems();
    } catch (cause) {
      setError(cause ?? "清空分支设定失败");
    } finally {
      savingRef.current = false;
      setSaving(false);
      setResetTarget(null);
    }
  }

  async function saveVersion(name) {
    if (!selectedSessionId || saving) return;
    const sessionId = selectedSessionId;
    try {
      if (dirty && !(await save())) return;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      await settingLibraries.saveConversationVersion(characterId, sessionId, name);
      setNameDialog(null);
      setNotice("saved");
    } catch (cause) {
      setError(cause ?? "保存设定版本失败");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!selectedItem || !library) {
    return (
      <section className="dynamic-settings-list-page" aria-label="分支设定">
        <header className={`dynamic-settings-list-toolbar${compact ? ' editor-collection-toolbar' : ''}`}>
          <Input data-dsh-control className="editor-collection-search" type="search" icon={<MagnifyingGlass size={16} />}
            value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索对话" aria-label="搜索分支设定对话" />
        </header>
        <div className="dynamic-settings-conversation-list">
          {loading ? <p className="dynamic-settings-status" role="status">正在读取分支设定…</p> : <FailureAlert failure={error} className="dynamic-settings-status is-error" />}
          {loading ? null : !filteredItems.length ? (
            !error && <p className="dynamic-settings-status">{normalizedQuery ? "没有找到相关对话" : "还没有分支设定"}</p>
          ) : (
            <div className="dynamic-settings-conversation-records">
              {filteredItems.map((item) => (
                <button type="button" className="dynamic-settings-conversation-row" key={item.sessionId}
                  aria-label={`分支 ${branchNumbersRef.current.get(item.sessionId)}：${item.title || "未命名聊天"}`}
                  onClick={() => openConversation(item)}>
                  <span className="dynamic-settings-conversation-identity">
                    <Avatar src={item.characterAvatar} name={item.characterName || item.title} className="dynamic-settings-avatar" />
                    <span className="dynamic-settings-conversation-copy">
                      <strong title={item.title}>{item.title || "未命名聊天"}</strong>
                      <span className="dynamic-settings-conversation-meta">
                        <span className="dynamic-settings-branch-label"><GitBranch size={14} aria-hidden="true" />分支 {branchNumbersRef.current.get(item.sessionId)}</span>
                      </span>
                    </span>
                  </span>
                  <span className="dynamic-settings-conversation-summary">{conversationPreviewText(item.summary)}</span>
                  <span className="dynamic-settings-conversation-activity">
                    <time dateTime={item.updatedAt} title={`最近活动：${new Date(item.updatedAt).toLocaleString("zh-CN")}`}>{conversationTime(item.updatedAt)}</time>
                    <CaretRight size={17} aria-hidden="true" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  const canDeleteSelected = Boolean(selected.value) && !PINNED_ENTRY_IDS.has(selected.value.id) && (selected.kind === "group" || (selected.kind === "entry" && isEditableEntry(selected.value)));
  const editableEntry = selected.kind === "entry" && isEditableEntry(selected.value);

  return (
      <section className="dynamic-settings-detail" aria-label={`分支设定：${selectedItem.title}`} onMouseDown={() => setAddMenuOpen(false)}>
      <header className="dynamic-settings-detail-toolbar" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="dynamic-settings-back" aria-label="返回对话列表" onClick={closeConversation}><ArrowLeft size={18} /></button>
        <span className="dynamic-settings-branch-label"><GitBranch size={18} aria-hidden="true" />分支 {branchNumbersRef.current.get(selectedItem.sessionId)}</span>
        <CaretRight className="dynamic-settings-breadcrumb-divider" size={13} aria-hidden="true" />
        <div className="dynamic-settings-toolbar-copy">
          <strong title={selectedItem.title}>{selectedItem.title || "未命名聊天"}</strong>
        </div>
        {!compact && <Button data-dsh-control variant="primary" type="button" className="dynamic-settings-secondary-action" title="保存为设定版本" aria-label="保存为设定版本" disabled={saving} onClick={() => setNameDialog({
          type: "version",
          title: "保存为设定版本",
          label: "版本名称",
          value: versionName(selectedItem),
          confirmLabel: "保存",
        })}><Copy size={15} />另存版本</Button>}
        {!compact && <Button data-dsh-control variant="outline" type="button" className="dynamic-settings-danger-action" title="清空分支设定" aria-label="清空分支设定" disabled={saving} onClick={() => setResetTarget({
          title: "清空这段对话的分支设定？",
          message: "将删除这段对话里由 AI 和你产生的全部设定改动，并回归母设定。母设定不会被修改。",
        })}><Trash size={15} />清空</Button>}
      </header>

      <BranchSettingsSplitView preferredWidth={inspectorWidth} onWidthChange={setInspectorWidth}
        feedback={<SaveControl dirty={dirty} error={error} notice={notice} saving={saving} onSave={save} />}
        inspectorTitle={selected.kind === 'group' ? '编辑文件夹' : selected.value?.title || '编辑分支设定'} onCloseInspector={closeEditor}>
        <section className="dynamic-settings-tree-pane">
          <div className={`dynamic-settings-tree-toolbar${compact ? ' editor-collection-toolbar' : ''}`}>
            <Input data-dsh-control className="editor-collection-search" type="search" icon={<MagnifyingGlass size={16} />}
              value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设定" aria-label="搜索分支设定" />
            {!compact && <div className="setting-library-add-wrap">
              <Button data-dsh-control variant="primary" type="button" className="setting-library-create-button" aria-label="新建" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen((open) => !open)}><Plus size={16} />新建</Button>
              {addMenuOpen ? (
                <div className="setting-library-popover" role="menu">
                  <button type="button" role="menuitem" onClick={() => {
                    setAddMenuOpen(false);
                    setNameDialog({ type: "group", title: "新建文件夹", label: "文件夹名称", value: "新建文件夹", confirmLabel: "创建", parentId: targetGroupId() });
                  }}><SETTING_LIBRARY_CREATE_ICONS.group size={16} />文件夹</button>
                  <button type="button" role="menuitem" onClick={() => createEntry("standard")}><SETTING_LIBRARY_CREATE_ICONS.entry size={16} />设定</button>
                  <button type="button" role="menuitem" onClick={() => createEntry("reference")}><SETTING_LIBRARY_CREATE_ICONS.reference size={16} />EJS引用设定</button>
                </div>
              ) : null}
            </div>}
            {compact && <div className="setting-library-add-wrap">
              <Button data-dsh-control variant="outline" type="button" className="setting-library-manage-button" aria-expanded={managerOpen} onClick={() => setManagerOpen(open => !open)}><SlidersHorizontal size={16} />管理</Button>
              {managerOpen && <div className="setting-library-popover" role="menu">
                <button type="button" role="menuitem" disabled={saving} onClick={requestVersion}><Copy size={16} />另存版本</button>
                <button type="button" role="menuitem" disabled={saving} onClick={requestReset}><Trash size={16} />清空分支设定</button>
              </div>}
            </div>}
            <SaveControl dirty={dirty} error={error} notice={notice} saving={saving} onSave={save} />
          </div>
          <div className="dynamic-settings-tree editor-sidebar-directory" {...touch.handlers} role="tree" aria-label="当前对话有效设定"
            onContextMenu={(event) => openContextMenu(event)}
            onMouseDown={(event) => {
              const tree = event.currentTarget;
              if (event.button !== 0 || event.target !== tree) return;
              const rect = tree.getBoundingClientRect();
              const scrollbarWidth = Math.max(16, tree.offsetWidth - tree.clientWidth + 4);
              if (event.clientX >= rect.right - scrollbarWidth && event.clientX <= rect.right + 2) return;
              setSelectedKey("");
            }}>
            {!rows.length ? <p className="dynamic-settings-status">没有匹配的设定</p> : rows.map((row) => {
              const key = nodeKey(row.kind, row.value.id);
              const expanded = row.kind === "group" && (normalizedQuery || expandedIds.has(row.value.id));
              return (
                <button
                  type="button"
                  role="treeitem"
                  aria-selected={selectedKey === key}
                  aria-expanded={row.kind === "group" ? Boolean(expanded) : undefined}
                  className={`dynamic-settings-tree-row${row.kind === "group" ? " is-folder" : ""}${touch.preview?.dragId === key ? ' is-dragging' : ''}`}
                  data-reorder-id={key} data-reorder-parent={row.kind === 'group' ? row.value.parentId : row.value.groupId}
                  data-reorder-fixed={String(PINNED_ENTRY_IDS.has(row.value.id) || (row.kind === 'entry' && !isEditableEntry(row.value)))}
                  data-reorder-target={touch.preview?.targetId === key ? (touch.preview.after ? 'after' : 'before') : undefined}
                  style={{ paddingLeft: `${12 + row.level * 18}px` }}
                  key={key}
                  onContextMenu={(event) => openContextMenu(event, row)}
                  onDoubleClick={() => {
                    if (row.kind === 'entry' && !isEditableEntry(row.value)) return;
                    setSelectedKey(key);
                    setEditing(true);
                  }}
                  onClick={() => {
                    setSelectedKey(key);
                    setEditing(false);
                    if (row.kind === "group" && !normalizedQuery) {
                      setExpandedIds((current) => {
                        const next = new Set(current);
                        if (next.has(row.value.id)) next.delete(row.value.id); else next.add(row.value.id);
                        return next;
                      });
                    }
                  }}
                >
                  <span className="dynamic-settings-tree-icon" aria-hidden="true">
                    {row.kind === "group"
                      ? <>
                          <span className="dynamic-settings-tree-folder">{expanded ? <DshFolderOpenIcon /> : <DshFolderClosedIcon />}</span>
                          <DshTriangleRightIcon className={`dynamic-settings-tree-arrow${expanded ? " is-expanded" : ""}`} />
                        </>
                      : <EntryIcon entry={row.value} />}
                  </span>
                  <span title={row.kind === "group" ? row.value.name : row.value.title}>{row.kind === "group" ? row.value.name : row.value.title || "未命名设定"}</span>
                </button>
              );
            })}
          </div>
          {compact && <MobileEditorActions label="分支设定操作" selectionId={selectedKey}
            canEdit={Boolean(selected.value)} canModify={canDeleteSelected} clipboard={clipboard}
            canPaste={Boolean(clipboard && canTransferSettingNode(library, clipboard.target, targetGroupId()))}
            onEdit={() => setEditing(true)} onMove={() => startTransfer('cut')} onPaste={pasteSelection}
            onCancel={() => setClipboard(null)} onDelete={requestDeleteSelected}
            createItems={[
              { label: '文件夹', Icon: SETTING_LIBRARY_CREATE_ICONS.group, run: () => setNameDialog({ type: 'group', title: '新建文件夹', label: '文件夹名称', value: '新建文件夹', confirmLabel: '创建', parentId: targetGroupId() }) },
              { label: '设定', Icon: SETTING_LIBRARY_CREATE_ICONS.entry, run: () => createEntry('standard') },
              { label: 'EJS引用设定', Icon: SETTING_LIBRARY_CREATE_ICONS.reference, run: () => createEntry('reference') },
            ]} moreItems={canDeleteSelected ? [
              { label: '复制', Icon: Copy, run: () => startTransfer('copy') },
              { label: '重命名', Icon: PencilSimple, run: () => setEditing(true) },
            ] : []} />}
          {contextMenu ? <EditorContextMenu menu={contextMenu} label="分支设定操作" onClose={() => setContextMenu(null)} actions={[
            ...(['background', 'group'].includes(contextMenu.kind) ? [
              { label: '新建文件夹', icon: SETTING_LIBRARY_CREATE_ICONS.group, run: () => setNameDialog({ type: 'group', title: '新建文件夹', label: '文件夹名称', value: '新建文件夹', confirmLabel: '创建', parentId: contextMenu.parentId }) },
              { label: '新建设定', icon: SETTING_LIBRARY_CREATE_ICONS.entry, run: () => createEntry('standard', contextMenu.parentId) },
              { label: '新建 EJS引用设定', icon: SETTING_LIBRARY_CREATE_ICONS.reference, run: () => createEntry('reference', contextMenu.parentId) },
            ] : []),
            ...(contextMenu.kind === 'entry' ? [{ label: '复制', icon: Copy, run: () => duplicateEntry(contextMenu.id) }] : []),
            ...(contextMenu.kind !== 'background' ? [
              { label: '重命名', icon: PencilSimple, run: () => { setSelectedKey(nodeKey(contextMenu.kind, contextMenu.id)); setEditing(true); } },
              { label: '删除', icon: Trash, danger: true, run: () => requestDelete(findSelected(library, nodeKey(contextMenu.kind, contextMenu.id))) },
            ] : []),
          ].map(action => ({ ...action, disabled: saving }))} /> : null}
        </section>

        {selected.value && (!compact || editing) ? <aside className="dynamic-settings-inspector" aria-label="分支设定详情">
            <>
              <header>
                <span aria-hidden="true">{selected.kind === "group" ? <DshFolderClosedIcon /> : <EntryIcon entry={selected.value} />}</span>
                <strong>{selected.kind === "group" ? selected.value.name : selected.value.title || "未命名设定"}</strong>
                <button type="button" aria-label="关闭详情" onClick={closeEditor}><X size={17} /></button>
              </header>
              <div className="dynamic-settings-inspector-body">
                {selected.kind === "group" ? (
                  <label className="dynamic-settings-field">
                    <span>文件夹名称</span>
                    <input value={selected.value.name} onChange={(event) => changeLibrary((current) => ({
                      ...current,
                      groups: current.groups.map((group) => group.id === selected.value.id ? { ...group, name: event.target.value, updatedAt: new Date().toISOString() } : group),
                    }))} />
                  </label>
                ) : editableEntry ? (
                  <SettingLibraryEntryEditor
                    key={selected.value.id}
                    entry={selected.value}
                    entries={library.entries}
                    promptPositions={library.promptPositions}
                    onChange={(patch) => changeLibrary((current) => ({
                      ...current,
                      entries: current.entries.map((entry) => entry.id === selected.value.id
                        ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry),
                    }))}
                    onEntriesChange={(entries) => changeLibrary((current) => ({ ...current, entries }))}
                    onOpenEntry={(id) => setSelectedKey(nodeKey("entry", id))}
                  />
                ) : (
                  <div className="dynamic-settings-readonly-content">{selected.value.content || "暂无正文"}</div>
                )}
                {canDeleteSelected ? <Button data-dsh-control variant="outline" type="button" className="setting-library-delete-link" onClick={requestDeleteSelected}><Trash size={15} />{selected.kind === "group" ? "删除文件夹" : "删除设定"}</Button> : null}
              </div>
            </>
        </aside> : null}
      </BranchSettingsSplitView>

      <DynamicSettingsNameDialog dialog={nameDialog} busy={saving} onCancel={() => setNameDialog(null)} onConfirm={(name) => {
        if (nameDialog.type === "group") createGroup(name);
        else void saveVersion(name);
      }} />
      <ConfirmationDialog target={deleteTarget} confirmLabel="删除" tone="destructive" onCancel={() => setDeleteTarget(null)} onConfirm={confirmDeleteSelected} />
      <ConfirmationDialog target={resetTarget} confirmLabel="清空分支设定" tone="destructive" onCancel={() => setResetTarget(null)} onConfirm={resetConversation} />
      <UnsavedChangesDialog
        open={pendingBack}
        title="保存修改？"
        description="返回对话列表前是否保存当前分支设定？"
        saving={saving}
        onCancel={() => setPendingBack(false)}
        onDiscard={() => {
          discard();
          setPendingBack(false);
          setSelectedSessionId("");
          setLibrary(null);
          setPersisted(null);
        }}
        onSave={async () => {
          if (await save()) {
            setPendingBack(false);
            setSelectedSessionId("");
            setLibrary(null);
            setPersisted(null);
          }
        }}
      />
    </section>
  );
});
