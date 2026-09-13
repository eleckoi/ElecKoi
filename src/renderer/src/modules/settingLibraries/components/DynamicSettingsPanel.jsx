import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CaretRight,
  Code,
  Copy,
  FilePlus,
  FileText,
  FolderPlus,
  LinkSimple,
  MagnifyingGlass,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { Avatar } from "../../../ui/ui/Avatar.jsx";
import { UnsavedChangesDialog } from "../../../ui/ui/UnsavedChangesDialog.jsx";
import { DshFolderClosedIcon, DshFolderOpenIcon, DshTriangleRightIcon } from "../../../ui/icons/dshTreeIcons.jsx";
import { listenRecordsChanged } from "../../../bridge/recordEvents.js";
import {
  getConversationSettingLibraries,
  resetConversationSettingLibrary,
  saveConversationSettingLibrary,
  saveConversationSettingVersion,
} from "../api/settingLibraryApi.js";
import { createEntryDraft, createGroupDraft, createId } from "../model/settingLibraryEditing.js";
import { descendants, findSelected, nodeKey } from "../model/settingLibraryTree.js";
import { DynamicSettingsNameDialog } from "./DynamicSettingsDialogs.jsx";
import { ConfirmationDialog, SaveControl } from "./SettingLibraryControls.jsx";
import { SettingEntryGlyph } from "./SettingLibraryEntryEditor.jsx";

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
  return entry?.kind === "normal" && entry?.triggerMode === "agent_tool";
}

function dynamicEntryDraft(groupId, order, entries) {
  return {
    ...createEntryDraft(groupId, order, entries),
    id: createId("session-setting"),
    title: "新建动态设定",
    triggerMode: "agent_tool",
    agentReadStrategy: "normal",
    enabled: true,
    position: null,
  };
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
  if (entry.dynamicMode === "ejs_controller") return <Code size={17} aria-hidden="true" />;
  if (entry.dynamicMode === "ejs_reference") return <LinkSimple size={17} aria-hidden="true" />;
  if (entry.kind !== "normal") return <FileText size={17} aria-hidden="true" />;
  return <SettingEntryGlyph iconId={entry.iconId} size={17} aria-hidden="true" />;
}

export const DynamicSettingsPanel = forwardRef(function DynamicSettingsPanel({ characterId, onDirtyChange }, ref) {
  const [items, setItems] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [library, setLibrary] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [query, setQuery] = useState("");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [pendingBack, setPendingBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  const filteredItems = useMemo(() => items.filter((item) => {
    if (!normalizedQuery) return true;
    return `${item.characterName}\n${item.title}\n${item.summary}`.toLocaleLowerCase().includes(normalizedQuery);
  }), [items, normalizedQuery]);

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
    setError("");
    getConversationSettingLibraries(characterId)
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
        setSelectedSessionId("");
        setLibrary(null);
        setPersisted(null);
      })
      .catch((cause) => active && setError(cause?.message || "读取动态设定失败"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [characterId]);

  useEffect(() => {
    let active = true;
    return listenRecordsChanged((event) => {
      if (event.module !== "settingLibraries" || dirtyRef.current || savingRef.current) return;
      getConversationSettingLibraries(characterId)
        .then((loaded) => {
          if (!active || dirtyRef.current || savingRef.current) return;
          setItems(loaded);
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
        })
        .catch(() => {});
    });
  }, [characterId]);

  useEffect(() => {
    if (notice !== "saved") return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 1600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function openConversation(item) {
    setSelectedSessionId(item.sessionId);
    setLibrary(item.library);
    setPersisted(item.library);
    libraryRef.current = item.library;
    persistedRef.current = item.library;
    setSelectedKey("");
    setExpandedIds(new Set());
    setQuery("");
    setError("");
    setNotice("");
  }

  function changeLibrary(updater) {
    setError("");
    setNotice("");
    setLibrary((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      libraryRef.current = next;
      return next;
    });
  }

  async function refreshItems(preferredSessionId = "") {
    const loaded = await getConversationSettingLibraries(characterId);
    setItems(loaded);
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
    setError("");
    setNotice("");
    try {
      await saveConversationSettingLibrary(characterId, selectedSessionId, libraryRef.current);
      await refreshItems(selectedSessionId);
      setNotice("saved");
      return true;
    } catch (cause) {
      setError(cause?.message || "保存动态设定失败");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function discard() {
    libraryRef.current = persistedRef.current;
    setLibrary(persistedRef.current);
    setError("");
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

  function nextOrder(parentId) {
    return 1 + Math.max(0,
      ...library.groups.filter((group) => group.parentId === parentId).map((group) => group.treeViewOrder),
      ...library.entries.filter((entry) => entry.groupId === parentId).map((entry) => entry.treeViewOrder),
    );
  }

  function createEntry() {
    const parentId = targetGroupId();
    const entry = dynamicEntryDraft(parentId, nextOrder(parentId), library.entries);
    changeLibrary((current) => ({ ...current, entries: [...current.entries, entry] }));
    if (parentId) setExpandedIds((current) => new Set([...current, parentId]));
    setSelectedKey(nodeKey("entry", entry.id));
    setAddMenuOpen(false);
  }

  function createGroup(name) {
    const parentId = nameDialog?.parentId || "";
    const siblingNames = new Set(library.groups.filter((group) => group.parentId === parentId).map((group) => group.name));
    const group = { ...createGroupDraft(parentId, nextOrder(parentId), siblingNames), name };
    changeLibrary((current) => ({ ...current, groups: [...current.groups, group] }));
    if (parentId) setExpandedIds((current) => new Set([...current, parentId]));
    setSelectedKey(nodeKey("group", group.id));
    setNameDialog(null);
  }

  function requestDeleteSelected() {
    if (!selected.value) return;
    if (selected.kind === "entry" && !isEditableEntry(selected.value)) return;
    const isGroup = selected.kind === "group";
    setDeleteTarget({
      title: isGroup ? `删除文件夹“${selected.value.name}”？` : `删除设定“${selected.value.title || "未命名设定"}”？`,
      message: isGroup
        ? "文件夹及其中设定会从当前对话移除，母设定不会被修改。"
        : "这条设定会从当前对话移除，母设定不会被删除。",
      kind: selected.kind,
      id: selected.value.id,
    });
  }

  function confirmDeleteSelected() {
    const target = deleteTarget;
    if (!target) return;
    changeLibrary((current) => {
      if (target.kind === "entry") return { ...current, entries: current.entries.filter((entry) => entry.id !== target.id) };
      const removed = descendants(current.groups, target.id);
      return {
        ...current,
        groups: current.groups.filter((group) => !removed.has(group.id)),
        entries: current.entries.filter((entry) => !removed.has(entry.groupId)),
      };
    });
    setSelectedKey("");
    setDeleteTarget(null);
  }

  async function resetConversation() {
    if (!selectedSessionId || saving) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await resetConversationSettingLibrary(characterId, selectedSessionId);
      await refreshItems();
    } catch (cause) {
      setError(cause?.message || "清空动态设定失败");
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
      setError("");
      await saveConversationSettingVersion(characterId, sessionId, name);
      setNameDialog(null);
      setNotice("saved");
    } catch (cause) {
      setError(cause?.message || "保存设定版本失败");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading) return <div className="setting-library-loading">正在读取动态设定…</div>;

  if (!selectedItem || !library) {
    return (
      <section className="dynamic-settings-list-page" aria-label="动态设定">
        <header className="dynamic-settings-list-toolbar">
          <label className="setting-library-search">
            <MagnifyingGlass size={15} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索对话" aria-label="搜索动态设定对话" />
          </label>
        </header>
        <div className="dynamic-settings-conversation-list">
          {error ? <p className="dynamic-settings-status is-error" role="alert">{error}</p> : null}
          {!error && !filteredItems.length ? (
            <p className="dynamic-settings-status">{normalizedQuery ? "没有找到相关对话" : "还没有动态设定"}</p>
          ) : filteredItems.map((item) => (
            <button type="button" className="dynamic-settings-conversation-row" key={item.sessionId} onClick={() => openConversation(item)}>
              <Avatar src={item.characterAvatar} name={item.characterName || item.title} className="dynamic-settings-avatar" />
              <span className="dynamic-settings-conversation-copy">
                <strong>{item.characterName || item.title || "未命名角色"}</strong>
                <span>{(item.summary || item.title || "新对话").replace(/\s+/g, " ").trim()}</span>
              </span>
              <time dateTime={item.updatedAt}>{conversationTime(item.updatedAt)}</time>
              <CaretRight size={17} aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    );
  }

  const canDeleteSelected = selected.kind === "group" || (selected.kind === "entry" && isEditableEntry(selected.value));
  const editableEntry = selected.kind === "entry" && isEditableEntry(selected.value);

  return (
    <section className="dynamic-settings-detail" aria-label={`动态设定：${selectedItem.title}`} onMouseDown={() => setAddMenuOpen(false)}>
      <header className="dynamic-settings-detail-toolbar" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="dynamic-settings-back" aria-label="返回对话列表" onClick={closeConversation}><ArrowLeft size={18} /></button>
        <Avatar src={selectedItem.characterAvatar} name={selectedItem.characterName || selectedItem.title} className="dynamic-settings-toolbar-avatar" />
        <div className="dynamic-settings-toolbar-copy">
          <strong>{selectedItem.characterName || selectedItem.title}</strong>
          <span>{(selectedItem.summary || selectedItem.title || "新对话").replace(/\s+/g, " ").trim()}</span>
        </div>
        <button type="button" className="dynamic-settings-secondary-action" title="保存为设定版本" aria-label="保存为设定版本" disabled={saving} onClick={() => setNameDialog({
          type: "version",
          title: "保存为设定版本",
          label: "版本名称",
          value: versionName(selectedItem),
          confirmLabel: "保存",
          maxLength: 60,
        })}><Copy size={15} />另存版本</button>
        <button type="button" className="dynamic-settings-danger-action" title="清空动态设定" aria-label="清空动态设定" disabled={saving} onClick={() => setResetTarget({
          title: "清空这段对话的动态设定？",
          message: "将删除这段对话里由 AI 和你产生的全部设定改动，并回归母设定。母设定不会被修改。",
        })}><Trash size={15} />清空</button>
        <SaveControl dirty={dirty} error={error} notice={notice} saving={saving} onSave={save} />
      </header>

      <div className="dynamic-settings-editor-layout">
        <section className="dynamic-settings-tree-pane">
          <div className="dynamic-settings-tree-toolbar">
            <label className="setting-library-search">
              <MagnifyingGlass size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索设定" aria-label="搜索动态设定" />
            </label>
            <div className="setting-library-add-wrap">
              <button type="button" className="setting-library-create-button" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen((open) => !open)}><Plus size={16} />新建</button>
              {addMenuOpen ? (
                <div className="setting-library-popover" role="menu">
                  <button type="button" role="menuitem" onClick={() => {
                    setAddMenuOpen(false);
                    setNameDialog({ type: "group", title: "新建文件夹", label: "文件夹名称", value: "新建文件夹", confirmLabel: "创建", parentId: targetGroupId(), maxLength: 80 });
                  }}><FolderPlus size={16} />文件夹</button>
                  <button type="button" role="menuitem" onClick={createEntry}><FilePlus size={16} />动态设定</button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="dynamic-settings-tree" role="tree" aria-label="当前对话有效设定">
            {!rows.length ? <p className="dynamic-settings-status">没有匹配的设定</p> : rows.map((row) => {
              const key = nodeKey(row.kind, row.value.id);
              const expanded = row.kind === "group" && (normalizedQuery || expandedIds.has(row.value.id));
              return (
                <button
                  type="button"
                  role="treeitem"
                  aria-selected={selectedKey === key}
                  aria-expanded={row.kind === "group" ? Boolean(expanded) : undefined}
                  className="dynamic-settings-tree-row"
                  style={{ paddingLeft: `${12 + row.level * 18}px` }}
                  key={key}
                  onClick={() => {
                    setSelectedKey(key);
                    if (row.kind === "group" && !normalizedQuery) {
                      setExpandedIds((current) => {
                        const next = new Set(current);
                        if (next.has(row.value.id)) next.delete(row.value.id); else next.add(row.value.id);
                        return next;
                      });
                    }
                  }}
                >
                  <span className="dynamic-settings-tree-chevron">
                    {row.kind === "group" ? <DshTriangleRightIcon className={expanded ? "is-expanded" : ""} /> : null}
                  </span>
                  <span className="dynamic-settings-tree-icon" aria-hidden="true">
                    {row.kind === "group"
                      ? (expanded ? <DshFolderOpenIcon /> : <DshFolderClosedIcon />)
                      : <EntryIcon entry={row.value} />}
                  </span>
                  <span>{row.kind === "group" ? row.value.name : row.value.title || "未命名设定"}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="dynamic-settings-inspector" aria-label="动态设定详情">
          {!selected.value ? (
            <p className="dynamic-settings-status">选择一条设定查看内容</p>
          ) : (
            <>
              <header>
                <span aria-hidden="true">{selected.kind === "group" ? <DshFolderClosedIcon /> : <EntryIcon entry={selected.value} />}</span>
                <strong>{selected.kind === "group" ? "文件夹" : editableEntry ? "编辑动态设定" : selected.value.title}</strong>
                <button type="button" aria-label="关闭详情" onClick={() => setSelectedKey("")}><X size={17} /></button>
              </header>
              <div className="dynamic-settings-inspector-body">
                {selected.kind === "group" ? (
                  <label className="dynamic-settings-field">
                    <span>文件夹名称</span>
                    <input value={selected.value.name} maxLength={80} onChange={(event) => changeLibrary((current) => ({
                      ...current,
                      groups: current.groups.map((group) => group.id === selected.value.id ? { ...group, name: event.target.value, updatedAt: new Date().toISOString() } : group),
                    }))} />
                  </label>
                ) : editableEntry ? (
                  <>
                    <label className="dynamic-settings-field">
                      <span>设定标题</span>
                      <input value={selected.value.title} maxLength={120} onChange={(event) => changeLibrary((current) => ({
                        ...current,
                        entries: current.entries.map((entry) => entry.id === selected.value.id ? { ...entry, title: event.target.value, updatedAt: new Date().toISOString() } : entry),
                      }))} />
                    </label>
                    <label className="dynamic-settings-field is-content">
                      <span>设定正文</span>
                      <textarea value={selected.value.content} placeholder="写入这段对话使用的设定" onChange={(event) => changeLibrary((current) => ({
                        ...current,
                        entries: current.entries.map((entry) => entry.id === selected.value.id ? { ...entry, content: event.target.value, updatedAt: new Date().toISOString() } : entry),
                      }))} />
                    </label>
                  </>
                ) : (
                  <div className="dynamic-settings-readonly-content">{selected.value.content || "暂无正文"}</div>
                )}
                {canDeleteSelected ? <button type="button" className="setting-library-delete-link" onClick={requestDeleteSelected}><Trash size={15} />{selected.kind === "group" ? "删除文件夹" : "删除设定"}</button> : null}
              </div>
            </>
          )}
        </aside>
      </div>

      <DynamicSettingsNameDialog dialog={nameDialog} busy={saving} onCancel={() => setNameDialog(null)} onConfirm={(name) => {
        if (nameDialog.type === "group") createGroup(name);
        else void saveVersion(name);
      }} />
      <ConfirmationDialog target={deleteTarget} confirmLabel="删除" tone="destructive" onCancel={() => setDeleteTarget(null)} onConfirm={confirmDeleteSelected} />
      <ConfirmationDialog target={resetTarget} confirmLabel="清空动态设定" tone="destructive" onCancel={() => setResetTarget(null)} onConfirm={resetConversation} />
      <UnsavedChangesDialog
        open={pendingBack}
        title="保存修改？"
        description="返回对话列表前是否保存当前动态设定？"
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
