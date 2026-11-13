import { EditorLibraryWorkspace } from '../../../ui/ui/EditorLibraryWorkspace.jsx';
import { ScriptDocument } from './ScriptDocument.jsx';
import { ScriptWorkspaceList } from './ScriptWorkspaceList.jsx';
import '../../settingLibraries/styles/setting-workspace.css';
import { editorValueEqual } from '../../../ui/utils/editorValueEqual.js';
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { EditorScopeTabs } from '../../../ui/ui/EditorScopeTabs.jsx';
import { ArrowDown, ArrowUp, Copy, FileCode, FolderSimple, NotePencil, Plus, Power, Trash } from '../../../ui/icons/interfaceIcons.jsx';
import { DshTriangleRightIcon } from '../../../ui/icons/dshTreeIcons.jsx';
import { SaveControl } from '../../settingLibraries/index.js';
import { ConfirmationDialog } from '../../../ui/ui/ConfirmationDialog.jsx';
import { EditorSidebarLayout } from '../../../ui/ui/EditorSidebarLayout.jsx';
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { MobileEditorActions } from '../../../ui/ui/MobileEditorActions.jsx';
import { EditorLibraryGroup } from '../../../ui/ui/EditorLibraryGroup.jsx';
import { EditorContextMenu, useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { EditorCollectionSurface, EditorCollectionToolbar, EditorSelectionBar, EditorSelectionCheckbox, useEditorMultiSelect } from '../../../ui/ui/EditorCollectionControls.jsx';
import { EditorLibraryVersionManager } from '../../../ui/ui/EditorLibraryVersionManager.jsx';
import { useEditorLibraryVersions } from '../../../ui/hooks/useEditorLibraryVersions.js';
import { createScriptItem, findScriptItem, itemBufferKey, libraryKey, materializeScriptBuffers, moveScriptItem, removeScriptItem, reorderScriptItem, setScriptLibraryEnabled, updateScriptItem } from '../model/scriptEditing.js';
import { resolveFailure } from '../../../utils/failureText.js';

const noopSubscribe = () => () => {};
const emptyRuntime = { scriptStatuses: {}, error: '' };
const emptySnapshot = () => emptyRuntime;
const noRuntime = () => null;
const same = editorValueEqual;

function Switch({ checked, label, disabled, onChange }) {
  return <label className="script-switch" title={label}>
    <input type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <i aria-hidden="true" />
  </label>;
}

function Tool({ label, Icon, onClick, disabled }) {
  return <button type="button" className="script-tool" title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={18} aria-hidden="true" /></button>;
}

export const ScriptLibrariesPanel = forwardRef(function ScriptLibrariesPanel({ characterId, presetId, presetName = '', manageSaveShortcut = true, scriptLibraries, scriptRuntimeConnection, onDirtyChange }, ref) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const presetEditor = presetId !== undefined;
  const ownerScope = presetEditor ? 'preset' : 'character', ownerId = presetEditor ? presetId : characterId;
  const [activeScope, setActiveScope] = useState(ownerScope), scopePanelId = useId();
  useEffect(() => setActiveScope(ownerScope), [ownerScope, ownerId]);
  const [drafts, setDrafts] = useState({}), [baselines, setBaselines] = useState({}), [buffers, setBuffers] = useState({});
  const [selection, setSelection] = useState(null), [collapsed, setCollapsed] = useState(new Set());
  const [editing, setEditing] = useState(false);
  const [dragged, setDragged] = useState(null), [dropTarget, setDropTarget] = useState(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [deleteTarget, setDeleteTarget] = useState(null);
  const [openingDirectory, setOpeningDirectory] = useState('');
  const [query, setQuery] = useState(''), [managerOpen, setManagerOpen] = useState(false);
  const context = useEditorContextMenu();
  const [inspectorWidth, setInspectorWidth] = useState(560);
  const draftsRef = useRef({}), baselinesRef = useRef({}), buffersRef = useRef({}), pendingRef = useRef({});
  const savingRef = useRef(false), dirtyRef = useRef(false), saveTaskRef = useRef(null), loadContextRef = useRef(null);
  const receivedRef = useRef({}), acceptRef = useRef(null), nameInputRef = useRef(null);
  const versions = useEditorLibraryVersions({ kind: 'scripts', scope: ownerScope, ownerId, service: scriptLibraries.versions,
    editorDirty: () => dirtyRef.current,
    capture: (scope, original) => {
      const library = draftsRef.current[libraryKey(scope, scope === 'global' ? '' : ownerId)];
      if (!library) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, '脚本库尚未载入。', { what: '脚本库' });
      const current = materializeScriptBuffers(library, buffersRef.current);
      return { enabled: current.enabled, trees: current.trees, variables: current.variables, files: original.files };
    },
    apply: (scope, content) => {
      const key = libraryKey(scope, scope === 'global' ? '' : ownerId);
      buffersRef.current = Object.fromEntries(Object.entries(buffersRef.current).filter(([address]) => JSON.parse(address)[0] !== key));
      setBuffers(buffersRef.current); change(key, { enabled: content.enabled, trees: content.trees, variables: content.variables }); setSelection(null);
    },
  });
  const runtime = useSyncExternalStore(scriptRuntimeConnection?.subscribe || noopSubscribe, scriptRuntimeConnection?.getSnapshot || noRuntime);
  const runtimeState = useSyncExternalStore(runtime?.subscribe || noopSubscribe, runtime?.getSnapshot || emptySnapshot);
  const dirty = !same(drafts, baselines) || Object.keys(buffers).length > 0 || versions.dirty;
  const scriptTargets = Object.entries(drafts).flatMap(([key, library]) => library.trees.flatMap(tree =>
    tree.type === 'folder' ? [{ key, item: tree }, ...tree.scripts.map(item => ({ key, item, parentId: tree.id }))] : [{ key, item: tree }])
    .map(target => ({ ...target, selectionId: JSON.stringify([key, target.item.id]) })));
  const multi = useEditorMultiSelect(scriptTargets.map(target => target.selectionId), JSON.stringify([ownerScope, ownerId]));
  const visibleTargets = scriptTargets.filter(target => drafts[target.key]?.scope === activeScope && (!query.trim() || target.item.name.toLowerCase().includes(query.trim().toLowerCase())));
  const dragEnabled = !saving && !multi.active && !query.trim();
  useEffect(() => { if (!dragEnabled) { setDragged(null); setDropTarget(null); } }, [dragEnabled]);

  function dragStart(event, key, id) {
    if (!dragEnabled) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-eleckoi-script-item', JSON.stringify({ key, id }));
    setDragged({ key, id }); setDropTarget(null);
  }
  function dragOver(event, key, target = null, parentId = '') {
    if (!dragEnabled || !dragged || dragged.key !== key || dragged.id === target?.id) { setDropTarget(null); return; }
    const library = draftsRef.current[key], item = findScriptItem(library, dragged.id);
    if (!item) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
    let position = 'after';
    if (target) {
      const bounds = event.currentTarget.getBoundingClientRect(), progress = (event.clientY - bounds.top) / bounds.height;
      position = target.type === 'folder' && item.type === 'script' && progress >= .25 && progress <= .75 ? 'inside' : progress < .5 ? 'before' : 'after';
      if (position === 'inside') parentId = target.id;
    }
    const remaining = parentId ? library.trees.find(tree => tree.id === parentId && tree.type === 'folder')?.scripts : library.trees;
    if (!remaining || (item.type === 'folder' && parentId)) { setDropTarget(null); return; }
    const siblings = remaining.filter(candidate => candidate.id !== dragged.id);
    const index = !target || position === 'inside' ? siblings.length : siblings.findIndex(candidate => candidate.id === target.id) + (position === 'after' ? 1 : 0);
    setDropTarget({ key, parentId, index, targetId: target?.id || '', position });
  }
  function drop(event, key) {
    event.preventDefault(); event.stopPropagation();
    if (dragEnabled && dragged?.key === key && dropTarget?.key === key) {
      try {
        change(key, library => reorderScriptItem(library, dragged.id, dropTarget.parentId, dropTarget.index));
        if (dropTarget.parentId) setCollapsed(current => { const next = new Set(current); next.delete(JSON.stringify([key, dropTarget.parentId])); return next; });
      } catch (cause) { setError(resolveFailure(cause, { fallback: tUi("调整脚本顺序失败") }).text); }
    }
    setDragged(null); setDropTarget(null);
  }
  function dragProps(key, item, parentId = '') {
    return {
      'data-script-id': item.id,
      'data-script-drop': dropTarget?.key === key && dropTarget.targetId === item.id ? dropTarget.position : undefined,
      onDragOver: event => dragOver(event, key, item, parentId), onDrop: event => drop(event, key),
      onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); },
    };
  }
  function nameDragProps(key, item) {
    return { draggable: dragEnabled, onDragStart: event => dragStart(event, key, item.id),
      onDragEnd: () => { setDragged(null); setDropTarget(null); },
      onKeyDown: event => {
        if (!dragEnabled || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); change(key, library => moveScriptItem(library, item.id, undefined, event.key === 'ArrowUp' ? -1 : 1));
      } };
  }
  dirtyRef.current = dirty;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (notice !== 'saved') return undefined;
    const timer = window.setTimeout(() => setNotice(''), 1600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let active = true, generation = 0;
    const ownerScope = presetEditor ? 'preset' : 'character', ownerId = presetEditor ? presetId : characterId;
    draftsRef.current = {}; baselinesRef.current = {}; buffersRef.current = {}; pendingRef.current = {}; receivedRef.current = {};
    dirtyRef.current = false;
    setDrafts({}); setBaselines({}); setBuffers({}); setSelection(null); setError(''); setNotice(''); context.close(); setDeleteTarget(null);
    function accept(library) {
      if (!active) return;
      const key = libraryKey(library.scope, library.ownerId);
      if (library.scope !== 'global' && (library.scope !== ownerScope || library.ownerId !== ownerId)) return;
      if (library.revision < (baselinesRef.current[key]?.revision ?? 0)) return;
      if (savingRef.current) { receivedRef.current[key] = library; return; }
      if (dirtyRef.current) {
        if (baselinesRef.current[key]?.revision !== library.revision) {
          pendingRef.current[key] = library;
          setError(tUi("脚本配置已在其他窗口或 SDK 中修改，请放弃本页修改后载入最新内容。"));
        }
        return;
      }
      draftsRef.current = { ...draftsRef.current, [key]: library };
      baselinesRef.current = { ...baselinesRef.current, [key]: library };
      setDrafts(draftsRef.current); setBaselines(baselinesRef.current);
    }
    acceptRef.current = accept;
    async function loadContext() {
      const currentGeneration = ++generation;
      try {
        if (!ownerId) throw new DesktopError(ELECKOI_FAILURE_CODES.statePrecondition, '脚本编辑需要明确的归属编号。', { what: '选择要编辑的角色或预设' });
        const values = await Promise.all([scriptLibraries.read('global', ''), scriptLibraries.read(ownerScope, ownerId)]);
        if (!active || currentGeneration !== generation) return;
        values.forEach(accept);
      } catch (cause) { if (active && currentGeneration === generation) setError(resolveFailure(cause, { fallback: tUi("读取脚本库失败。") }).text); }
    }
    loadContextRef.current = loadContext;
    const stop = scriptLibraries.subscribe((scope, ownerId, snapshot) => {
      if (scope !== 'global' && (scope !== ownerScope || ownerId !== (presetEditor ? presetId : characterId))) return;
      if (snapshot.status === 'ready') accept(snapshot.value);
      else if (active && snapshot.status === 'error') setError(snapshot.error);
    });
    const stopContext = scriptLibraries.subscribeChanges(() => { void loadContext(); });
    void loadContext();
    return () => { active = false; generation++; stop(); stopContext(); loadContextRef.current = null; };
  }, [characterId, presetId, presetEditor, scriptLibraries]);

  function change(key, update) {
    if (savingRef.current) return;
    const library = draftsRef.current[key];
    if (!library) return;
    const next = typeof update === 'function' ? update(library) : { ...library, ...update };
    draftsRef.current = { ...draftsRef.current, [key]: next };
    dirtyRef.current = true;
    setDrafts(draftsRef.current); setNotice('');
    if (!Object.keys(pendingRef.current).length) setError('');
  }
  function changeBuffer(address, text) {
    if (savingRef.current) return;
    buffersRef.current = { ...buffersRef.current, [address]: text };
    dirtyRef.current = true;
    setBuffers(buffersRef.current); setNotice('');
  }
  const save = useCallback(async () => {
    if (saveTaskRef.current) return saveTaskRef.current;
    const task = (async () => {
      savingRef.current = true; setSaving(true); setNotice('');
      try {
        if (Object.keys(pendingRef.current).length) throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '脚本配置已更新，请放弃本页修改后载入最新内容。', { what: '脚本配置' });
        if (Object.keys(draftsRef.current).length !== 2) throw new DesktopError(ELECKOI_FAILURE_CODES.lifecycleNotReady, '脚本库尚未完整载入。', { what: '脚本库' });
        const versionDrafts = versions.prepare();
        const values = Object.values(draftsRef.current).map(library => materializeScriptBuffers(library, buffersRef.current))
          .filter(library => versionDrafts.some(version => version.scope === library.scope));
        if (!values.length) return true;
        const result = await scriptLibraries.versions.save(values, versionDrafts);
        const saved = result.documents;
        const next = { ...draftsRef.current };
        for (const library of saved) next[libraryKey(library.scope, library.ownerId)] = library;
        draftsRef.current = next; baselinesRef.current = next; buffersRef.current = {}; dirtyRef.current = false;
        setDrafts(next); setBaselines(next); setBuffers({}); setError(''); setNotice('saved');
        versions.acceptSaved(result.versions);
        return true;
      } catch (cause) { setError(resolveFailure(cause, { fallback: tUi("保存脚本库失败。") }).text); return false; }
      finally {
        savingRef.current = false; setSaving(false);
        const received = Object.values(receivedRef.current); receivedRef.current = {};
        received.forEach(library => acceptRef.current?.(library));
      }
    })();
    saveTaskRef.current = task;
    try { return await task; } finally { if (saveTaskRef.current === task) saveTaskRef.current = null; }
  }, [scriptLibraries, versions]);
  const discard = useCallback(() => {
    if (savingRef.current) return;
    const next = { ...baselinesRef.current, ...pendingRef.current };
    draftsRef.current = next; baselinesRef.current = next; buffersRef.current = {}; pendingRef.current = {}; dirtyRef.current = false;
    setDrafts(next); setBaselines(next); setBuffers({}); setError(''); setNotice('');
    versions.discard(); multi.clear();
    void loadContextRef.current?.();
  }, [versions, multi]);
  useImperativeHandle(ref, () => ({ save, discard }), [save, discard]);
  useEffect(() => {
    if (!manageSaveShortcut) return undefined;
    const keydown = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (dirtyRef.current && !savingRef.current) void save(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [save, manageSaveShortcut]);

  const groups = useMemo(() => [{ scope: 'global', ownerId: '', label: tUi("全局脚本") }, presetEditor
    ? { scope: 'preset', ownerId: presetId, label: tUi("预设脚本"), name: presetName }
    : { scope: 'character', ownerId: characterId, label: tUi("角色脚本") }], [characterId, presetId, presetName, presetEditor, tUi]);
  const visibleGroups = groups.filter(group => group.scope === activeScope);
  async function openDirectory(group) {
    if (openingDirectory) return;
    setOpeningDirectory(group.scope);
    try { await scriptLibraries.openDirectory(group.scope, group.ownerId); }
    catch (cause) { setError(resolveFailure(cause, { fallback: tUi("打开脚本目录失败。") }).text); }
    finally { setOpeningDirectory(''); }
  }
  const selectedLibrary = selection ? drafts[selection.key] : null;
  const selectedItem = selectedLibrary && selection.id ? findScriptItem(selectedLibrary, selection.id) : null;
  const selectedLabel = groups.find(group => libraryKey(group.scope, group.ownerId) === selection?.key)?.label || '';
  const selectedExecution = selectedItem ? runtimeState.scriptStatuses?.[JSON.stringify([selectedLibrary.scope, selectedLibrary.ownerId, selectedItem.id])] : null;
  function selectItem(target, open = false) { setSelection(target); if (compact) setEditing(open); }
  function closeEditor() { if (compact) setEditing(false); else setSelection(null); }
  function create(key, type, parentId = '') {
    const item = createScriptItem(type, crypto.randomUUID());
    change(key, library => {
      const next = { ...library, trees: [...library.trees, item] };
      return parentId ? moveScriptItem(next, item.id, parentId) : next;
    });
    if (parentId) setCollapsed(current => { const next = new Set(current); next.delete(JSON.stringify([key, parentId])); return next; });
    setSelection({ key, id: item.id });
    setEditing(true);
  }
  function duplicate(target = selection) {
    try {
      const library = materializeScriptBuffers(draftsRef.current[target.key], buffersRef.current), source = findScriptItem(library, target.id);
      const item = { ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name || '脚本'} 副本` };
      if (item.type === 'folder') item.scripts = item.scripts.map(script => ({ ...script, id: crypto.randomUUID() }));
      change(target.key, value => ({ ...value, trees: [...value.trees, item] }));
      setSelection({ key: target.key, id: item.id });
    } catch (cause) { setError(resolveFailure(cause, { fallback: tUi("复制脚本失败") }).text); }
  }
  function batchTargets() {
    return scriptTargets.filter(target => multi.selected.has(target.selectionId)
      && (!target.parentId || !multi.selected.has(JSON.stringify([target.key, target.parentId]))));
  }
  function deleteItem() {
    const targets = deleteTarget.targets || [deleteTarget];
    for (const target of targets) {
      const item = findScriptItem(draftsRef.current[target.key], target.id);
      const ids = new Set([target.id, ...(item?.type === 'folder' ? item.scripts.map(item => item.id) : [])]);
      change(target.key, library => removeScriptItem(library, target.id));
      buffersRef.current = Object.fromEntries(Object.entries(buffersRef.current).filter(([key]) => {
        const [owner, id] = JSON.parse(key); return owner !== target.key || !ids.has(id);
      }));
      setSelection(current => current?.key === target.key && ids.has(current.id) ? null : current);
    }
    setBuffers(buffersRef.current);
    setDeleteTarget(null); multi.clear();
  }
  function status(library, script, parentEnabled = true) {
    const key = libraryKey(library.scope, library.ownerId), persisted = baselines[key], original = persisted && findScriptItem(persisted, script.id);
    const parent = library.trees.find(tree => tree.type === 'folder' && tree.scripts.some(item => item.id === script.id));
    const previousParent = persisted?.trees.find(tree => tree.type === 'folder' && tree.scripts.some(item => item.id === script.id));
    if (!same(script, original) || library.enabled !== persisted?.enabled || parent?.enabled !== previousParent?.enabled) return tUi("未保存");
    if (!library.enabled || !script.enabled || !parentEnabled) return tUi("已停用");
    const execution = runtimeState.scriptStatuses?.[JSON.stringify([library.scope, library.ownerId, script.id])];
    if (execution?.scope === library.scope && execution.ownerId === library.ownerId && execution.source === script.content) {
      if (runtimeState.status === 'error') return tUi("运行错误");
      if (runtimeState.status === 'starting') return tUi("启动中");
      if (runtimeState.status !== 'ready') return tUi("已启用");
      return { running: tUi("运行中"), starting: tUi("启动中"), error: tUi("运行错误") }[execution.status] || tUi("未启动");
    }
    if (runtime && (runtimeState.status === 'idle' || runtimeState.status === 'closed')) return tUi("已启用");
    return runtime ? tUi("未启动") : tUi("运行环境未就绪");
  }
  const menuItem = context.menu && drafts[context.menu.target.key] && findScriptItem(drafts[context.menu.target.key], context.menu.target.id);
  const itemActions = menuItem ? [
    ...(menuItem.type === 'folder' ? [{ label: tUi("新建脚本"), icon: FileCode, run: () => create(context.menu.target.key, 'script', menuItem.id) }] : []),
    { label: tUi("重命名"), icon: NotePencil, run: () => { setSelection(context.menu.target); setEditing(true); requestAnimationFrame(() => nameInputRef.current?.select()); } },
    { label: tUi("复制"), icon: Copy, run: () => duplicate(context.menu.target) },
    { label: tUi("上移"), icon: ArrowUp, run: () => change(context.menu.target.key, library => moveScriptItem(library, menuItem.id, undefined, -1)) },
    { label: tUi("下移"), icon: ArrowDown, run: () => change(context.menu.target.key, library => moveScriptItem(library, menuItem.id, undefined, 1)) },
    { label: menuItem.enabled ? tUi("停用") : tUi("启用"), icon: Power, run: () => change(context.menu.target.key, library => updateScriptItem(library, menuItem.id, { enabled: !menuItem.enabled })) },
    { label: tUi("删除"), icon: Trash, danger: true, run: () => setDeleteTarget({ ...context.menu.target, name: menuItem.name, folder: menuItem.type === 'folder' }) },
  ] : [];
  const menuActions = context.menu?.target.id ? itemActions : visibleGroups
    .filter(group => !context.menu?.target.key || libraryKey(group.scope, group.ownerId) === context.menu.target.key)
    .flatMap(group => {
      const key = libraryKey(group.scope, group.ownerId), scoped = Boolean(context.menu?.target.key);
      const ownerLabel = group.scope === 'global' ? tUi("全局") : group.scope === 'preset' ? tUi("预设") : tUi("角色");
      return [
        { label: scoped ? tUi("新建脚本") : tUi("新建{value0}", {value0: group.label}), icon: FileCode, disabled: !drafts[key], run: () => create(key, 'script') },
        { label: scoped ? tUi("新建文件夹") : tUi("新建{value0}文件夹", {value0: ownerLabel}), icon: FolderSimple, disabled: !drafts[key], run: () => create(key, 'folder') },
      ];
    });
  function openContext(event, target) {
    event.preventDefault(); event.stopPropagation();
    if (!multi.active) context.open(event, target);
  }
  useEffect(() => { context.close(); }, [saving, multi.active]);
  const mobileCreateItems = visibleGroups.flatMap(group => {
    const key = libraryKey(group.scope, group.ownerId), label = group.scope === 'global' ? tUi("全局") : group.scope === 'preset' ? tUi("预设") : tUi("角色");
    return [{ id: `${group.scope}-script`, label: tUi("{value0}脚本", {value0: label}), Icon: FileCode, disabled: !drafts[key] || !versions.ready, run: () => create(key, 'script') },
      { id: `${group.scope}-folder`, label: tUi("{value0}文件夹", {value0: label}), Icon: FolderSimple, disabled: !drafts[key] || !versions.ready, run: () => create(key, 'folder') }];
  });
  const moveItems = selectedItem?.type === 'script' ? [
    { id: 'root', label: tUi("根目录"), run: () => change(selection.key, library => moveScriptItem(library, selectedItem.id, '')) },
    ...selectedLibrary.trees.filter(tree => tree.type === 'folder').map(folder => ({ id: folder.id, label: folder.name || tUi("未命名文件夹"), Icon: FolderSimple,
      run: () => change(selection.key, library => moveScriptItem(library, selectedItem.id, folder.id)) })),
  ] : [
    { id: 'up', label: tUi("上移"), Icon: ArrowUp, run: () => change(selection.key, library => moveScriptItem(library, selectedItem.id, undefined, -1)) },
    { id: 'down', label: tUi("下移"), Icon: ArrowDown, run: () => change(selection.key, library => moveScriptItem(library, selectedItem.id, undefined, 1)) },
  ];
  const documentEditor = !multi.active && selectedLibrary && selectedItem ? <ScriptDocument key={JSON.stringify([selection.key, versions.current(selectedLibrary.scope)?.activeVersionId, selectedItem.id])}
    library={selectedLibrary} item={selectedItem} nameInputRef={nameInputRef} busy={saving} dirty={dirty}
    dataText={buffers[itemBufferKey(selection.key, selectedItem.id, 'data')]} onDataChange={text => changeBuffer(itemBufferKey(selection.key, selectedItem.id, 'data'), text)}
    status={buffers[itemBufferKey(selection.key, selectedItem.id, 'data')] !== undefined ? tUi('未保存') : status(selectedLibrary, selectedItem, selectedLibrary.trees.find(tree => tree.type === 'folder' && tree.scripts.some(item => item.id === selectedItem.id))?.enabled)}
    execution={selectedExecution?.scope === selectedLibrary.scope && selectedExecution.ownerId === selectedLibrary.ownerId && selectedExecution.source === selectedItem.content ? selectedExecution : null}
    onChange={patch => change(selection.key, library => updateScriptItem(library, selection.id, patch))} onMove={folderId => change(selection.key, library => moveScriptItem(library, selection.id, folderId))}
    onDuplicate={() => duplicate()} onDelete={() => setDeleteTarget({ key: selection.key, id: selectedItem.id, name: selectedItem.name, folder: selectedItem.type === 'folder' })} /> : null;
  function switchScope(next) { setActiveScope(next); setSelection(null); setEditing(false); setDragged(null); setDropTarget(null); context.close(); if (multi.active) multi.toggle(); }
  return <>{!compact ? <EditorLibraryWorkspace label={tUi('脚本')} scope={activeScope} ownerScope={ownerScope} onScopeChange={switchScope} config={versions.current(activeScope)}
    query={query} onQueryChange={setQuery} createItems={visibleGroups.flatMap(group => [{ label: tUi('脚本'), Icon: FileCode, run: () => create(libraryKey(group.scope, group.ownerId), 'script') }, { label: tUi('文件夹'), Icon: FolderSimple, run: () => create(libraryKey(group.scope, group.ownerId), 'folder') }])}
    selection={{ ...multi, toggle: () => { multi.toggle(); setSelection(null); } }} saving={saving} disabled={!versions.ready || Object.keys(drafts).length !== 2}
    save={<SaveControl workspace dirty={dirty} saving={saving} error={error || versions.error} notice={notice} onSave={save} title={tUi('统一保存脚本全部修改')} />}
    onManage={() => setManagerOpen(true)} onVersionChange={id => { try { versions.select(activeScope, id); } catch (cause) { setError(resolveFailure(cause, { fallback: tUi('切换版本失败') }).text); } }} inspector={documentEditor}>
    <EditorSelectionBar selection={multi} visibleIds={visibleTargets.map(target => target.selectionId)} disabled={saving}
      onCopy={() => { batchTargets().forEach(target => duplicate({ key: target.key, id: target.item.id })); multi.clear(); }}
      onDelete={() => setDeleteTarget({ targets: batchTargets().map(target => ({ key: target.key, id: target.item.id })), name: tUi('选中的 {value0} 个项目', { value0: multi.selected.size }), folder: batchTargets().some(target => target.item.type === 'folder') })} />
    {runtimeState.error && <p className="script-panel-error" role="alert">{runtimeState.error}</p>}
    <div className="rs-directory-content" onContextMenu={event => openContext(event, {})} onMouseDown={event => { if (event.button === 0 && !multi.active && !event.target.closest('.script-list-row')) setSelection(null); }}>
      {visibleGroups.map(group => { const key = libraryKey(group.scope, group.ownerId), library = drafts[key]; return library ? <ScriptWorkspaceList key={key} library={library} label={group.label}
        query={query} selection={selection} multi={multi} collapsed={collapsed} busy={saving} onCollapse={address => setCollapsed(current => { const next = new Set(current); next.has(address) ? next.delete(address) : next.add(address); return next; })}
        onSelect={target => multi.active ? multi.check(JSON.stringify([target.key, target.id]), !multi.selected.has(JSON.stringify([target.key, target.id]))) : selectItem(target)}
        onToggle={(key, id, enabled) => change(key, library => updateScriptItem(library, id, { enabled }))} onToggleLibrary={(key, enabled) => change(key, library => setScriptLibraryEnabled(library, enabled))}
        onContextMenu={openContext} dragProps={dragProps} nameDragProps={nameDragProps} rootDragProps={{ onDragOver: event => dragOver(event, key), onDrop: event => drop(event, key) }} /> : null; })}
    </div>
  </EditorLibraryWorkspace> : <EditorSidebarLayout documentLayout className={`script-libraries-panel${multi.active ? ' is-multiselect' : ''}`} inspector={editing ? documentEditor : null} inspectorTitle={selectedItem?.name || selectedLabel}
    onCloseInspector={closeEditor} preferredWidth={inspectorWidth} onWidthChange={setInspectorWidth}
    feedback={<SaveControl dirty={dirty} saving={saving} error={error || versions.error} notice={notice} onSave={save} />}>
    <div className="script-directory editor-collection-browser editor-collection-material editor-collection-continuous">
      <EditorCollectionToolbar heading={tUi('脚本')} leading={<EditorScopeTabs value={activeScope} ownerValue={ownerScope} ownerLabel={presetEditor ? tUi("预设") : tUi("角色")} panelId={scopePanelId} onChange={next => {
        setActiveScope(next); setSelection(null); setEditing(false); setDragged(null); setDropTarget(null); context.close(); if (multi.active) multi.toggle();
      }} />} query={query} onQueryChange={setQuery} placeholder={tUi("搜索脚本")} selection={{ ...multi, toggle: () => { multi.toggle(); setEditing(false); } }} disabled={saving || !versions.ready}
        createItems={visibleGroups.flatMap(group => [
          { id: `${group.scope}-label`, type: 'label', text: group.label },
          { label: tUi("脚本"), Icon: FileCode, run: () => create(libraryKey(group.scope, group.ownerId), 'script') },
          { label: tUi("文件夹"), Icon: FolderSimple, run: () => create(libraryKey(group.scope, group.ownerId), 'folder') },
        ])} onManage={() => setManagerOpen(true)} save={<SaveControl dirty={dirty} saving={saving} error={error || versions.error} notice={notice} onSave={save} />} />
      <EditorSelectionBar selection={multi} visibleIds={visibleTargets.map(target => target.selectionId)} disabled={saving}
        onCopy={() => { batchTargets().forEach(target => duplicate({ key: target.key, id: target.item.id })); multi.clear(); }}
        onDelete={() => setDeleteTarget({ targets: batchTargets().map(target => ({ key: target.key, id: target.item.id })), name: tUi("选中的 {value0} 个项目", {value0: multi.selected.size}), folder: batchTargets().some(target => target.item.type === 'folder') })} />
      {error && <p className="script-panel-error" role="alert">{error}</p>}
      {runtimeState.error && <p className="script-panel-error" role="alert">{runtimeState.error}</p>}
      <div id={scopePanelId} role="tabpanel" aria-label={activeScope === 'global' ? tUi("全局脚本") : tUi("角色脚本")} className="script-groups editor-collection-directory editor-sidebar-directory" onContextMenu={event => openContext(event, {})}
        onMouseDown={event => { if (event.button === 0 && !multi.active && !event.target.closest('.script-list-row')) setSelection(null); }}>

      <EditorCollectionSurface grouped>{visibleGroups.map(group => {
        const key = libraryKey(group.scope, group.ownerId), library = drafts[key];
        const scriptRow = (item, enabled = true, parentId = '') => {
          if (query.trim() && !item.name.toLowerCase().includes(query.trim().toLowerCase())) return null;
          const id = JSON.stringify([key, item.id]);
          return <div className={`script-list-row${parentId ? ' is-nested' : ''}${dragged?.key === key && dragged.id === item.id ? ' is-dragging' : ''}${multi.active ? multi.selected.has(id) ? ' is-selected' : '' : selection?.key === key && selection.id === item.id ? ' is-selected' : ''}`} key={item.id}
            {...dragProps(key, item, parentId)}
            data-enabled={library.enabled && enabled && item.enabled}
            onContextMenu={event => openContext(event, { key, id: item.id })}>
            <EditorSelectionCheckbox selection={multi} id={id} label={item.name || tUi("未命名脚本")} disabled={saving} />
            <button type="button" className="script-list-name" {...nameDragProps(key, item)}
              onDoubleClick={compact && !multi.active && !saving ? () => selectItem({ key, id: item.id }, true) : undefined}
              onClick={() => multi.active ? multi.check(id, !multi.selected.has(id)) : selectItem({ key, id: item.id })}><FileCode size={18} aria-hidden="true" /><span>{item.name || tUi("未命名脚本")}</span></button>
            {!multi.active && <><span className="script-state" title={status(library, item, enabled)}>{status(library, item, enabled)}</span>
              <Switch label={tUi("启用 {value0}", {value0: item.name || tUi("脚本")})} checked={item.enabled} disabled={saving} onChange={enabled => change(key, value => updateScriptItem(value, item.id, { enabled }))} />
              </>}
          </div>;
        };
        return <EditorLibraryGroup className="script-group" key={group.scope} title={group.label} subtitle={group.name}
          onContextMenu={event => openContext(event, { key, id: '' })}
          onDragOver={event => { if (!event.target.closest('[data-script-id]')) dragOver(event, key); }} onDrop={event => drop(event, key)}
          actions={!multi.active && <Switch label={tUi("启用{value0}", {value0: group.label})} checked={library?.enabled || false} disabled={!library || saving} onChange={enabled => change(key, value => setScriptLibraryEnabled(value, enabled))} />}>
          {!library ? error && <p className="editor-library-empty" role="alert">{tUi("读取失败")}</p> : !library.trees.length ? <p className="editor-library-empty">{tUi("暂无脚本")}</p> : library.trees.map(tree => tree.type === 'script' ? scriptRow(tree) : <div key={tree.id} className="script-folder">
            <div className={`script-list-row${dragged?.key === key && dragged.id === tree.id ? ' is-dragging' : ''}${multi.active ? multi.selected.has(JSON.stringify([key, tree.id])) ? ' is-selected' : '' : selection?.key === key && selection.id === tree.id ? ' is-selected' : ''}`} data-enabled={library.enabled && tree.enabled} {...dragProps(key, tree)} onContextMenu={event => openContext(event, { key, id: tree.id })}>
              <EditorSelectionCheckbox selection={multi} id={JSON.stringify([key, tree.id])} label={tree.name || tUi("文件夹")} disabled={saving} />
              <button type="button" className={`script-tool script-folder-toggle${collapsed.has(JSON.stringify([key, tree.id])) ? ' is-collapsed' : ''}`} aria-label={`${collapsed.has(JSON.stringify([key, tree.id])) ? tUi("展开") : tUi("收起")} ${tree.name || tUi("分组")}`} aria-expanded={!collapsed.has(JSON.stringify([key, tree.id]))} onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(JSON.stringify([key, tree.id]))) next.delete(JSON.stringify([key, tree.id])); else next.add(JSON.stringify([key, tree.id])); return next; })}><DshTriangleRightIcon size={12} /></button>
              <button type="button" className="script-list-name" {...nameDragProps(key, tree)}
                onDoubleClick={compact && !multi.active && !saving ? () => selectItem({ key, id: tree.id }, true) : undefined}
                onClick={() => multi.active ? multi.check(JSON.stringify([key, tree.id]), !multi.selected.has(JSON.stringify([key, tree.id]))) : selectItem({ key, id: tree.id })}><FolderSimple size={18} aria-hidden="true" /><span>{tree.name || tUi("未命名分组")}</span></button>
              {!multi.active && <Switch label={tUi("启用分组 {value0}", {value0: tree.name})} checked={tree.enabled} disabled={saving} onChange={enabled => change(key, value => updateScriptItem(value, tree.id, { enabled }))} />}
            </div>{(!collapsed.has(JSON.stringify([key, tree.id])) || multi.active || query.trim()) && <div className="script-folder-contents">{tree.scripts.map(item => scriptRow(item, tree.enabled, tree.id))}</div>}
          </div>)}
        </EditorLibraryGroup>;
      })}</EditorCollectionSurface></div>
      {compact && !multi.active && <MobileEditorActions label={tUi("脚本操作")} selectionId={selection ? JSON.stringify([selection.key, selection.id]) : ''}
        busy={saving} createItems={mobileCreateItems} canEdit={Boolean(selectedItem)} canModify={Boolean(selectedItem)}
        onEdit={() => setEditing(true)} moveItems={moveItems}
        onDelete={() => setDeleteTarget({ key: selection.key, id: selectedItem.id, name: selectedItem.name, folder: selectedItem.type === 'folder' })}
        moreItems={selectedItem ? [
          { label: tUi("复制"), Icon: Copy, run: () => duplicate() },
          { label: tUi("重命名"), Icon: NotePencil, run: () => { setEditing(true); requestAnimationFrame(() => nameInputRef.current?.select()); } },
          { label: selectedItem.enabled ? tUi("停用") : tUi("启用"), Icon: Power, run: () => change(selection.key, library => updateScriptItem(library, selectedItem.id, { enabled: !selectedItem.enabled })) },
        ] : []} />}
    </div>
  </EditorSidebarLayout>}
    {managerOpen && versions.ready && <EditorLibraryVersionManager title={tUi("脚本版本管理")} versions={versions} ownerScope={ownerScope} initialScope={activeScope} ownerLabel={presetEditor ? tUi("预设") : tUi("角色卡")} onClose={() => setManagerOpen(false)} busy={saving}
      extraActions={[{ label: tUi("打开源码目录"), Icon: FolderSimple, disabled: Boolean(openingDirectory), onClick: scope => void openDirectory({ scope, ownerId: scope === 'global' ? '' : ownerId }) }]} />}
    {context.menu && menuActions.length > 0 && <EditorContextMenu menu={context.menu}
      actions={menuActions.map(action => ({ ...action, disabled: action.disabled || saving || !versions.ready }))} label={tUi("脚本操作")} onClose={context.close} />}
    <ConfirmationDialog open={Boolean(deleteTarget)} title={tUi("删除“{value0}”？", {value0: deleteTarget?.name || tUi("脚本")})}
      description={deleteTarget?.folder ? tUi("分组及其中的脚本会在保存后删除。") : tUi("脚本会在保存后删除。")} confirmLabel={tUi("删除")} destructive busy={saving} onCancel={() => setDeleteTarget(null)} onConfirm={deleteItem} />
  </>;
});
