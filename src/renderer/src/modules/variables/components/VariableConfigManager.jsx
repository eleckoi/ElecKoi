import { useRef, useState } from "react";
import { CheckIcon, ExportIcon, ImportIcon, PlusIcon, TrashIcon, XIcon } from "../../../ui/icons/index.jsx";
import {
  createVariableVersion,
  deleteActiveVariableVersion,
  importVariableConfig,
  serializeVariableConfig,
  switchVariableVersion,
} from "../model/variableConfigTransfer.js";

function downloadText(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function VariableConfigManager({ config, onChange, onClose, onError }) {
  const fileRef = useRef(null);
  const [dialog, setDialog] = useState("");
  const [notice, setNotice] = useState("");

  function createConfig() {
    onChange(createVariableVersion(config));
    setNotice("已新建空白变量配置，保存后生效。");
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      onChange(importVariableConfig(config, await file.text()));
      setNotice("已作为新版本导入，保存后生效。");
    } catch (error) {
      onError(error?.message || "导入变量配置失败");
    }
  }

  return (
    <div className="variable-manager-overlay" role="presentation" onMouseDown={onClose}>
      <aside className="variable-manager" role="dialog" aria-modal="true" aria-label="变量配置管理" onMouseDown={(event) => event.stopPropagation()}>
        <header className="variable-manager-header">
          <strong>变量配置管理</strong>
          <button type="button" aria-label="关闭变量配置管理" onClick={onClose}><XIcon size={18} /></button>
        </header>
        <div className="variable-manager-body">
        <section className="variable-manager-card variable-version-name-card">
          <label><span>当前版本名称</span><input maxLength={60} value={config.name} onChange={(event) => onChange({ ...config, name: event.target.value })} placeholder="待命名" /></label>
        </section>
        <section className="variable-manager-card">
          <h3>变量配置版本</h3>
          <div className="variable-manager-rows">
            {config.versions.map((version) => (
              <button key={version.id} type="button" className="variable-version-row" onClick={() => onChange(switchVariableVersion(config, version.id))}>
                <span>{version.id === config.activeVersionId ? <CheckIcon size={15} /> : null}</span>
                <strong>{version.name || "待命名"}</strong>
              </button>
            ))}
            <button type="button" className="variable-manager-row is-accent" onClick={createConfig}><PlusIcon size={17} /><strong>新建变量配置</strong></button>
          </div>
        </section>
        <section className="variable-manager-card">
          <h3>导入 · 导出</h3>
          <div className="variable-manager-rows">
            <button type="button" className="variable-manager-row" onClick={() => fileRef.current?.click()}><ImportIcon size={17} /><strong>导入为新版本</strong></button>
            <button type="button" className="variable-manager-row" onClick={() => downloadText(`${(config.name || "变量配置").replace(/[\\/:*?\"<>|]/g, "-")}.json`, serializeVariableConfig(config))}><ExportIcon size={17} /><strong>导出当前版本</strong></button>
          </div>
          <input ref={fileRef} className="variable-file-input" type="file" accept="application/json,.json" onChange={importFile} />
        </section>
        <section className="variable-manager-card">
          <button type="button" className="variable-manager-row is-danger" onClick={() => setDialog("delete")}><TrashIcon size={17} /><strong>删除当前变量配置</strong></button>
        </section>
        {notice ? <p className="variable-manager-notice" role="status">{notice}</p> : null}
        </div>

      {dialog === "delete" ? (
        <div className="setting-library-dialog-overlay" role="presentation" onMouseDown={() => setDialog("")}>
          <section className="setting-library-dialog" role="alertdialog" aria-modal="true" aria-labelledby="variable-delete-version-title" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id="variable-delete-version-title">删除当前版本？</h2>
            <p>删除会在点击顶部“保存”后生效。</p>
            <div><button type="button" onClick={() => setDialog("")}>取消</button><button type="button" className="is-destructive" onClick={() => { onChange(deleteActiveVariableVersion(config)); setDialog(""); }}>删除</button></div>
          </section>
        </div>
      ) : null}
      </aside>
    </div>
  );
}
