import { EditorLibraryWorkspace } from '../../../ui/ui/EditorLibraryWorkspace.jsx';
import { RegexDocument } from './RegexDocument.jsx';
import { RegexWorkspaceList } from './RegexWorkspaceList.jsx';
import '../../settingLibraries/styles/setting-workspace.css';
import { editorValueEqual } from '../../../ui/utils/editorValueEqual.js';
import { localizeUiCopy } from "../../../app/i18n/productCopy.js";
import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { EditorScopeTabs } from '../../../ui/ui/EditorScopeTabs.jsx';
import { Copy, NotePencil, Plus, Power, Trash } from "../../../ui/icons/interfaceIcons.jsx";
import { EditorContextMenu, useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { ConfirmationDialog, SaveControl } from "../../settingLibraries/index.js";
import { EditorSidebarLayout } from "../../../ui/ui/EditorSidebarLayout.jsx";
import { useEditorPresentation } from '../../../ui/ui/EditorPresentationContext.jsx';
import { MobileEditorActions } from '../../../ui/ui/MobileEditorActions.jsx';
import { EditorCollectionSurface, EditorCollectionToolbar, EditorSelectionBar, useEditorMultiSelect } from '../../../ui/ui/EditorCollectionControls.jsx';
import { useEditorLibraryVersions } from '../../../ui/hooks/useEditorLibraryVersions.js';
import { resolveFailure } from '../../../utils/failureText.js';
import {
  REGEX_SCOPES,
  createRegexRule,
  deleteRegexRules,
  duplicateRegexRules,
  findRegexRule,
  moveRegexRule,
  moveRegexRuleToScope,
  updateRegexRule,
  replaceRegexScopeVersion,
  rulesForScope,
  setRegexScopeEnabled,
} from "../model/regexRulesEditing.js";
import { RegexRuleInspector } from "./RegexRuleInspector.jsx";
import { RegexRuleList } from "./RegexRuleList.jsx";
import { RegexRulesManager } from "./RegexRulesManager.jsx";
import '../styles/regex-rules.css';
import '../styles/regex-manager.css';

export const RegexRulesPanel = forwardRef(function RegexRulesPanel({ characterId, presetId, regexRules, onDirtyChange, manageSaveShortcut = true }, ref) {
  const tUi = useProductTranslation();
  const { compact } = useEditorPresentation();
  const context = useEditorContextMenu();
  const ownerScope = presetId === undefined ? 'character' : 'preset', ownerId = presetId ?? characterId;
  const [activeScope, setActiveScope] = useState(ownerScope), scopePanelId = useId();
  useEffect(() => setActiveScope(ownerScope), [ownerScope, ownerId]);
  const editor = useMemo(() => regexRules.editor(ownerScope, ownerId), [regexRules, ownerScope, ownerId]);
  const scopes = useMemo(() => localizeUiCopy(REGEX_SCOPES, tUi).filter(scope => scope.id === 'Global' || scope.id === (ownerScope === 'preset' ? 'AgentPreset' : 'Character')), [ownerScope, tUi]);
  const visibleScopes = scopes.filter(scope => scope.id === (activeScope === 'global' ? 'Global' : ownerScope === 'preset' ? 'AgentPreset' : 'Character'));
  const [collection, setCollection] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const nameInputRef = useRef(null);
  const collectionRef = useRef(null);
  const persistedRef = useRef(null);
  const pendingLatestRef = useRef(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const savePromiseRef = useRef(null);
  const receivedRef = useRef(null), acceptRef = useRef(null);
  const libraryVersions = useEditorLibraryVersions({ kind: 'regex', scope: ownerScope, ownerId, service: editor.versions,
    editorDirty: () => dirtyRef.current,
    capture: scope => ({ enabled: collectionRef.current?.[scope === 'global' ? 'globalEnabled' : scope === 'preset' ? 'agentPresetEnabled' : 'characterEnabled'] !== false,
      rules: rulesForScope(collectionRef.current, scope === 'global' ? 'Global' : scope === 'preset' ? 'AgentPreset' : 'Character') }),
    apply: (scope, content) => { changeCollection(current => ({ ...replaceRegexScopeVersion(current, scope === 'global' ? 'Global' : scope === 'preset' ? 'AgentPreset' : 'Character', content.rules),
      [scope === 'global' ? 'globalEnabled' : scope === 'preset' ? 'agentPresetEnabled' : 'characterEnabled']: content.enabled })); setSelectedId(''); },
  });

  const dirty = !editorValueEqual(collection, persisted) || libraryVersions.dirty;
  const ruleItems = scopes.flatMap(scope => rulesForScope(collection, scope.id));
  const multi = useEditorMultiSelect(ruleItems.map(rule => rule.id), JSON.stringify([ownerScope, ownerId]));
  const visibleIds = visibleScopes.flatMap(scope => rulesForScope(collection, scope.id)).filter(rule => !query.trim() || [rule.name, rule.pattern, rule.replacement].some(text => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))).map(rule => rule.id);
  const selected = useMemo(() => collection ? findRegexRule(collection, selectedId) : null, [collection, selectedId]);
  useEffect(() => { context.close(); }, [ownerScope, ownerId, saving, multi.active]);
  dirtyRef.current = dirty;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (notice !== "saved") return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 1600);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    let active = true;
    function applyLoaded(loaded, resetView = false) {
      pendingLatestRef.current = null;
      collectionRef.current = loaded;
      persistedRef.current = loaded;
      setCollection(loaded);
      setPersisted(loaded);
      setSelectedId((current) => resetView || !findRegexRule(loaded, current) ? "" : current);
      if (resetView) setManagerOpen(false);
      setError("");
      setNotice("");
    }
    function acceptLatest(loaded, resetView = false) {
      if (loaded.revision < (persistedRef.current?.revision ?? 0)) return;
      if (savingRef.current) { receivedRef.current = loaded; return; }
      if (dirtyRef.current) {
        const baseline = persistedRef.current;
        const changed = !baseline
          || baseline.revision !== loaded.revision
          || baseline.ownerRevision !== loaded.ownerRevision;
        if (changed) {
          pendingLatestRef.current = loaded;
          setError(tUi("正则配置已更新；请放弃本页未保存修改后载入最新内容。"));
        }
        return;
      }
      applyLoaded(loaded, resetView);
    }
    acceptRef.current = acceptLatest;
    setError("");
    dirtyRef.current = false;
    savingRef.current = false;
    receivedRef.current = null;
    collectionRef.current = null;
    persistedRef.current = null;
    setCollection(null);
    setPersisted(null);
    const stopListening = editor.subscribe((snapshot) => {
      if (!active) return;
      if (snapshot.status === "ready") acceptLatest(snapshot.value, !collectionRef.current);
      if (snapshot.status === "error") setError(snapshot.error || tUi("同步正则配置失败"));
    });
    const cached = editor.getSnapshot();
    if (cached.status === "ready") acceptLatest(cached.value, true);
    void editor.read().catch((cause) => active && setError(resolveFailure(cause, { fallback: tUi("读取正则配置失败") }).text));
    return () => {
      active = false;
      stopListening();
    };
  }, [editor]);

  function changeCollection(nextOrUpdater) {
    setError("");
    setNotice("");
    setCollection((current) => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(current) : nextOrUpdater;
      collectionRef.current = next;
      return next;
    });
  }

  async function save() {
    if (!collectionRef.current) return false;
    if (savePromiseRef.current) return savePromiseRef.current;
    const task = (async () => {
      savingRef.current = true;
      setSaving(true);
      setError("");
      try {
        if (pendingLatestRef.current) throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '正则配置已更新，请放弃本页修改后载入最新内容。', { what: '正则配置' });
        const result = await editor.versions.save([collectionRef.current], libraryVersions.prepare());
        const saved = result.documents[0];
        collectionRef.current = saved;
        persistedRef.current = saved;
        pendingLatestRef.current = null;
        setCollection(saved);
        setPersisted(saved);
        dirtyRef.current = false;
        libraryVersions.acceptSaved(result.versions);
        setNotice("saved");
        return true;
      } catch (cause) {
        setError(resolveFailure(cause, { fallback: tUi("保存正则配置失败") }).text);
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
        const received = receivedRef.current; receivedRef.current = null;
        if (received) acceptRef.current?.(received);
      }
    })();
    savePromiseRef.current = task;
    try { return await task; } finally { if (savePromiseRef.current === task) savePromiseRef.current = null; }
  }

  function discard() {
    const latest = pendingLatestRef.current || persistedRef.current;
    pendingLatestRef.current = null;
    collectionRef.current = latest;
    persistedRef.current = latest;
    setCollection(latest);
    setPersisted(latest);
    setSelectedId("");
    setManagerOpen(false);
    setError("");
    setNotice("");
    libraryVersions.discard(); multi.clear();
  }

  useImperativeHandle(ref, () => ({ save, discard }), [editor, collection, persisted, libraryVersions]);

  useEffect(() => {
    if (!manageSaveShortcut) return undefined;
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !saving) void save();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dirty, saving, editor, manageSaveShortcut]);

  function selectRule(id) { setSelectedId(id); setEditing(false); }
  function closeEditor() { if (compact) setEditing(false); else setSelectedId(''); }

  function addRule(scope) {
    const created = createRegexRule(collectionRef.current, scope);
    changeCollection(created.collection);
    setSelectedId(created.rule.id);
    setEditing(true);
    setAddOpen(false);
  }

  function changeSelected(patch) {
    if (!selected) return;
    changeCollection((current) => updateRegexRule(current, selected.scope, selected.rule.id, patch));
  }

  function moveSelectedScope(nextScope) {
    if (!selected || nextScope === selected.scope) return;
    changeCollection(moveRegexRuleToScope(collectionRef.current, selected.scope, nextScope, selected.rule.id));
    setActiveScope(nextScope === 'Global' ? 'global' : ownerScope);
  }

  function askDeleteSelected() {
    if (!selected) return;
    setDeleteTarget({ id: selected.rule.id, title: tUi("删除“{value0}”？", {value0: selected.rule.name || tUi("未命名规则")}), message: tUi("规则会在保存后删除。") });
  }

  function confirmDeleteSelected() {
    changeCollection((current) => deleteRegexRules(current, deleteTarget.ids || [deleteTarget.id]));
    setSelectedId("");
    setDeleteTarget(null);
    multi.clear();
  }

  function ruleActions(rule, scopeId) {
    return [
      { label: tUi("重命名"), Icon: NotePencil, run: () => { setSelectedId(rule.id); setEditing(true); requestAnimationFrame(() => nameInputRef.current?.select()); } },
      { label: tUi("复制"), Icon: Copy, run: () => changeCollection(current => duplicateRegexRules(current, [rule.id])) },
      { label: rule.enabled ? tUi("停用") : tUi("启用"), Icon: Power, run: () => changeCollection(current => updateRegexRule(current, scopeId, rule.id, { enabled: !rule.enabled })) },
      { label: tUi("删除"), Icon: Trash, danger: true, run: () => setDeleteTarget({ id: rule.id, title: tUi("删除“{value0}”？", {value0: rule.name}), message: tUi("规则会在保存后删除。") }) },
    ];
  }
  const contextRule = context.menu?.target.ruleId && rulesForScope(collection, context.menu.target.scopeId).find(rule => rule.id === context.menu.target.ruleId);
  const menuActions = context.menu?.target.ruleId ? contextRule ? ruleActions(contextRule, context.menu.target.scopeId) : []
    : visibleScopes.filter(scope => !context.menu?.target.scopeId || scope.id === context.menu.target.scopeId)
      .map(scope => ({ label: tUi("新建{value0}", {value0: scope.label}), Icon: Plus, run: () => addRule(scope.id) }));
  function openContext(event, target) {
    event.preventDefault(); event.stopPropagation();
    if (!multi.active) context.open(event, target);
  }

  function switchScope(next) { setActiveScope(next); setSelectedId(''); setEditing(false); setDraggedId(''); context.close(); if (multi.active) multi.toggle(); }
  const pcInspector = !multi.active && selected ? <RegexDocument key={JSON.stringify([ownerScope, ownerId, activeScope, libraryVersions.current(activeScope)?.activeVersionId, selected.rule.id])}
    item={selected.rule} scope={selected.scope} scopes={scopes} nameInputRef={nameInputRef} busy={saving} dirty={dirty} onChange={changeSelected} onMoveScope={moveSelectedScope}
    onTest={(text, rule, target, options, signal) => regexRules.test(text, rule, target, options, signal)}
    onDuplicate={() => changeCollection(current => duplicateRegexRules(current, [selected.rule.id]))} onDelete={askDeleteSelected} /> : null;
  const createItems = visibleScopes.map(scope => ({ label: scope.label, disabled: saving || !libraryVersions.ready, run: () => addRule(scope.id) }));
  return (
    <>{!compact ? <EditorLibraryWorkspace label={tUi('正则')} scope={activeScope} ownerScope={ownerScope} onScopeChange={switchScope} config={libraryVersions.current(activeScope)}
      query={query} onQueryChange={setQuery} createItems={[{ label: tUi('正则规则'), Icon: Plus, run: () => addRule(visibleScopes[0].id) }]} selection={{ ...multi, toggle: () => { multi.toggle(); setSelectedId(''); } }} saving={saving} disabled={!collection || !libraryVersions.ready}
      save={<SaveControl workspace dirty={dirty} error={error || libraryVersions.error} notice={notice} saving={saving} onSave={save} title={tUi('统一保存正则全部修改')} />} onManage={() => setManagerOpen(true)}
      onVersionChange={id => { try { libraryVersions.select(activeScope, id); } catch (cause) { setError(resolveFailure(cause, { fallback: tUi('切换版本失败') }).text); } }} inspector={pcInspector}>
      <EditorSelectionBar selection={multi} visibleIds={visibleIds} disabled={saving} onCopy={() => { changeCollection(current => duplicateRegexRules(current, [...multi.selected])); multi.clear(); }}
        onDelete={() => setDeleteTarget({ ids: [...multi.selected], title: tUi('删除选中的 {value0} 条正则？', { value0: multi.selected.size }), message: tUi('规则会在保存后删除。') })} />
      <div className="rs-directory-content" onContextMenu={event => openContext(event, {})} onMouseDown={event => { if (event.button === 0 && !multi.active && !event.target.closest('.regex-rule-row')) setSelectedId(''); }}>
        {collection ? <RegexWorkspaceList collection={collection} scope={visibleScopes[0]} query={query} selectedId={selectedId} selection={multi} busy={saving}
          onSelect={id => multi.active ? multi.check(id, !multi.selected.has(id)) : selectRule(id)} onToggleRule={(scope, id, enabled) => changeCollection(current => updateRegexRule(current, scope, id, { enabled }))}
          onToggleScope={(scope, enabled) => changeCollection(current => setRegexScopeEnabled(current, scope, enabled))} onMove={(scope, id, index) => changeCollection(current => moveRegexRule(current, scope, id, index))}
          draggedId={draggedId} onDragState={setDraggedId} onContextMenu={openContext} /> : <p className="rs-directory-empty" role="status">{error || tUi('正在读取…')}</p>}
      </div>
    </EditorLibraryWorkspace> :     <EditorSidebarLayout className={`regex-layout${multi.active ? ' is-multiselect' : ''}`} aria-label={tUi("正则配置")} onMouseDown={() => setAddOpen(false)}
      inspectorTitle={selected?.rule.name || tUi("编辑正则")} onCloseInspector={closeEditor}
      feedback={<SaveControl dirty={dirty} error={error || libraryVersions.error} notice={notice} saving={saving} onSave={save} />}
      inspector={!multi.active && selected && (!compact || editing) ? (
        <RegexRuleInspector
          scopes={scopes}
          scope={selected.scope}
          rule={selected.rule}
          onTest={(text, rule, target, options, signal) => regexRules.test(text, rule, target, options, signal)}
          onChange={changeSelected}
          onMoveScope={moveSelectedScope}
          onClose={closeEditor}
          onDuplicate={() => { changeCollection((current) => duplicateRegexRules(current, [selected.rule.id])); }}
          onDelete={askDeleteSelected}
        />
      ) : null}>
      <div className="regex-browser editor-collection-browser editor-collection-material editor-collection-continuous">
        <EditorCollectionToolbar query={query} onQueryChange={setQuery} placeholder={tUi("搜索正则")} disabled={saving || !collection || !libraryVersions.ready}
          selection={{ ...multi, toggle: () => { multi.toggle(); setSelectedId(''); setEditing(false); } }} createItems={createItems}
          onManage={() => setManagerOpen(true)} save={<SaveControl dirty={dirty} error={error || libraryVersions.error} notice={notice} saving={saving} onSave={save} />} />
        <EditorSelectionBar selection={multi} visibleIds={visibleIds} disabled={saving} onCopy={() => { changeCollection(current => duplicateRegexRules(current, [...multi.selected])); multi.clear(); }}
          onDelete={() => setDeleteTarget({ ids: [...multi.selected], title: tUi("删除选中的 {value0} 条正则？", {value0: multi.selected.size}), message: tUi("规则会在保存后删除。") })} />
        <div id={scopePanelId} role="tabpanel" aria-label={activeScope === 'global' ? tUi("全局正则") : tUi("角色正则")} className="regex-list-scroll editor-sidebar-directory" onContextMenu={event => openContext(event, {})} onMouseDown={(event) => { if (event.button === 0 && !event.target.closest(".regex-rule-row")) setSelectedId(""); }}>
        <EditorScopeTabs value={activeScope} ownerValue={ownerScope} ownerLabel={ownerScope === 'preset' ? tUi("预设") : tUi("角色")} panelId={scopePanelId} onChange={next => {
          setActiveScope(next); setSelectedId(''); setEditing(false); setDraggedId(''); context.close(); if (multi.active) multi.toggle();
        }} />
          <EditorCollectionSurface grouped>
          {!collection && <p className="regex-loading" role={error ? 'alert' : 'status'}>{error || tUi("正在读取…")}</p>}
          {collection && <RegexRuleList
            scopes={visibleScopes}
            collection={collection}
            selection={multi}
            busy={saving}
            onContextMenu={openContext}
            dragEnabled={!multi.active}
            touchReorder={compact && !multi.active}
            query={query}
            selectedId={selectedId}
            draggedId={draggedId}
            onSelect={id => multi.active ? multi.check(id, !multi.selected.has(id)) : selectRule(id)}
            onOpen={id => { setSelectedId(id); setEditing(true); }}
            onToggleRule={(scope, id, enabled) => changeCollection((current) => updateRegexRule(current, scope, id, { enabled }))}
            onToggleScope={(scope, enabled) => changeCollection(current => setRegexScopeEnabled(current, scope, enabled))}
            onMove={(scope, id, index) => changeCollection((current) => moveRegexRule(current, scope, id, index))}
            onDragState={setDraggedId}
          />}
          </EditorCollectionSurface>
        </div>
        {compact && collection && !multi.active && <MobileEditorActions label={tUi("正则操作")} selectionId={selectedId} busy={saving} createItems={createItems} canEdit={Boolean(selected)} canModify={Boolean(selected)}
          onEdit={() => setEditing(true)} onDelete={askDeleteSelected}
          moveItems={scopes.map(scope => ({ label: scope.label, disabled: scope.id === selected?.scope, run: () => moveSelectedScope(scope.id) }))}
          moreItems={[
            { label: tUi("复制"), Icon: Copy, run: () => changeCollection(current => duplicateRegexRules(current, [selected.rule.id])) },
            { label: tUi("重命名"), Icon: NotePencil, run: () => setEditing(true) },
          ]} />}
      </div>

    </EditorSidebarLayout>}
      {managerOpen ? (
        <RegexRulesManager
          libraryVersions={libraryVersions}
          ownerScope={ownerScope}
          initialScope={activeScope}
          busy={saving}
          onClose={() => setManagerOpen(false)}
        />
      ) : null}
      {context.menu && menuActions.length > 0 && <EditorContextMenu menu={context.menu} label={tUi("正则操作")} onClose={context.close}
        actions={menuActions.map(({ Icon, ...action }) => ({ ...action, icon: Icon, disabled: saving || !collection || !libraryVersions.ready }))} />}
      <ConfirmationDialog target={deleteTarget} confirmLabel={tUi("删除")} tone="destructive" onCancel={() => setDeleteTarget(null)} onConfirm={confirmDeleteSelected} />
    </>
  );
});
