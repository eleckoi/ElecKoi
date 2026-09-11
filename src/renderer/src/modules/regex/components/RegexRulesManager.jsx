import { useMemo, useState } from "react";
import { CopyIcon, ExportIcon, ImportIcon, PlusIcon, TrashIcon, XIcon } from "../../../ui/icons/index.jsx";
import {
  REGEX_SCOPES,
  applyRegexVersion,
  captureRegexVersion,
  deleteRegexRules,
  deleteRegexVersion,
  duplicateRegexRules,
  rulesForScope,
} from "../model/regexRulesEditing.js";

export function RegexRulesManager({ collection, onChange, onClose, onImport, onExport }) {
  const [tab, setTab] = useState("rules");
  const [selectedIds, setSelectedIds] = useState([]);
  const [importScope, setImportScope] = useState("Global");
  const [versionName, setVersionName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleRule(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setConfirmDelete(false);
  }

  function duplicateSelected() {
    if (!selectedIds.length) return;
    onChange(duplicateRegexRules(collection, selectedIds));
    setSelectedIds([]);
  }

  function deleteSelected() {
    if (!selectedIds.length) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onChange(deleteRegexRules(collection, selectedIds));
    setSelectedIds([]);
    setConfirmDelete(false);
  }

  function createVersion() {
    onChange(captureRegexVersion(collection, versionName));
    setVersionName("");
  }

  return (
    <div className="regex-manager-overlay" role="presentation" onMouseDown={onClose}>
      <section className="regex-manager" role="dialog" aria-modal="true" aria-labelledby="regex-manager-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <h2 id="regex-manager-title">正则管理</h2>
          <button type="button" aria-label="关闭" onClick={onClose}><XIcon size={19} /></button>
        </header>
        <nav aria-label="正则管理分类">
          <button type="button" aria-current={tab === "rules" ? "page" : undefined} onClick={() => setTab("rules")}>批量管理</button>
          <button type="button" aria-current={tab === "versions" ? "page" : undefined} onClick={() => setTab("versions")}>正则预设</button>
        </nav>

        {tab === "rules" ? (
          <div className="regex-manager-pane is-rules">
            <div className="regex-manager-transfer">
              <select value={importScope} onChange={(event) => setImportScope(event.target.value)} aria-label="导入到分类">
                {REGEX_SCOPES.map((scope) => <option key={scope.id} value={scope.id}>{scope.label}</option>)}
              </select>
              <button type="button" onClick={() => onImport(importScope)}><ImportIcon size={15} />导入</button>
              <button type="button" disabled={!selectedIds.length} onClick={() => onExport(selectedIds)}><ExportIcon size={15} />导出</button>
            </div>
            <div className="regex-manager-body">
              {REGEX_SCOPES.map((scope) => (
                <section key={scope.id} className="regex-manager-scope">
                  <h3>{scope.label}</h3>
                  {rulesForScope(collection, scope.id).map((rule) => (
                    <label key={rule.id}>
                      <input type="checkbox" checked={selected.has(rule.id)} onChange={() => toggleRule(rule.id)} />
                      <span>{rule.name.trim() || "未命名规则"}</span>
                    </label>
                  ))}
                  {!rulesForScope(collection, scope.id).length ? <p>暂无规则</p> : null}
                </section>
              ))}
            </div>
            <footer>
              <span>{selectedIds.length ? `已选择 ${selectedIds.length} 项` : ""}</span>
              <button type="button" disabled={!selectedIds.length} onClick={duplicateSelected}><CopyIcon size={15} />复制</button>
              <button type="button" className="is-destructive" disabled={!selectedIds.length} onClick={deleteSelected}><TrashIcon size={15} />{confirmDelete ? "确认删除" : "删除"}</button>
            </footer>
          </div>
        ) : (
          <div className="regex-manager-pane is-versions">
            <div className="regex-version-create">
              <input value={versionName} maxLength={60} placeholder="预设名称" onChange={(event) => setVersionName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createVersion(); }} />
              <button type="button" onClick={createVersion}><PlusIcon size={15} />新建</button>
            </div>
            <div className="regex-version-list">
              {collection.versions.map((version) => (
                <div key={version.id} className={collection.activeVersionId === version.id ? "is-active" : ""}>
                  <button type="button" onClick={() => onChange(applyRegexVersion(collection, version.id))}>
                    <span>{version.name}</span>
                  </button>
                  <button type="button" aria-label={`删除正则预设${version.name}`} onClick={() => onChange(deleteRegexVersion(collection, version.id))}><TrashIcon size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
