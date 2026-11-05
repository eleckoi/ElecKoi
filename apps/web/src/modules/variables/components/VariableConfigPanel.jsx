import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Copy, MagnifyingGlass, PencilSimple, Plus, Scissors, SlidersHorizontal, Trash } from "../../../ui/icons/interfaceIcons.jsx";
import { ConfirmationDialog, SaveControl } from "../../settingLibraries/index.js";
import { EditorSidebarLayout } from "../../../ui/ui/EditorSidebarLayout.jsx";
import { EditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { MobileEditorActions } from '../../../ui/ui/MobileEditorActions.jsx';
import { EditorCollectionToolbar, EditorSelectionBar, useEditorMultiSelect } from '../../../ui/ui/EditorCollectionControls.jsx';
import { selectableTreeIds, selectedTreeRootIds, visibleTreeSelectionIds } from '../../../ui/ui/editorCollectionSelection.js';
import {
  canTransferVariableNode,
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
import { VariableConfigTree, VariableEntryIcon, VariableGroupIcon, VariableTreeActionsContext, VARIABLE_INITIALIZATION_OBJECT_ID } from "./VariableConfigTree.jsx";
import { reportFailure, resolveFailure } from "../../../utils/failureText.js";

function isTextInput(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
}

function destinationParent(config, selected) {
  if (selected.kind === "object" && selected.value?.id !== "fixed-variable-initialization-object") return selected.value.id;
  if (selected.kind === "variable") return selected.value?.objectId || "";
  return "";
}

export const VariableConfigPanel = forwardRef(function VariableConfigPanel({ characterId, variables, onDirtyChange }, ref) {
  const { compact } = useEditorPresentation();
  const [config, setConfig] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [clipboard, setClipboard] = useState(null);
  const [expandedIds, setExpandedIds] = useState([]);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const configRef = useRef(null);
  const persistedRef = useRef(null);
  const expandedRef = useRef([]);
  const clipboardRef = useRef(null);
  const savePromiseRef = useRef(null);
  const nameInputRef = useRef(null);

  const dirty = useMemo(() => JSON.stringify(config) !== JSON.stringify(persisted), [config, persisted]);
  const selected = useMemo(() => config ? selectedVariableNode(config, selectedKey) : { kind: "", value: null }, [config, selectedKey]);
  const nodes = useMemo(() => config ? variableTreeNodes(config) : [], [config]);
  const multi = useEditorMultiSelect(selectableTreeIds(nodes), characterId);
  const searchHasResults = useMemo(() => config ? hasVariableSearchResults(config, query) : false, [config, query]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => { expandedRef.current = expandedIds; }, [expandedIds]);
  useEffect(() => {
    if (notice !== "saved") return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 1600);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    let active = true;
    setError("");
    configRef.current = null;
    persistedRef.current = null;
    setConfig(null);
    setPersisted(null);
    setSelectedKey("");
    setManagerOpen(false);
    const adopt = (loaded) => {
      if (!active || savePromiseRef.current || (configRef.current && persistedRef.current
        && JSON.stringify(configRef.current) !== JSON.stringify(persistedRef.current))) return;
      const prepared = ensureInitializationObject(loaded);
      configRef.current = prepared;
      persistedRef.current = prepared;
      expandedRef.current = prepared.expandedObjectIds;
      setConfig(prepared);
      setPersisted(prepared);
      setExpandedIds(prepared.expandedObjectIds);
    };
    const stop = variables.subscribe((kind, id, snapshot) => {
      if (kind === "configuration" && id === characterId && snapshot.status === "ready") adopt(snapshot.value);
    });
    const cached = variables.getSnapshot(characterId);
    if (cached.status === "ready") adopt(cached.value);
    void variables.read(characterId).catch((cause) => {
      if (active) setError(resolveFailure(cause, { fallback: "读取变量配置失败" }).text);
    });
    return () => { active = false; stop(); };
  }, [characterId, variables]);

  function changeConfig(nextOrUpdater, generateState = true) {
    setError("");
    setNotice("");
    setConfig((current) => {
      const candidate = typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater;
      const shaped = ensureInitializationObject(candidate);
      const next = generateState ? withGeneratedInitialState(shaped, current) : shaped;
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
        const saved = ensureInitializationObject(await variables.save(characterId, snapshot));
        configRef.current = saved;
        persistedRef.current = saved;
        setConfig(saved);
        setPersisted(saved);
        setNotice("saved");
        return true;
      } catch (cause) {
        setError(resolveFailure(cause, { fallback: "保存变量配置失败" }).text);
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
    setError("");
    setNotice("");
  }

  useImperativeHandle(ref, () => ({ save, discard }), [characterId, config, persisted]);

  function closeInspector() {
    if (compact) setEditing(false);
    else setSelectedKey('');
  }
  function selectNode(key) { setSelectedKey(key); setEditing(false); }
  function openEditor(key) { if (key !== undefined) setSelectedKey(key); setEditing(true); }
  function clearClipboard() { clipboardRef.current = null; setClipboard(null); }

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
    openEditor();
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

  function handleMove({ dragId, parentId, destinationIndex, expandParentId }) {
    const moved = parseNodeKey(dragId);
    const destinationParentId = parentId ? parseNodeKey(parentId).id : "";
    if (!moved.id) return;
    const expandedParent = expandParentId ? parseNodeKey(expandParentId).id : "";
    const nextExpanded = expandedParent
      ? [...new Set([...expandedRef.current, expandedParent])]
      : expandedRef.current;
    if (expandedParent) {
      expandedRef.current = nextExpanded;
      setExpandedIds(nextExpanded);
    }
    changeConfig((current) => {
      const next = moveVariableNode(current, moved, destinationParentId, destinationIndex);
      if (!expandedParent) return next;
      return {
        ...next,
        expandedObjectIds: nextExpanded,
        versions: next.versions.map((version) => version.id === next.activeVersionId
          ? { ...version, expandedObjectIds: nextExpanded }
          : version),
      };
    }, false);
  }

  function handleExpandedKeysChange(keys) {
    const next = keys.map(parseNodeKey).filter((item) => item.kind === "object").map((item) => item.id);
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
    void variables.saveViewState(characterId, next).catch(error => reportFailure(error, "保存变量面板视图状态"))
  }

  function openContextMenu(event, node) {
    event.preventDefault();
    event.stopPropagation();
    if (compact) return;
    setAddOpen(false);
    if (node.fixed) return;
    setContextMenu({
      trigger: event.currentTarget,
      x: Math.min(event.clientX, window.innerWidth - 180),
      y: Math.min(event.clientY, window.innerHeight - 230),
      kind: node.nodeKind,
      id: node.recordId,
      parentId: node.nodeKind === "object" ? node.recordId : configRef.current.variables.find((item) => item.id === node.recordId)?.objectId || "",
    });
  }

  function openBackgroundMenu(event) {
    event.preventDefault();
    if (!configRef.current) return;
    setAddOpen(false);
    setContextMenu({ trigger: event.currentTarget, x: event.clientX, y: event.clientY, kind: "background", id: "", parentId: "" });
  }

  function askDelete(target) {
    const item = target.kind === "object" ? configRef.current.objects.find((entry) => entry.id === target.id) : configRef.current.variables.find((entry) => entry.id === target.id);
    if (!item || target.id === VARIABLE_INITIALIZATION_OBJECT_ID) return;
    const label = target.kind === "object" ? item.name : item.title;
    setDeleteTarget({ ...target, title: `删除“${label || "未命名条目"}”？`, message: target.kind === "object" ? "变量组内的子变量组和变量也会一起删除，保存后生效。" : "变量会在保存后删除。" });
    setContextMenu(null);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'batch') {
      const targets = deleteTarget.ids.map(parseNodeKey);
      changeConfig(current => targets.reduce((next, target) => deleteVariableNode(next, target), current), false);
      selectNode(''); setDeleteTarget(null); multi.clear(); return;
    }
    const next = deleteVariableNode(configRef.current, deleteTarget);
    changeConfig(next, false);
    if (!selectedVariableNode(next, selectedKey).value) selectNode('');
    setDeleteTarget(null);
  }

  function copyOrCut(mode, target) {
    if (!canTransferVariableNode(configRef.current, target, '')) return;
    clipboardRef.current = { mode, target };
    setClipboard(clipboardRef.current);
    if (compact) selectNode('');
    setContextMenu(null);
  }

  function paste(parentId) {
    const clipboard = clipboardRef.current;
    if (!clipboard) return;
    if (!canTransferVariableNode(configRef.current, clipboard.target, parentId)) {
      setError('不能粘贴到此变量组，请选择其他位置。'); return;
    }
    if (clipboard.mode === "cut") {
      changeConfig((current) => moveVariableNode(current, clipboard.target, parentId, Number.MAX_SAFE_INTEGER), false);
      setSelectedKey(nodeKey(clipboard.target.kind, clipboard.target.id));
    } else {
      const copied = copyVariableNode(configRef.current, clipboard.target, parentId);
      changeConfig(copied.config, false);
      setSelectedKey(copied.key);
    }
    if (parentId) handleExpandedKeysChange([...new Set([...expandedRef.current, parentId])].map(id => nodeKey('object', id)));
    clearClipboard();
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
    selectNode('');
  }

  function copySelected() {
    const targets = selectedTreeRootIds(nodes, multi.selected).map(parseNodeKey);
    changeConfig(current => targets.reduce((next, target) => {
      const item = target.kind === 'object' ? next.objects.find(entry => entry.id === target.id) : next.variables.find(entry => entry.id === target.id);
      return copyVariableNode(next, target, target.kind === 'object' ? item.parentId : item.objectId).config;
    }, current), false);
    multi.clear();
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

  const createItems = [{ label: '变量组', Icon: VariableGroupIcon, run: () => addNode('object') },
    { label: '变量', Icon: VariableEntryIcon, run: () => addNode('variable') }];
  return (
    <EditorSidebarLayout className={`variable-layout${multi.active ? ' is-multiselect' : ''}`} aria-label="变量配置"
      inspectorTitle={selected.value?.id === VARIABLE_INITIALIZATION_OBJECT_ID ? '变量运行配置' : selected.kind === 'object' ? '编辑变量组' : '编辑变量'}
      onCloseInspector={closeInspector}
      feedback={<SaveControl dirty={dirty} error={error} notice={notice} saving={saving} onSave={save} />}
      onMouseDown={() => setAddOpen(false)}
      inspector={!multi.active && selected.value && (!compact || editing) ? (
        <VariableConfigInspector
          config={config}
          selected={selected}
          nameInputRef={nameInputRef}
          onClose={closeInspector}
          onChange={(next) => changeConfig(next)}
          onReplaceContents={(objectId, sourceText) => changeConfig((current) => replaceObjectContentsFromJson(current, objectId, sourceText), false)}
          onConvert={convertToObject}
        />
      ) : null}>
      <div className="variable-browser editor-collection-browser">
        <EditorCollectionToolbar query={query} onQueryChange={setQuery} placeholder="搜索变量" disabled={saving || !config}
          selection={{ ...multi, toggle: () => { multi.toggle(); selectNode(''); setEditing(false); setContextMenu(null); } }}
          createItems={createItems}
          onManage={() => setManagerOpen(true)} save={<SaveControl dirty={dirty} error={error} notice={notice} saving={saving} onSave={save} />} />
        <EditorSelectionBar selection={multi} visibleIds={visibleTreeSelectionIds(nodes, query)} disabled={saving} onCopy={copySelected}
          onDelete={() => setDeleteTarget({ kind: 'batch', ids: selectedTreeRootIds(nodes, multi.selected), title: `删除选中的 ${multi.selected.size} 项？`, message: '所选变量组及其内容会在保存后删除。' })} />
        <div className="variable-tree editor-sidebar-directory" onContextMenu={openBackgroundMenu} onMouseDown={(event) => { if (event.button === 0 && !event.target.closest('[role="treeitem"]')) selectNode(''); }}>
          <VariableTreeActionsContext.Provider value={{ openContextMenu, toggleNode, selection: multi, saving, openEditor: compact && !multi.active ? openEditor : undefined }}>
            <VariableConfigTree
              key={characterId}
              nodes={nodes}
              touchReorder={compact && !clipboard && !multi.active}
              dragEnabled={!clipboard && !multi.active}
              query={query}
              selectedId={multi.active ? '' : selectedKey}
              expandedIds={expandedIds.map((id) => nodeKey("object", id))}
              onSelectedIdChange={key => { if (multi.active) { if (selectableTreeIds(nodes).includes(key)) multi.check(key, !multi.selected.has(key)); } else selectNode(key); }}
              onExpandedIdsChange={handleExpandedKeysChange}
              onMove={handleMove}
            />
          </VariableTreeActionsContext.Provider>
          {!config ? <p className="variable-loading" role={error ? 'alert' : 'status'}>{error || '正在读取…'}</p> : !searchHasResults ? <p className="variable-empty">没有匹配的变量</p> : null}
        </div>
        {compact && config && !multi.active && <MobileEditorActions label="变量操作" selectionId={selectedKey} busy={saving} createItems={createItems}
          canEdit={Boolean(selected.value)} canModify={Boolean(selected.value) && selected.value.id !== VARIABLE_INITIALIZATION_OBJECT_ID}
          clipboard={clipboard} canPaste={Boolean(clipboard && canTransferVariableNode(config, clipboard.target, parentForNewNode()))}
          onEdit={openEditor} onMove={() => copyOrCut('cut', parseNodeKey(selectedKey))}
          onPaste={() => paste(parentForNewNode())} onCancel={clearClipboard} onDelete={() => askDelete(parseNodeKey(selectedKey))}
          moreItems={selected.value && selected.value.id !== VARIABLE_INITIALIZATION_OBJECT_ID ? [
            { label: '复制', Icon: Copy, run: () => copyOrCut('copy', parseNodeKey(selectedKey)) },
            { label: '重命名', Icon: PencilSimple, run: () => { openEditor(); requestAnimationFrame(() => nameInputRef.current?.select()); } },
          ] : []} />}
      </div>

      {managerOpen ? (
        <VariableConfigManager config={config} onChange={applyManagerChange} onClose={() => setManagerOpen(false)} onError={setError} />
      ) : null}

      {contextMenu ? <EditorContextMenu menu={contextMenu} label="变量操作" onClose={() => setContextMenu(null)} actions={[
        ...(['background', 'object'].includes(contextMenu.kind) ? [
          { label: '新建变量组', icon: VariableGroupIcon, run: () => addNode('object', contextMenu.parentId) },
          { label: '新建变量', icon: VariableEntryIcon, run: () => addNode('variable', contextMenu.parentId) },
          ...(clipboardRef.current ? [{ label: '粘贴', icon: Copy, run: () => paste(contextMenu.parentId) }] : []),
        ] : []),
        ...(contextMenu.kind !== 'background' ? [
          { label: '复制', icon: Copy, run: () => copyOrCut('copy', { kind: contextMenu.kind, id: contextMenu.id }) },
          { label: '剪切', icon: Scissors, run: () => copyOrCut('cut', { kind: contextMenu.kind, id: contextMenu.id }) },
          { label: '重命名', icon: PencilSimple, run: () => { openEditor(nodeKey(contextMenu.kind, contextMenu.id)); requestAnimationFrame(() => nameInputRef.current?.select()); } },
          { label: '删除', icon: Trash, danger: true, run: () => askDelete({ kind: contextMenu.kind, id: contextMenu.id }) },
        ] : []),
      ].map(action => ({ ...action, disabled: saving }))} /> : null}
      <ConfirmationDialog target={deleteTarget} confirmLabel="删除" tone="destructive" onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </EditorSidebarLayout>
  );
});
