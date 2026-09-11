import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Tree as ArboristTree } from "react-arborist";
import { Copy, MagnifyingGlass, PencilSimple, Plus, Scissors, SlidersHorizontal, Trash } from "@phosphor-icons/react";
import { getVariableConfig, saveVariableConfig, saveVariableConfigViewState } from "../api/variableConfigApi.js";
import { ConfirmationDialog, SaveControl } from "../../settingLibraries/index.js";
import {
  convertVariableToObject,
  copyVariableNode,
  createObjectDraft,
  createVariableDraft,
  deleteVariableNode,
  ensureInitializationObject,
  moveVariableNode,
  nodeKey,
  parseNodeKey,
  replaceObjectContentsFromJson,
  selectedVariableNode,
  syncActiveVersion,
  withGeneratedInitialState,
} from "../model/variableConfigEditing.js";
import { hasVariableSearchResults, variableTreeNodes } from "../model/variableConfigTree.js";
import { VariableConfigInspector } from "./VariableConfigInspector.jsx";
import { VariableConfigManager } from "./VariableConfigManager.jsx";
import { VariableEntryIcon, VariableGroupIcon, VariableTreeActionsContext, VariableTreeCursor, VariableTreeNode } from "./VariableConfigTree.jsx";

function isTextInput(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

function destinationParent(config, selected) {
  if (selected.kind === "object" && selected.value?.id !== "fixed-variable-initialization-object") return selected.value.id;
  if (selected.kind === "variable") return selected.value?.objectId || "";
  return "";
}

export const VariableConfigPanel = forwardRef(function VariableConfigPanel({ characterId, onDirtyChange }, ref) {
  const [config, setConfig] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [expandedIds, setExpandedIds] = useState([]);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [treeHeight, setTreeHeight] = useState(0);
  const configRef = useRef(null);
  const persistedRef = useRef(null);
  const expandedRef = useRef([]);
  const clipboardRef = useRef(null);
  const savePromiseRef = useRef(null);
  const treeRef = useRef(null);
  const treeViewportRef = useRef(null);
  const nameInputRef = useRef(null);

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(persisted), [config, persisted]);
  const selected = useMemo(() => config ? selectedVariableNode(config, selectedKey) : { kind: "", value: null }, [config, selectedKey]);
  const nodes = useMemo(() => config ? variableTreeNodes(config) : [], [config]);
  const searchHasResults = useMemo(() => config ? hasVariableSearchResults(config, query) : false, [config, query]);
  const initialOpenState = useMemo(() => Object.fromEntries(expandedIds.map((id) => [nodeKey("object", id), true])), [expandedIds]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => { expandedRef.current = expandedIds; }, [expandedIds]);
  useEffect(() => {
    const element = treeViewportRef.current;
    if (!element) return undefined;
    const update = () => setTreeHeight(Math.max(0, Math.floor(element.getBoundingClientRect().height)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [config !== null]);
  useEffect(() => {
    if (notice !== "saved") return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 1600);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    let active = true;
    setError("");
    getVariableConfig(characterId).then((loaded) => {
      if (!active) return;
      const prepared = ensureInitializationObject(loaded);
      configRef.current = prepared;
      persistedRef.current = prepared;
      expandedRef.current = prepared.expandedObjectIds;
      setConfig(prepared);
      setPersisted(prepared);
      setExpandedIds(prepared.expandedObjectIds);
      setSelectedKey("");
      setManagerOpen(false);
    }).catch((cause) => active && setError(cause?.message || "读取变量配置失败"));
    return () => { active = false; };
  }, [characterId]);

  function changeConfig(nextOrUpdater, generateState = true) {
    setError("");
    setNotice("");
    setConfig((current) => {
      const candidate = typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater;
      const shaped = ensureInitializationObject(candidate);
      const next = generateState ? withGeneratedInitialState(shaped) : shaped;
      configRef.current = next;
      return next;
    });
  }

  async function save() {
    if (!configRef.current) return false;
    if (savePromiseRef.current) return savePromiseRef.current;
    const task = (async () => {
      setSaving(true);
      setError("");
      try {
        const snapshot = syncActiveVersion({ ...configRef.current, expandedObjectIds: expandedRef.current });
        const saved = ensureInitializationObject(await saveVariableConfig(characterId, snapshot));
        configRef.current = saved;
        persistedRef.current = saved;
        setConfig(saved);
        setPersisted(saved);
        setNotice("saved");
        return true;
      } catch (cause) {
        setError(cause?.message || "保存变量配置失败");
        return false;
      } finally {
        setSaving(false);
      }
    })();
    savePromiseRef.current = task;
    try { return await task; } finally { if (savePromiseRef.current === task) savePromiseRef.current = null; }
  }

  function discard() {
    configRef.current = persistedRef.current;
    setConfig(persistedRef.current);
    const ids = persistedRef.current?.expandedObjectIds || [];
    expandedRef.current = ids;
    setExpandedIds(ids);
    setSelectedKey("");
    treeRef.current?.deselectAll();
    setError("");
    setNotice("");
  }

  useImperativeHandle(ref, () => ({ save, discard }), [characterId, config, persisted]);

  function closeInspector() {
    setSelectedKey("");
    treeRef.current?.deselectAll();
  }

  function parentForNewNode() {
    return destinationParent(configRef.current, selectedVariableNode(configRef.current, selectedKey));
  }

  function addNode(kind, parentOverride) {
    const source = configRef.current;
    if (!source) return;
    const parentId = parentOverride ?? parentForNewNode();
    if (kind === "object") {
      const object = createObjectDraft(source, parentId);
      const expanded = parentId ? [...new Set([...expandedRef.current, parentId])] : expandedRef.current;
      expandedRef.current = expanded;
      setExpandedIds(expanded);
      changeConfig({ ...source, objects: [...source.objects, object], expandedObjectIds: expanded });
      setSelectedKey(nodeKey("object", object.id));
    } else {
      const variable = createVariableDraft(source, parentId);
      const expanded = parentId ? [...new Set([...expandedRef.current, parentId])] : expandedRef.current;
      expandedRef.current = expanded;
      setExpandedIds(expanded);
      changeConfig({ ...source, variables: [...source.variables, variable], expandedObjectIds: expanded });
      setSelectedKey(nodeKey("variable", variable.id));
    }
    setAddOpen(false);
    setContextMenu(null);
    requestAnimationFrame(() => nameInputRef.current?.select());
  }

  function toggleNode(node) {
    changeConfig((current) => node.nodeKind === "object" ? {
      ...current,
      objects: current.objects.map((item) => item.id === node.recordId ? { ...item, enabled: !item.enabled } : item),
    } : {
      ...current,
      variables: current.variables.map((item) => item.id === node.recordId ? { ...item, enabled: !item.enabled } : item),
    });
  }

  function handleMove({ dragIds, parentId, parentNode, index }) {
    const moved = parseNodeKey(String(dragIds[0] || ""));
    const destinationParentId = parentId ? parseNodeKey(parentId).id : "";
    const siblings = (parentNode?.children || []).filter((node) => !node.data.fixed && !dragIds.includes(node.id));
    const before = (parentNode?.children || []).slice(0, index).filter((node) => !node.data.fixed && !dragIds.includes(node.id));
    const destinationIndex = Math.min(siblings.length, before.length);
    changeConfig((current) => moveVariableNode(current, moved, destinationParentId, destinationIndex), false);
  }

  function disableDrop({ parentNode, index }) {
    if (query || (!parentNode.isRoot && (parentNode.data.nodeKind !== "object" || parentNode.data.fixed))) return true;
    if (!parentNode.isRoot) return false;
    const firstMovable = (parentNode.children || []).findIndex((node) => !node.data.fixed);
    return firstMovable > 0 && index < firstMovable;
  }

  function handleToggle(key) {
    if (query) return;
    const id = parseNodeKey(key).id;
    if (!id) return;
    const next = treeRef.current?.isOpen(key)
      ? [...new Set([...expandedRef.current, id])]
      : expandedRef.current.filter((item) => item !== id);
    expandedRef.current = next;
    setExpandedIds(next);
    const applyViewState = (value) => value ? {
      ...value,
      expandedObjectIds: next,
      versions: value.versions.map((version) => version.id === value.activeVersionId
        ? { ...version, expandedObjectIds: next }
        : version),
    } : value;
    configRef.current = applyViewState(configRef.current);
    persistedRef.current = applyViewState(persistedRef.current);
    setConfig((current) => applyViewState(current));
    setPersisted((current) => applyViewState(current));
    void saveVariableConfigViewState(characterId, next).catch(() => {});
  }

  function openContextMenu(event, node) {
    event.preventDefault();
    event.stopPropagation();
    setAddOpen(false);
    if (node.fixed) return;
    setSelectedKey(node.id);
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 180),
      y: Math.min(event.clientY, window.innerHeight - 230),
      kind: node.nodeKind,
      id: node.recordId,
      parentId: node.nodeKind === "object" ? node.recordId : configRef.current.variables.find((item) => item.id === node.recordId)?.objectId || "",
    });
  }

  function openBackgroundMenu(event) {
    event.preventDefault();
    setAddOpen(false);
    setContextMenu({ x: Math.min(event.clientX, window.innerWidth - 180), y: Math.min(event.clientY, window.innerHeight - 170), kind: "background", id: "", parentId: "" });
  }

  function askDelete(target) {
    const item = target.kind === "object" ? configRef.current.objects.find((entry) => entry.id === target.id) : configRef.current.variables.find((entry) => entry.id === target.id);
    if (!item) return;
    const label = target.kind === "object" ? item.name : item.title;
    setDeleteTarget({ ...target, title: `删除“${label || "未命名条目"}”？`, message: target.kind === "object" ? "变量组内的子变量组和变量也会一起删除，保存后生效。" : "变量会在保存后删除。" });
    setContextMenu(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    changeConfig((current) => deleteVariableNode(current, deleteTarget), false);
    closeInspector();
    setDeleteTarget(null);
  }

  function copyOrCut(mode, target) {
    clipboardRef.current = { mode, target };
    setContextMenu(null);
  }

  function paste(parentId) {
    const clipboard = clipboardRef.current;
    if (!clipboard) return;
    if (clipboard.mode === "cut") {
      changeConfig((current) => moveVariableNode(current, clipboard.target, parentId, Number.MAX_SAFE_INTEGER), false);
      clipboardRef.current = null;
    } else {
      const copied = copyVariableNode(configRef.current, clipboard.target, parentId);
      changeConfig(copied.config, false);
      setSelectedKey(copied.key);
    }
    setContextMenu(null);
  }

  function convertToObject(variableId) {
    const converted = convertVariableToObject(configRef.current, variableId);
    changeConfig(converted.config, false);
    setSelectedKey(converted.key);
  }

  function applyManagerChange(next) {
    changeConfig(next, false);
    const ids = next.expandedObjectIds || [];
    expandedRef.current = ids;
    setExpandedIds(ids);
    closeInspector();
  }

  useEffect(() => {
    function handleKeyDown(event) {
      const key = event.key.toLocaleLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && key === "s") {
        event.preventDefault();
        if (dirty && !saving) void save();
        return;
      }
      if (isTextInput(event.target)) return;
      const selectedTarget = parseNodeKey(selectedKey);
      if ((event.metaKey || event.ctrlKey) && key === "c" && selectedTarget.id) { event.preventDefault(); copyOrCut("copy", selectedTarget); }
      else if ((event.metaKey || event.ctrlKey) && key === "x" && selectedTarget.id) { event.preventDefault(); copyOrCut("cut", selectedTarget); }
      else if ((event.metaKey || event.ctrlKey) && key === "v" && clipboardRef.current) { event.preventDefault(); paste(parentForNewNode()); }
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedTarget.id) { event.preventDefault(); askDelete(selectedTarget); }
      else if (event.key === "F2" && selectedTarget.id) { event.preventDefault(); nameInputRef.current?.select(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dirty, saving, selectedKey, config]);

  if (!config) return <div className="variable-loading">{error || "正在读取…"}</div>;

  return (
    <section className="variable-layout" aria-label="变量配置" onMouseDown={() => { setAddOpen(false); setContextMenu(null); }}>
      <div className="variable-browser">
        <div className="variable-toolbar" onMouseDown={(event) => event.stopPropagation()}>
          <label className="variable-search"><MagnifyingGlass size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索变量" aria-label="搜索变量" /></label>
          <div className="variable-add-wrap">
            <button type="button" className="variable-create-button" aria-expanded={addOpen} onClick={() => setAddOpen((open) => !open)}><Plus size={16} />新建</button>
            {addOpen ? <div className="variable-popover" role="menu"><button type="button" role="menuitem" onClick={() => addNode("object")}><VariableGroupIcon size={16} />变量组</button><button type="button" role="menuitem" onClick={() => addNode("variable")}><VariableEntryIcon type="string" size={16} />变量</button></div> : null}
          </div>
          <button type="button" className="variable-manage-button" aria-expanded={managerOpen} onClick={() => { setAddOpen(false); setManagerOpen(true); }}><SlidersHorizontal size={16} />管理</button>
          <SaveControl dirty={dirty} error={error} notice={notice} saving={saving} onSave={save} />
        </div>
        <div ref={treeViewportRef} className="variable-tree" onContextMenu={openBackgroundMenu} onMouseDown={(event) => { if (event.button === 0 && !event.target.closest('[role="treeitem"]')) closeInspector(); }}>
          <VariableTreeActionsContext.Provider value={{ openContextMenu, toggleNode }}>
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
                renderCursor={VariableTreeCursor}
                aria-label="变量配置树"
              >{VariableTreeNode}</ArboristTree>
            ) : null}
          </VariableTreeActionsContext.Provider>
          {!searchHasResults ? <p className="variable-empty">没有匹配的变量</p> : null}
        </div>
      </div>

      {managerOpen ? (
        <VariableConfigManager config={config} onChange={applyManagerChange} onClose={() => setManagerOpen(false)} onError={setError} />
      ) : selected.value ? (
        <VariableConfigInspector
          config={config}
          selected={selected}
          nameInputRef={nameInputRef}
          onClose={closeInspector}
          onChange={(next) => changeConfig(next)}
          onReplaceContents={(objectId, sourceText) => changeConfig((current) => replaceObjectContentsFromJson(current, objectId, sourceText), false)}
          onConvert={convertToObject}
        />
      ) : null}

      {contextMenu ? (
        <div className="variable-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onMouseDown={(event) => event.stopPropagation()}>
          {contextMenu.kind === "background" || contextMenu.kind === "object" ? <><button type="button" role="menuitem" onClick={() => addNode("object", contextMenu.parentId)}><VariableGroupIcon size={15} />新建变量组</button><button type="button" role="menuitem" onClick={() => addNode("variable", contextMenu.parentId)}><VariableEntryIcon type="string" size={15} />新建变量</button>{clipboardRef.current ? <button type="button" role="menuitem" onClick={() => paste(contextMenu.parentId)}><Copy size={15} />粘贴</button> : null}</> : null}
          {contextMenu.kind !== "background" ? <><button type="button" role="menuitem" onClick={() => copyOrCut("copy", { kind: contextMenu.kind, id: contextMenu.id })}><Copy size={15} />复制</button><button type="button" role="menuitem" onClick={() => copyOrCut("cut", { kind: contextMenu.kind, id: contextMenu.id })}><Scissors size={15} />剪切</button><button type="button" role="menuitem" onClick={() => { setContextMenu(null); requestAnimationFrame(() => nameInputRef.current?.select()); }}><PencilSimple size={15} />重命名</button><button type="button" role="menuitem" className="is-destructive" onClick={() => askDelete({ kind: contextMenu.kind, id: contextMenu.id })}><Trash size={15} />删除</button></> : null}
        </div>
      ) : null}
      <ConfirmationDialog target={deleteTarget} confirmLabel="删除" tone="destructive" onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </section>
  );
});
