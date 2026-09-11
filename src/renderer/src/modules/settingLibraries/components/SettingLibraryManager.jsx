import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowsMerge,
  CaretRight,
  Check,
  Copy,
  FileText,
  FolderOpen,
  Minus,
  Plus,
  Trash,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import { ExportIcon, ImportIcon } from "../../../ui/icons/index.jsx";
import { getCharacters } from "../../persona/index.js";
import { getSettingLibrary } from "../api/settingLibraryApi.js";
import {
  createLibraryVersion,
  deleteActiveLibraryVersion,
  importLibraryAsVersion,
  mergeSettingLibraryEntries,
  parseSettingLibraryFile,
  renameActiveVersion,
  serializeSettingLibrary,
  switchLibraryVersion,
  syncActiveVersion,
} from "../model/settingLibraryTransfer.js";
import { PINNED_ENTRY_IDS, uniqueName } from "../model/settingLibraryEditing.js";

function versionLabel(version) {
  return version.name.trim() || "待命名";
}

function suggestedVersionName(library, sourceId) {
  const source = library.versions.find((version) => version.id === sourceId);
  const base = source ? `${versionLabel(source)} · 副本` : "新版本";
  return uniqueName(base, new Set(library.versions.map((version) => version.name.trim())));
}

function Modal({ title, children, actions, onClose, labelledBy = "setting-library-modal-title" }) {
  return (
    <div className="setting-library-dialog-overlay" role="presentation" onMouseDown={onClose}>
      <section className="setting-library-dialog setting-library-manager-dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} onMouseDown={(event) => event.stopPropagation()}>
        <h2 id={labelledBy}>{title}</h2>
        <div className="setting-library-manager-dialog-body">{children}</div>
        <div className="setting-library-manager-dialog-actions">{actions}</div>
      </section>
    </div>
  );
}

function CreateVersionDialog({ library, onCancel, onCreate }) {
  const [sourceId, setSourceId] = useState(library.activeVersionId);
  const [name, setName] = useState(() => suggestedVersionName(library, library.activeVersionId));
  const [edited, setEdited] = useState(false);
  const [validation, setValidation] = useState("");
  const ordered = useMemo(() => [...library.versions].sort((left, right) => left.id === library.activeVersionId ? -1 : right.id === library.activeVersionId ? 1 : 0), [library]);

  function selectSource(nextId) {
    setSourceId(nextId);
    setValidation("");
    if (!edited) setName(suggestedVersionName(library, nextId));
  }

  function submit() {
    const normalized = name.trim();
    if (!normalized) return setValidation("请输入版本名称");
    if (library.versions.some((version) => version.name.trim() === normalized)) return setValidation("版本名称已存在");
    onCreate(normalized, sourceId === "__blank__" ? "" : sourceId);
  }

  return (
    <Modal
      title="新建版本"
      onClose={onCancel}
      actions={<><button type="button" onClick={onCancel}>取消</button><button type="button" className="is-primary" onClick={submit}>创建版本</button></>}
    >
      <label className="setting-library-manager-field">
        <span>版本名称</span>
        <input autoFocus value={name} maxLength={60} aria-invalid={Boolean(validation)} onChange={(event) => { setName(event.target.value); setEdited(true); setValidation(""); }} />
        {validation ? <small role="alert">{validation}</small> : null}
      </label>
      <fieldset className="setting-library-version-source-list">
        <legend>创建方式</legend>
        {ordered.map((version) => (
          <label key={version.id}>
            <input type="radio" name="version-source" checked={sourceId === version.id} onChange={() => selectSource(version.id)} />
            <span><strong>{version.id === library.activeVersionId ? "复制当前版本" : versionLabel(version)}</strong><small>{version.id === library.activeVersionId ? versionLabel(version) : "从这个版本复制"}</small></span>
          </label>
        ))}
        <label>
          <input type="radio" name="version-source" checked={sourceId === "__blank__"} onChange={() => selectSource("__blank__")} />
          <span><strong>创建空白版本</strong><small>保留固定条目，不复制其他设定</small></span>
        </label>
      </fieldset>
    </Modal>
  );
}

function ImportTypeDialog({ onCancel, onPick }) {
  return (
    <Modal title="导入设定库" onClose={onCancel} actions={<button type="button" onClick={onCancel}>取消</button>}>
      <div className="setting-library-manager-choice-list">
        <button type="button" onClick={() => onPick("eleckoi")}><ImportIcon size={20} /><span><strong>ElecKoi 设定库</strong><small>导入 ElecKoi 导出的 JSON</small></span><CaretRight size={16} /></button>
        <button type="button" onClick={() => onPick("sillytavern")}><ImportIcon size={20} /><span><strong>酒馆世界书</strong><small>导入 SillyTavern 世界书 JSON</small></span><CaretRight size={16} /></button>
      </div>
    </Modal>
  );
}

function DeleteVersionDialog({ version, onCancel, onDelete }) {
  return (
    <Modal
      title={`删除“${versionLabel(version)}”？`}
      onClose={onCancel}
      actions={<><button type="button" onClick={onCancel}>取消</button><button type="button" className="is-destructive" onClick={onDelete}>删除版本</button></>}
    >
      <p className="setting-library-manager-confirm-copy">删除会在保存后生效；关闭窗口前仍可放弃更改。</p>
    </Modal>
  );
}

function MergeConfirmDialog({ sourceName, version, plan, onCancel, onMerge }) {
  return (
    <Modal
      title={`并入 ${plan.entryCount} 条设定？`}
      onClose={onCancel}
      actions={<><button type="button" onClick={onCancel}>返回检查</button><button type="button" className="is-primary" onClick={onMerge}>并入设定</button></>}
    >
      <p className="setting-library-manager-confirm-copy">来源：{sourceName} · {versionLabel(version)}</p>
      <dl className="setting-library-merge-summary">
        <div><dt>设定</dt><dd>{plan.entryCount}</dd></div>
        <div><dt>新建文件夹</dt><dd>{plan.newFolderCount}</dd></div>
        <div><dt>复用文件夹</dt><dd>{plan.mergedFolderCount}</dd></div>
        <div><dt>重命名</dt><dd>{plan.renamedEntryCount}</dd></div>
        <div><dt>顺序调整</dt><dd>{plan.reorderedEntryCount}</dd></div>
      </dl>
    </Modal>
  );
}

function TriCheckbox({ checked, mixed, label, onChange }) {
  return (
    <button type="button" className={`setting-library-tri-checkbox${checked || mixed ? " is-checked" : ""}`} role="checkbox" aria-checked={mixed ? "mixed" : checked} aria-label={label} onClick={onChange}>
      {mixed ? <Minus size={12} weight="bold" /> : checked ? <Check size={12} weight="bold" /> : null}
    </button>
  );
}

function entryIdsUnder(groups, entries, groupId) {
  const groupIds = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const group of groups) if (groupIds.has(group.parentId) && !groupIds.has(group.id)) { groupIds.add(group.id); changed = true; }
  }
  return entries.filter((entry) => groupIds.has(entry.groupId) && !PINNED_ENTRY_IDS.has(entry.id)).map((entry) => entry.id);
}

function pickerRows(version) {
  const groupsByParent = new Map();
  const entriesByGroup = new Map();
  for (const group of version.groups) {
    const list = groupsByParent.get(group.parentId) || [];
    list.push(group);
    groupsByParent.set(group.parentId, list);
  }
  for (const entry of version.entries.filter((item) => !PINNED_ENTRY_IDS.has(item.id))) {
    const list = entriesByGroup.get(entry.groupId) || [];
    list.push(entry);
    entriesByGroup.set(entry.groupId, list);
  }
  const result = [];
  function visit(parentId, depth) {
    const groups = (groupsByParent.get(parentId) || []).sort((a, b) => a.treeViewOrder - b.treeViewOrder);
    const entries = (entriesByGroup.get(parentId) || []).sort((a, b) => a.treeViewOrder - b.treeViewOrder);
    for (const group of groups) {
      result.push({ kind: "group", value: group, depth });
      visit(group.id, depth + 1);
    }
    for (const entry of entries) result.push({ kind: "entry", value: entry, depth });
  }
  visit("", 0);
  return result;
}

function flattenGroups(groups) {
  const result = [];
  function visit(parentId, depth) {
    groups.filter((group) => group.parentId === parentId).sort((a, b) => a.treeViewOrder - b.treeViewOrder).forEach((group) => {
      result.push({ ...group, depth });
      visit(group.id, depth + 1);
    });
  }
  visit("", 0);
  return result;
}

async function saveJsonFile(json, suggestedName) {
  if (typeof window.showSaveFilePicker === "function") {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: "ElecKoi 设定库", accept: { "application/json": [".json"] } }],
    });
    const writer = await handle.createWritable();
    await writer.write(json);
    await writer.close();
    return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SettingLibraryManager({ characterId, library, onChange, onClose, onError }) {
  const [page, setPage] = useState("home");
  const [dialog, setDialog] = useState("");
  const [notice, setNotice] = useState("");
  const [sources, setSources] = useState([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [source, setSource] = useState(null);
  const [versionId, setVersionId] = useState("");
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [destinationGroupId, setDestinationGroupId] = useState("");
  const [mergePreview, setMergePreview] = useState(null);
  const fileInputRef = useRef(null);
  const fileActionRef = useRef(null);
  const current = useMemo(() => syncActiveVersion(library), [library]);
  const activeVersion = current.versions.find((version) => version.id === current.activeVersionId) || current.versions[0];
  const pickedVersion = source?.versions.find((version) => version.id === versionId) || source?.versions[0] || null;
  const selectableEntries = pickedVersion?.entries.filter((entry) => !PINNED_ENTRY_IDS.has(entry.id)) || [];
  const rows = useMemo(() => pickedVersion ? pickerRows(pickedVersion) : [], [pickedVersion]);

  useEffect(() => {
    if (page !== "sources") return undefined;
    let alive = true;
    setLoadingSources(true);
    const ownVersions = current.versions.filter((version) => version.id !== current.activeVersionId);
    setSources([{ id: "__self__", name: "当前角色 · 其他版本", versions: ownVersions }]);
    getCharacters().then(async (collection) => {
      const others = await Promise.all((collection.items || []).filter((item) => item.id !== characterId).map(async (item) => {
        try {
          const otherLibrary = await getSettingLibrary(item.id);
          return { id: item.id, name: item.name || item.persona?.assistant_name || "未命名角色", versions: otherLibrary.versions };
        } catch {
          return null;
        }
      }));
      if (!alive) return;
      const character = (collection.items || []).find((item) => item.id === characterId);
      setSources([
        { id: "__self__", name: `${character?.name || character?.persona?.assistant_name || "当前角色"} · 其他版本`, versions: ownVersions },
        ...others.filter(Boolean),
      ]);
    }).catch((cause) => alive && onError(cause?.message || "读取导入来源失败")).finally(() => alive && setLoadingSources(false));
    return () => { alive = false; };
  }, [page, characterId]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key !== "Escape") return;
      if (mergePreview) return setMergePreview(null);
      if (dialog) return setDialog("");
      if (page === "picker") {
        setPage("sources");
        setSource(null);
        return;
      }
      if (page === "sources") return setPage("home");
      onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [dialog, mergePreview, onClose, page]);

  function openSource(picked) {
    if (!picked.versions.length) return;
    setSource(picked);
    setVersionId(picked.versions[0].id);
    setCheckedIds(new Set());
    setDestinationGroupId("");
    setPage("picker");
  }

  function requestFile(action) {
    fileActionRef.current = action;
    fileInputRef.current.value = "";
    fileInputRef.current.click();
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    const action = fileActionRef.current;
    if (!file || !action) return;
    try {
      const parsed = parseSettingLibraryFile(await file.text(), action.expected || "auto");
      if (action.type === "import") {
        onChange(importLibraryAsVersion(current, parsed));
        setDialog("");
        setNotice(`已导入“${versionLabel(parsed)}”，保存后生效`);
      } else {
        openSource({ id: "__file__", name: parsed.name || file.name, versions: [parsed] });
      }
    } catch (cause) {
      onError(cause?.message || "设定库文件读取失败");
    } finally {
      fileActionRef.current = null;
    }
  }

  function toggleEntries(ids, checked) {
    setCheckedIds((previous) => {
      const next = new Set(previous);
      for (const id of ids) checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function prepareMerge() {
    if (!pickedVersion || !checkedIds.size) return;
    setMergePreview(mergeSettingLibraryEntries(current, pickedVersion, checkedIds, destinationGroupId));
  }

  async function exportLibrary() {
    try {
      onError("");
      const safeName = (current.name.trim() || "setting-library").replace(/[\\/:*?"<>|]/g, "-");
      await saveJsonFile(serializeSettingLibrary(current), `${safeName}.json`);
      setNotice("设定库已导出");
    } catch (cause) {
      if (cause?.name !== "AbortError") onError(cause?.message || "导出设定库失败");
    }
  }

  const title = page === "home" ? "设定库管理" : page === "sources" ? "并入设定库" : source?.name || "选择设定";

  return (
    <div className="setting-library-manager-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="setting-library-manager" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <input ref={fileInputRef} className="setting-library-file-input" type="file" accept=".json,application/json" onChange={handleFile} />
        <header className="setting-library-manager-header">
          {page !== "home" ? <button type="button" aria-label="返回" onClick={() => { setPage(page === "picker" ? "sources" : "home"); setSource(null); }}><ArrowLeft size={17} /></button> : null}
          <strong>{title}</strong>
          <button type="button" aria-label="关闭设定库管理" onClick={onClose}><X size={17} /></button>
        </header>

      {page === "home" ? (
        <div className="setting-library-manager-body">
          {notice ? <p className="setting-library-manager-notice" role="status">{notice}</p> : null}
          <section className="setting-library-manager-card setting-library-version-name-card">
            <label><span>当前版本名称</span><input value={current.name} maxLength={60} onChange={(event) => onChange(renameActiveVersion(current, event.target.value))} /></label>
          </section>

          <section className="setting-library-manager-card">
            <h3>版本</h3>
            <div className="setting-library-manager-rows">
              {current.versions.map((version) => (
                <button type="button" className="setting-library-version-row" key={version.id} onClick={() => onChange(switchLibraryVersion(current, version.id))}>
                  <span>{version.id === current.activeVersionId ? <Check size={17} weight="bold" /> : null}</span>
                  <strong>{versionLabel(version)}</strong>
                </button>
              ))}
              <button type="button" className="setting-library-manager-row is-accent" onClick={() => setDialog("create")}><Plus size={18} /><strong>新建版本</strong></button>
            </div>
          </section>

          <section className="setting-library-manager-card">
            <h3>导入 · 导出</h3>
            <div className="setting-library-manager-rows">
              <button type="button" className="setting-library-manager-row" onClick={() => setPage("sources")}><ArrowsMerge size={18} /><strong>并入设定库</strong><CaretRight size={15} /></button>
              <button type="button" className="setting-library-manager-row" onClick={() => setDialog("import")}><ImportIcon size={18} /><strong>导入设定库</strong><CaretRight size={15} /></button>
              <button type="button" className="setting-library-manager-row" onClick={exportLibrary}><ExportIcon size={18} /><strong>导出设定库</strong><CaretRight size={15} /></button>
            </div>
          </section>

          <section className="setting-library-manager-card">
            <button type="button" className="setting-library-manager-row is-danger" onClick={() => setDialog("delete")}><Trash size={18} /><strong>删除当前版本</strong></button>
          </section>
        </div>
      ) : page === "sources" ? (
        <div className="setting-library-manager-body">
          <p className="setting-library-manager-hint">只读取来源，不会改动其他角色。</p>
          <section className="setting-library-manager-card">
            <div className="setting-library-manager-rows">
              {sources.map((item) => (
                <button type="button" className="setting-library-manager-row" key={item.id} disabled={!item.versions.some((version) => version.entries.some((entry) => !PINNED_ENTRY_IDS.has(entry.id)))} onClick={() => openSource(item)}>
                  <UserCircle size={19} /><strong>{item.name}</strong><small>{item.versions.length} 个版本</small><CaretRight size={15} />
                </button>
              ))}
              {loadingSources ? <div className="setting-library-manager-loading">正在读取其他角色…</div> : null}
            </div>
          </section>
          <section className="setting-library-manager-card">
            <button type="button" className="setting-library-manager-row" onClick={() => requestFile({ type: "merge", expected: "auto" })}><FileText size={18} /><strong>从本地文件</strong><CaretRight size={15} /></button>
          </section>
        </div>
      ) : pickedVersion ? (
        <div className="setting-library-manager-body setting-library-picker-body">
          {source.versions.length > 1 ? (
            <label className="setting-library-manager-field"><span>来源版本</span><select value={pickedVersion.id} onChange={(event) => { setVersionId(event.target.value); setCheckedIds(new Set()); }}>
              {source.versions.map((version) => <option key={version.id} value={version.id}>{versionLabel(version)}</option>)}
            </select></label>
          ) : null}
          <div className="setting-library-picker-toolbar">
            <strong>选择要并入的设定</strong>
            <button type="button" onClick={() => toggleEntries(selectableEntries.map((entry) => entry.id), checkedIds.size !== selectableEntries.length)}>{checkedIds.size === selectableEntries.length ? "清空" : "全选"}</button>
          </div>
          <section className="setting-library-manager-card setting-library-picker-list">
            {!rows.length ? <p>这个版本没有可并入的设定。</p> : rows.map((row) => {
              if (row.kind === "entry") {
                const checked = checkedIds.has(row.value.id);
                return <div className="setting-library-picker-row" style={{ paddingLeft: 14 + row.depth * 18 }} key={`entry:${row.value.id}`}><TriCheckbox checked={checked} label={row.value.title} onChange={() => toggleEntries([row.value.id], !checked)} /><FileText size={16} /><span>{row.value.title || "未命名设定"}</span></div>;
              }
              const ids = entryIdsUnder(pickedVersion.groups, pickedVersion.entries, row.value.id);
              const selectedCount = ids.filter((id) => checkedIds.has(id)).length;
              return <div className="setting-library-picker-row is-folder" style={{ paddingLeft: 14 + row.depth * 18 }} key={`group:${row.value.id}`}><TriCheckbox checked={Boolean(ids.length) && selectedCount === ids.length} mixed={selectedCount > 0 && selectedCount < ids.length} label={row.value.name} onChange={() => toggleEntries(ids, selectedCount !== ids.length)} /><FolderOpen size={16} /><strong>{row.value.name}</strong><small>{ids.length}</small></div>;
            })}
          </section>
          <label className="setting-library-manager-field"><span>并入位置</span><select value={destinationGroupId} onChange={(event) => setDestinationGroupId(event.target.value)}>
            <option value="">根目录</option>
            {flattenGroups(current.groups).map((group) => <option key={group.id} value={group.id}>{`${"　".repeat(group.depth)}${group.name}`}</option>)}
          </select></label>
          <button type="button" className="setting-library-merge-button" disabled={!checkedIds.size} onClick={prepareMerge}>检查并入结果</button>
        </div>
      ) : null}

        {dialog === "create" ? <CreateVersionDialog library={current} onCancel={() => setDialog("")} onCreate={(name, sourceId) => { onChange(createLibraryVersion(current, name, sourceId)); setDialog(""); setNotice(`已创建“${name}”，保存后生效`); }} /> : null}
        {dialog === "import" ? <ImportTypeDialog onCancel={() => setDialog("")} onPick={(expected) => requestFile({ type: "import", expected })} /> : null}
        {dialog === "delete" && activeVersion ? <DeleteVersionDialog version={activeVersion} onCancel={() => setDialog("")} onDelete={() => { onChange(deleteActiveLibraryVersion(current)); setDialog(""); setNotice("当前版本已删除，保存后生效"); }} /> : null}
        {mergePreview && pickedVersion ? <MergeConfirmDialog sourceName={source.name} version={pickedVersion} plan={mergePreview.plan} onCancel={() => setMergePreview(null)} onMerge={() => { onChange(mergePreview.library); setMergePreview(null); setCheckedIds(new Set()); setPage("home"); setNotice(`已并入 ${mergePreview.plan.entryCount} 条设定，保存后生效`); }} /> : null}
      </aside>
    </div>
  );
}
