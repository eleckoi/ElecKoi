import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { saveSettingLibraryFile } from '../model/settingLibraryFileSave.js';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { EditorManagementModal } from '../../../ui/ui/EditorCollectionControls.jsx';
import { EditorVersionManager } from '../../../ui/ui/EditorVersionManager.jsx';
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsMerge, CaretRight, Check, FileText, FolderOpen, Minus, UserCircle } from "../../../ui/icons/interfaceIcons.jsx";
import { ExportIcon, ImportIcon } from "../../../ui/icons/index.jsx";
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
import { PINNED_ENTRY_IDS } from "../model/settingLibraryEditing.js";
import { resolveFailure } from '../../../utils/failureText.js';

function versionLabel(version) {
  return version.name.trim() || "待命名";
}

function Modal({ title, children, actions, onClose }) {
  return <EditorManagementModal title={title} onClose={onClose} footer={actions}>{children}</EditorManagementModal>;
}

function ImportTypeDialog({ onCancel, onPick }) {
  const tUi = useProductTranslation();
  return (
    <Modal title={tUi("导入设定库")} onClose={onCancel} actions={<Button data-dsh-control variant="outline" onClick={onCancel}>{tUi("取消")}</Button>}>
      <div className="setting-library-manager-choice-list">
        <button type="button" onClick={() => onPick("eleckoi")}><ImportIcon size={20} /><span><strong>{tUi("ElecKoi 设定库")}</strong><small>{tUi("导入 ElecKoi 导出的 JSON")}</small></span><CaretRight size={16} /></button>
        <button type="button" onClick={() => onPick("sillytavern")}><ImportIcon size={20} /><span><strong>{tUi("酒馆世界书")}</strong><small>{tUi("导入 SillyTavern 世界书 JSON")}</small></span><CaretRight size={16} /></button>
      </div>
    </Modal>
  );
}

function MergeConfirmDialog({ sourceName, version, plan, onCancel, onMerge }) {
  const tUi = useProductTranslation();
  return (
    <Modal
      title={tUi("并入 {value0} 条设定？", {value0: plan.entryCount})}
      onClose={onCancel}
      actions={<><Button data-dsh-control variant="outline" onClick={onCancel}>{tUi("返回检查")}</Button><Button data-dsh-control variant="primary" onClick={onMerge}>{tUi("并入设定")}</Button></>}
    >
      <p className="setting-library-manager-confirm-copy">{tUi("来源：")}{sourceName} · {versionLabel(version)}</p>
      <dl className="setting-library-merge-summary">
        <div><dt>{tUi("设定")}</dt><dd>{plan.entryCount}</dd></div>
        <div><dt>{tUi("新建文件夹")}</dt><dd>{plan.newFolderCount}</dd></div>
        <div><dt>{tUi("复用文件夹")}</dt><dd>{plan.mergedFolderCount}</dd></div>
        <div><dt>{tUi("重命名")}</dt><dd>{plan.renamedEntryCount}</dd></div>
        <div><dt>{tUi("顺序调整")}</dt><dd>{plan.reorderedEntryCount}</dd></div>
      </dl>
    </Modal>
  );
}

function TriCheckbox({ checked, mixed, label, onChange }) {
  return (
    <button type="button" className={`setting-library-tri-checkbox${checked || mixed ? " is-checked" : ""}`} role="checkbox" aria-checked={mixed ? "mixed" : checked} aria-label={label} onClick={onChange}>
      <span className="setting-library-tri-checkbox-mark" aria-hidden="true">
        {mixed ? <Minus size={12} weight="bold" /> : checked ? <Check size={12} weight="bold" /> : null}
      </span>
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


export function SettingLibraryManager({ characterId, settingLibraries, library, onChange, onClose, onError }) {
  const tUi = useProductTranslation();
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
  const activeVersion = current.versions.find((version) => version.id === current.activeVersionId);
  const pickedVersion = source?.versions.find((version) => version.id === versionId) || source?.versions[0] || null;
  const selectableEntries = pickedVersion?.entries.filter((entry) => !PINNED_ENTRY_IDS.has(entry.id)) || [];
  const rows = useMemo(() => pickedVersion ? pickerRows(pickedVersion) : [], [pickedVersion]);

  useEffect(() => {
    if (page !== "sources") return undefined;
    let alive = true;
    setLoadingSources(true);
    const ownVersions = current.versions.filter((version) => version.id !== current.activeVersionId);
    setSources([{ id: "__self__", name: "当前角色 · 其他版本", versions: ownVersions }]);
    settingLibraries.listCharacters().then(async (collection) => {
      const others = await Promise.all((collection.items || []).filter((item) => item.id !== characterId).map(async (item) => {
        try {
          const otherLibrary = await settingLibraries.readUntracked(item.id);
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
    }).catch((cause) => alive && onError(resolveFailure(cause, { fallback: tUi("读取导入来源失败") }).text)).finally(() => alive && setLoadingSources(false));
    return () => { alive = false; };
  }, [page, characterId, settingLibraries]);

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
      const parsed = parseSettingLibraryFile(await file.text(), action.expected || "auto", file.name);
      if (action.type === "import") {
        onChange(importLibraryAsVersion(current, parsed));
        setDialog("");
        setNotice(tUi("已导入“{value0}”，保存后生效", {value0: versionLabel(parsed)}));
      } else {
        openSource({ id: "__file__", name: parsed.name || file.name, versions: [parsed] });
      }
    } catch (cause) {
      onError(resolveFailure(cause, { fallback: tUi("设定库文件读取失败") }).text);
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
      await saveSettingLibraryFile(serializeSettingLibrary({ ...current, versions: [activeVersion] }), `${safeName}.json`);
      setNotice(tUi("设定库已导出"));
    } catch (cause) {
      if (cause?.name !== "AbortError") onError(resolveFailure(cause, { fallback: tUi("导出设定库失败") }).text);
    }
  }

  const title = page === "home" ? tUi("设定库管理") : page === "sources" ? tUi("并入设定库") : source?.name || tUi("选择设定");

  return (
    <>
        <input ref={fileInputRef} className="setting-library-file-input" type="file" accept=".json,application/json" onChange={handleFile} />
      {page === "home" ? <EditorVersionManager title={tUi("角色设定库版本管理")} versions={current.versions} activeVersionId={current.activeVersionId}
        onClose={onClose} notice={notice} onSelect={id => onChange(switchLibraryVersion(current, id))}
        onCopy={name => onChange(createLibraryVersion(current, name, current.activeVersionId))}
        onCreate={name => onChange(createLibraryVersion(current, name, ''))}
        onRename={name => onChange(renameActiveVersion(current, name))} onDelete={() => onChange(deleteActiveLibraryVersion(current))}
        onImport={() => setDialog('import')} onExport={exportLibrary}
        extraActions={[{ label: tUi("并入设定库"), Icon: ArrowsMerge, onClick: () => setPage('sources') }]} /> :
        <EditorManagementModal title={title} onClose={() => { setPage(page === 'picker' ? 'sources' : 'home'); setSource(null); }}>
        {page === "sources" ? (
        <div className="setting-library-manager-body setting-library-sources-body">
          <p className="setting-library-manager-hint">{tUi("只读取来源，不会改动其他角色。")}</p>
          <section className="setting-library-manager-card setting-library-sources-list">
            <div className="setting-library-manager-rows">
              {sources.map((item) => (
                <button type="button" className="setting-library-manager-row" key={item.id} disabled={!item.versions.some((version) => version.entries.some((entry) => !PINNED_ENTRY_IDS.has(entry.id)))} onClick={() => openSource(item)}>
                  <UserCircle size={19} /><strong>{item.name}</strong><small>{item.versions.length}{tUi(" 个版本")}</small><CaretRight size={15} />
                </button>
              ))}
              {loadingSources ? <div className="setting-library-manager-loading">{tUi("正在读取其他角色…")}</div> : null}
            </div>
          </section>
          <section className="setting-library-manager-card">
            <button type="button" className="setting-library-manager-row" onClick={() => requestFile({ type: "merge", expected: "auto" })}><FileText size={18} /><strong>{tUi("从本地文件")}</strong><CaretRight size={15} /></button>
          </section>
        </div>
      ) : pickedVersion ? (
        <div className="setting-library-manager-body setting-library-picker-body">
          {source.versions.length > 1 ? (
            <label className="setting-library-manager-field"><span>{tUi("来源版本")}</span><select value={pickedVersion.id} onChange={(event) => { setVersionId(event.target.value); setCheckedIds(new Set()); }}>
              {source.versions.map((version) => <option key={version.id} value={version.id}>{versionLabel(version)}</option>)}
            </select></label>
          ) : null}
          <div className="setting-library-picker-toolbar">
            <strong>{tUi("选择要并入的设定")}</strong>
            <button type="button" onClick={() => toggleEntries(selectableEntries.map((entry) => entry.id), checkedIds.size !== selectableEntries.length)}>{checkedIds.size === selectableEntries.length ? tUi("清空") : tUi("全选")}</button>
          </div>
          <section className="setting-library-manager-card setting-library-picker-list">
            {!rows.length ? <p>{tUi("这个版本没有可并入的设定。")}</p> : rows.map((row) => {
              if (row.kind === "entry") {
                const checked = checkedIds.has(row.value.id);
                return <div className="setting-library-picker-row" style={{ paddingLeft: 14 + row.depth * 18 }} key={`entry:${row.value.id}`}><TriCheckbox checked={checked} label={row.value.title} onChange={() => toggleEntries([row.value.id], !checked)} /><FileText size={16} /><span>{row.value.title || tUi("未命名设定")}</span></div>;
              }
              const ids = entryIdsUnder(pickedVersion.groups, pickedVersion.entries, row.value.id);
              const selectedCount = ids.filter((id) => checkedIds.has(id)).length;
              return <div className="setting-library-picker-row is-folder" style={{ paddingLeft: 14 + row.depth * 18 }} key={`group:${row.value.id}`}><TriCheckbox checked={Boolean(ids.length) && selectedCount === ids.length} mixed={selectedCount > 0 && selectedCount < ids.length} label={row.value.name} onChange={() => toggleEntries(ids, selectedCount !== ids.length)} /><FolderOpen size={16} /><strong>{row.value.name}</strong><small>{ids.length}</small></div>;
            })}
          </section>
          <label className="setting-library-manager-field"><span>{tUi("并入位置")}</span><select value={destinationGroupId} onChange={(event) => setDestinationGroupId(event.target.value)}>
            <option value="">{tUi("根目录")}</option>
            {flattenGroups(current.groups).map((group) => <option key={group.id} value={group.id}>{`${"　".repeat(group.depth)}${group.name}`}</option>)}
          </select></label>
          <Button data-dsh-control variant="outline" type="button" className="setting-library-merge-button" disabled={!checkedIds.size} onClick={prepareMerge}>{tUi("检查并入结果")}</Button>
        </div>
      ) : null}</EditorManagementModal>}
        {dialog === "import" ? <ImportTypeDialog onCancel={() => setDialog("")} onPick={(expected) => requestFile({ type: "import", expected })} /> : null}
        {mergePreview && pickedVersion ? <MergeConfirmDialog sourceName={source.name} version={pickedVersion} plan={mergePreview.plan} onCancel={() => setMergePreview(null)} onMerge={() => { onChange(mergePreview.library); setMergePreview(null); setCheckedIds(new Set()); setPage("home"); setNotice(tUi("已并入 {value0} 条设定，保存后生效", {value0: mergePreview.plan.entryCount})); }} /> : null}
    </>
  );
}
