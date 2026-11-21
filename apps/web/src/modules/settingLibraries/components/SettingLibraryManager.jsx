import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { saveSettingLibraryFile } from '../model/settingLibraryFileSave.js';
import { EditorSelect } from '../../../ui/ui/EditorSelect.jsx';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Avatar } from '../../../ui/ui/Avatar.jsx';
import { EditorManagementModal } from '../../../ui/ui/EditorCollectionControls.jsx';
import { EditorVersionManager } from '../../../ui/ui/EditorVersionManager.jsx';
import { EditorPickerButton, EditorPickerRows, EditorSearchPane, editorSearchMatches } from '../../../ui/ui/EditorSearchPicker.jsx';
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, CaretRight, Check, FileText, FolderOpen, Minus } from "../../../ui/icons/interfaceIcons.jsx";
import { ImportIcon } from "../../../ui/icons/index.jsx";
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
import { characterAvatar, characterName } from '../../../utils/characterDisplay.js';

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
  function visit(parentId, depth, parentPath) {
    const groups = (groupsByParent.get(parentId) || []).sort((a, b) => a.treeViewOrder - b.treeViewOrder);
    const entries = (entriesByGroup.get(parentId) || []).sort((a, b) => a.treeViewOrder - b.treeViewOrder);
    for (const group of groups) {
      const path = `${parentPath} ${group.name}`;
      result.push({ kind: "group", value: group, depth, searchText: path });
      visit(group.id, depth + 1, path);
    }
    for (const entry of entries) result.push({ kind: "entry", value: entry, depth, searchText: `${parentPath} ${entry.title}` });
  }
  visit("", 0, "");
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


export function SettingLibraryManager({ initialAction = 'manage', characterId, settingLibraries, library, onChange, onClose, onError }) {
  const tUi = useProductTranslation();
  const [page, setPage] = useState(initialAction === 'merge' ? 'sources' : 'home');
  const [notice, setNotice] = useState("");
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [sources, setSources] = useState([]);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceVersionQuery, setSourceVersionQuery] = useState("");
  const [entryQuery, setEntryQuery] = useState("");
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const [source, setSource] = useState(null);
  const [versionId, setVersionId] = useState("");
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [destinationGroupId, setDestinationGroupId] = useState("");
  const [mergePreview, setMergePreview] = useState(null);
  const fileInputRef = useRef(null);
  const fileActionRef = useRef(null);
  const sourceRequest = useRef(0);
  const current = useMemo(() => syncActiveVersion(library), [library]);
  const activeVersion = current.versions.find((version) => version.id === current.activeVersionId);
  const pickedVersion = source?.versions.find((version) => version.id === versionId);
  const rows = useMemo(() => pickedVersion ? pickerRows(pickedVersion) : [], [pickedVersion]);
  const visibleRows = useMemo(() => rows.filter(row => editorSearchMatches(entryQuery, row.searchText)), [entryQuery, rows]);
  const visibleEntryIds = visibleRows.filter(row => row.kind === "entry").map(row => row.value.id);
  const allVisibleChecked = visibleEntryIds.length > 0 && visibleEntryIds.every(id => checkedIds.has(id));

  useEffect(() => {
    if (page !== "sources") return undefined;
    const request = ++sourceRequest.current;
    setSourceBusy(true);
    setSourceError("");
    settingLibraries.listCharacters().then(collection => {
      if (request === sourceRequest.current) setSources(collection.items || []);
    }).catch(cause => {
      if (request === sourceRequest.current) setSourceError(resolveFailure(cause, { fallback: tUi("读取导入来源失败") }).text);
    }).finally(() => { if (request === sourceRequest.current) setSourceBusy(false); });
    return () => { sourceRequest.current++; };
  }, [page, characterId, settingLibraries, tUi]);

  const eligibleVersions = versions => versions.filter(version => version.entries.some(entry => !PINNED_ENTRY_IDS.has(entry.id)));
  const ownVersions = eligibleVersions(current.versions.filter(version => version.id !== current.activeVersionId));
  const sourceOptions = [
    ...(ownVersions.length ? [{ id: '__self__', label: tUi('当前角色的其他版本'), Icon: BookOpen, next: true }] : []),
    ...sources.filter(item => item.id !== characterId).map(item => ({
      id: item.id, label: characterName(item, tUi), avatar: characterAvatar(item), next: true,
    })),
  ].filter(item => editorSearchMatches(sourceQuery, item.label)).map(option => option.Icon ? option : {
    ...option, leading: <Avatar as="span" aria-hidden="true" className="editor-picker-avatar"
      name={option.label} src={option.avatar} loading="lazy" />,
  });

  function selectVersion(id) {
    if (id !== versionId) {
      setVersionId(id);
      setCheckedIds(new Set());
      setEntryQuery("");
    }
    setPage("picker");
  }

  function openSource(picked) {
    if (!picked.versions.length) return;
    setSource(picked);
    setDestinationGroupId("");
    setSourceVersionQuery("");
    if (picked.versions.length === 1) selectVersion(picked.versions[0].id);
    else { setVersionId(""); setPage("versions"); }
  }

  async function chooseSource(id) {
    setSourceError("");
    const option = sourceOptions.find(item => item.id === id);
    if (!option) return;
    if (id === '__self__') { openSource({ id, name: option.label, versions: ownVersions }); return; }
    const request = ++sourceRequest.current;
    setSourceBusy(true);
    try {
      const loaded = await settingLibraries.readUntracked(id);
      if (request !== sourceRequest.current) return;
      const versions = eligibleVersions(loaded.versions);
      if (versions.length) openSource({ id, name: option.label, versions });
      else setSourceError(tUi("这个角色没有可并入的设定。"));
    } catch (cause) {
      if (request === sourceRequest.current) setSourceError(resolveFailure(cause, { fallback: tUi("读取来源设定库失败") }).text);
    } finally { if (request === sourceRequest.current) setSourceBusy(false); }
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
        onClose();
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
    if (exporting) return;
    setExporting(true);
    setNotice('');
    setExportError('');
    try {
      onError("");
      const safeName = (current.name.trim() || "setting-library").replace(/[\\/:*?"<>|]/g, "-");
      const saved = await saveSettingLibraryFile(serializeSettingLibrary({ ...current, versions: [activeVersion] }), `${safeName}.json`);
      if (saved) setNotice(tUi("设定库已导出"));
    } catch (cause) {
      if (cause?.name !== "AbortError") {
        const message = resolveFailure(cause, { fallback: tUi("导出设定库失败") }).text;
        setExportError(message);
        onError(message);
      }
    } finally { setExporting(false); }
  }

  const title = tUi(page === 'sources' ? '并入设定库' : page === 'versions' ? '选择版本' : '选择设定');
  function goBack() {
    if (page === 'versions' && pickedVersion) { setPage('picker'); return; }
    if (page === 'sources') { onClose(); return; }
    setSource(null);
    setVersionId('');
    setPage('sources');
  }
  const footer = page === 'sources' ? <>
    <Button variant="outline" onClick={goBack}>{tUi('返回')}</Button>
    <Button variant="outline" icon={<FileText size={16} />} onClick={() => requestFile({ type: 'merge', expected: 'auto' })}>{tUi('从本地文件')}</Button>
  </> : <>
    {page === 'picker' && checkedIds.size > 0 && <span className="setting-library-import-selection" role="status">{tUi('已选 {value0} 条', { value0: checkedIds.size })}</span>}
    <Button variant="outline" onClick={goBack}>{tUi('返回')}</Button>
    {page === 'picker' && <Button variant="primary" disabled={!checkedIds.size} onClick={prepareMerge}>{tUi("检查并入结果")}</Button>}
  </>;

  return (
    <>
        <input ref={fileInputRef} className="setting-library-file-input" type="file" accept=".json,application/json" onChange={handleFile} />
      {initialAction === 'import' ? <ImportTypeDialog onCancel={onClose} onPick={expected => requestFile({ type: "import", expected })} /> :
        page === "home" ? <EditorVersionManager title={tUi("版本管理")} versions={current.versions} activeVersionId={current.activeVersionId}
        onClose={onClose} notice={notice} error={exportError} busy={exporting} onSelect={id => onChange(switchLibraryVersion(current, id))}
        onCopy={name => onChange(createLibraryVersion(current, name, current.activeVersionId))}
        onCreate={name => onChange(createLibraryVersion(current, name, ''))}
        onRename={name => onChange(renameActiveVersion(current, name))} onDelete={() => onChange(deleteActiveLibraryVersion(current))}
        onExport={exportLibrary} /> :
        <EditorManagementModal title={title} className="editor-search-modal" footer={footer} onClose={goBack}>
        {page === "sources" ? (
        <EditorSearchPane key="sources" query={sourceQuery} onQueryChange={setSourceQuery} label={tUi('搜索角色')}>
          <EditorPickerRows options={sourceOptions} busy={sourceBusy} error={sourceError}
            onSelect={id => void chooseSource(id)} empty={tUi('没有匹配的角色')} />
        </EditorSearchPane>
      ) : page === 'versions' ? (
        <EditorSearchPane key="versions" query={sourceVersionQuery} onQueryChange={setSourceVersionQuery} label={tUi('搜索版本')}>
          <EditorPickerRows selectedId={versionId} onSelect={selectVersion} empty={tUi('没有匹配的版本')}
            options={source.versions.map(version => ({ id: version.id, label: versionLabel(version), next: true }))
              .filter(option => editorSearchMatches(sourceVersionQuery, option.label))} />
        </EditorSearchPane>
      ) : pickedVersion ? (
        <div className="setting-library-import-picker">
          <div className="setting-library-import-context">
            {source.versions.length > 1 && (
              <EditorPickerButton label={tUi('来源版本')} onClick={() => { setSourceVersionQuery(''); setPage('versions'); }}>{versionLabel(pickedVersion)}</EditorPickerButton>
            )}
            <div className="setting-library-import-location"><span>{tUi("并入位置")}</span><EditorSelect label={tUi("并入位置")} value={destinationGroupId} onChange={setDestinationGroupId}
              options={[{ value: '', label: tUi("根目录") }, ...flattenGroups(current.groups).map(group => ({ value: group.id, label: `${"　".repeat(group.depth)}${group.name}` }))]} /></div>
          </div>
          <EditorSearchPane key="entries" query={entryQuery} onQueryChange={setEntryQuery} label={tUi('搜索设定')}
            toolbar={<Button variant="ghost" disabled={!visibleEntryIds.length}
              onClick={() => toggleEntries(visibleEntryIds, !allVisibleChecked)}>{tUi(allVisibleChecked ? '清空' : '全选')}</Button>}>
            <section className="setting-library-import-rows">
            {!visibleRows.length ? <p className="editor-picker-message" role="status">{tUi(entryQuery.trim() ? '没有匹配的设定' : '这个版本没有可并入的设定。')}</p> : visibleRows.map((row) => {
              if (row.kind === "entry") {
                const checked = checkedIds.has(row.value.id);
                return <div className="setting-library-picker-row" style={{ paddingLeft: 14 + row.depth * 18 }} key={`entry:${row.value.id}`}><TriCheckbox checked={checked} label={row.value.title} onChange={() => toggleEntries([row.value.id], !checked)} /><FileText size={16} /><span>{row.value.title || tUi("未命名设定")}</span></div>;
              }
              const ids = entryIdsUnder(pickedVersion.groups, pickedVersion.entries, row.value.id);
              const selectedCount = ids.filter((id) => checkedIds.has(id)).length;
              return <div className="setting-library-picker-row is-folder" style={{ paddingLeft: 14 + row.depth * 18 }} key={`group:${row.value.id}`}><TriCheckbox checked={Boolean(ids.length) && selectedCount === ids.length} mixed={selectedCount > 0 && selectedCount < ids.length} label={row.value.name} onChange={() => toggleEntries(ids, selectedCount !== ids.length)} /><FolderOpen size={16} /><strong>{row.value.name}</strong><small>{ids.length}</small></div>;
            })}
            </section>
          </EditorSearchPane>
        </div>
      ) : null}</EditorManagementModal>}
        {mergePreview && pickedVersion ? <MergeConfirmDialog sourceName={source.name} version={pickedVersion} plan={mergePreview.plan} onCancel={() => setMergePreview(null)}
          onMerge={() => { onChange(mergePreview.library); onClose(); }} /> : null}
    </>
  );
}
