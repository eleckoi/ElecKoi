import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, Plus, SlidersHorizontal } from "@phosphor-icons/react";
import { ConfirmationDialog, SaveControl } from "../../settingLibraries/index.js";
import { exportRegexRules, getRegexRules, importRegexRules, saveRegexRules } from "../api/regexRulesApi.js";
import {
  REGEX_SCOPES,
  createRegexRule,
  deleteRegexRules,
  duplicateRegexRules,
  findRegexRule,
  moveRegexRule,
  moveRegexRuleToScope,
  updateRegexRule,
} from "../model/regexRulesEditing.js";
import { RegexRuleInspector } from "./RegexRuleInspector.jsx";
import { RegexRuleList } from "./RegexRuleList.jsx";
import { RegexRulesManager } from "./RegexRulesManager.jsx";

function downloadJson(fileName, json) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const RegexRulesPanel = forwardRef(function RegexRulesPanel({ characterId, onDirtyChange }, ref) {
  const [collection, setCollection] = useState(null);
  const [persisted, setPersisted] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [draggedId, setDraggedId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const collectionRef = useRef(null);
  const persistedRef = useRef(null);
  const savePromiseRef = useRef(null);
  const importInputRef = useRef(null);
  const importScopeRef = useRef("Global");

  const dirty = useMemo(() => JSON.stringify(collection) !== JSON.stringify(persisted), [collection, persisted]);
  const selected = useMemo(() => collection ? findRegexRule(collection, selectedId) : null, [collection, selectedId]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (notice !== "saved") return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 1600);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    let active = true;
    setError("");
    getRegexRules(characterId).then((loaded) => {
      if (!active) return;
      collectionRef.current = loaded;
      persistedRef.current = loaded;
      setCollection(loaded);
      setPersisted(loaded);
      setSelectedId("");
      setManagerOpen(false);
    }).catch((cause) => active && setError(cause?.message || "读取正则配置失败"));
    return () => { active = false; };
  }, [characterId]);

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
      setSaving(true);
      setError("");
      try {
        const saved = await saveRegexRules(characterId, collectionRef.current);
        collectionRef.current = saved;
        persistedRef.current = saved;
        setCollection(saved);
        setPersisted(saved);
        setNotice("saved");
        return true;
      } catch (cause) {
        setError(cause?.message || "保存正则配置失败");
        return false;
      } finally {
        setSaving(false);
      }
    })();
    savePromiseRef.current = task;
    try { return await task; } finally { if (savePromiseRef.current === task) savePromiseRef.current = null; }
  }

  function discard() {
    collectionRef.current = persistedRef.current;
    setCollection(persistedRef.current);
    setSelectedId("");
    setManagerOpen(false);
    setError("");
    setNotice("");
  }

  useImperativeHandle(ref, () => ({ save, discard }), [characterId, collection, persisted]);

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !saving) void save();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dirty, saving]);

  function addRule(scope) {
    const created = createRegexRule(collectionRef.current, scope);
    changeCollection(created.collection);
    setSelectedId(created.rule.id);
    setAddOpen(false);
  }

  function changeSelected(patch) {
    if (!selected) return;
    changeCollection((current) => updateRegexRule(current, selected.scope, selected.rule.id, patch));
  }

  function moveSelectedScope(nextScope) {
    if (!selected || nextScope === selected.scope) return;
    changeCollection(moveRegexRuleToScope(collectionRef.current, selected.scope, nextScope, selected.rule.id));
  }

  function askDeleteSelected() {
    if (!selected) return;
    setDeleteTarget({ id: selected.rule.id, title: `删除“${selected.rule.name || "未命名规则"}”？`, message: "规则会在保存后删除。" });
  }

  function confirmDeleteSelected() {
    changeCollection((current) => deleteRegexRules(current, [deleteTarget.id]));
    setSelectedId("");
    setDeleteTarget(null);
  }

  async function handleImportFiles(event) {
    const files = [...event.target.files];
    event.target.value = "";
    if (!files.length || !collectionRef.current) return;
    setError("");
    try {
      const documents = await Promise.all(files.map(async (file) => ({ displayName: file.name, json: await file.text() })));
      const result = await importRegexRules(characterId, collectionRef.current, importScopeRef.current, documents);
      collectionRef.current = result.collection;
      persistedRef.current = result.collection;
      setCollection(result.collection);
      setPersisted(result.collection);
      setManagerOpen(false);
      const extras = [
        result.failedFileNames.length ? `${result.failedFileNames.length} 个文件失败` : "",
      ].filter(Boolean).join("，");
      setNotice(extras ? `已导入 ${result.importedRuleCount} 条，${extras}` : "saved");
    } catch (cause) {
      setError(cause?.message || "导入正则失败");
    }
  }

  async function handleExport(ruleIds) {
    try {
      const result = await exportRegexRules(characterId, ruleIds);
      downloadJson(result.fileName, result.json);
    } catch (cause) {
      setError(cause?.message || "导出正则失败");
    }
  }

  if (!collection) return <div className="regex-loading">{error || "正在读取…"}</div>;

  return (
    <section className={`regex-layout${selected ? " has-inspector" : ""}`} aria-label="正则配置" onMouseDown={() => setAddOpen(false)}>
      <div className="regex-browser">
        <div className="regex-toolbar" onMouseDown={(event) => event.stopPropagation()}>
          <label className="regex-search"><MagnifyingGlass size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索正则" aria-label="搜索正则" /></label>
          <div className="regex-add-wrap">
            <button type="button" className="regex-create-button" aria-expanded={addOpen} onClick={() => setAddOpen((open) => !open)}><Plus size={16} />新建</button>
            {addOpen ? <div className="regex-popover" role="menu">{REGEX_SCOPES.map((scope) => <button type="button" role="menuitem" key={scope.id} onClick={() => addRule(scope.id)}>{scope.label}</button>)}</div> : null}
          </div>
          <button type="button" className="regex-manage-button" aria-expanded={managerOpen} onClick={() => { setAddOpen(false); setManagerOpen(true); }}><SlidersHorizontal size={16} />管理</button>
          <SaveControl dirty={dirty} error={error} notice={notice} saving={saving} onSave={save} />
        </div>
        <div className="regex-list-scroll" onMouseDown={(event) => { if (!event.target.closest(".regex-rule-row")) setSelectedId(""); }}>
          <RegexRuleList
            collection={collection}
            query={query}
            selectedId={selectedId}
            collapsed={collapsed}
            draggedId={draggedId}
            onToggleSection={(scope) => setCollapsed((current) => { const next = new Set(current); if (next.has(scope)) next.delete(scope); else next.add(scope); return next; })}
            onSelect={setSelectedId}
            onToggleRule={(scope, id, enabled) => changeCollection((current) => updateRegexRule(current, scope, id, { enabled }))}
            onMove={(scope, id, index) => changeCollection((current) => moveRegexRule(current, scope, id, index))}
            onDragState={setDraggedId}
          />
        </div>
      </div>

      {selected ? (
        <RegexRuleInspector
          scope={selected.scope}
          rule={selected.rule}
          onChange={changeSelected}
          onMoveScope={moveSelectedScope}
          onClose={() => setSelectedId("")}
          onDuplicate={() => { changeCollection((current) => duplicateRegexRules(current, [selected.rule.id])); }}
          onDelete={askDeleteSelected}
        />
      ) : null}

      {managerOpen ? (
        <RegexRulesManager
          collection={collection}
          onChange={changeCollection}
          onClose={() => setManagerOpen(false)}
          onImport={(scope) => { importScopeRef.current = scope; importInputRef.current?.click(); }}
          onExport={handleExport}
        />
      ) : null}
      <input ref={importInputRef} className="regex-file-input" type="file" accept="application/json,.json" multiple onChange={handleImportFiles} />
      <ConfirmationDialog target={deleteTarget} confirmLabel="删除" tone="destructive" onCancel={() => setDeleteTarget(null)} onConfirm={confirmDeleteSelected} />
    </section>
  );
});
