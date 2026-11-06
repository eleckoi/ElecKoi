import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useRef, useState } from 'react';
import { EditorVersionManager } from '../../../ui/ui/EditorVersionManager.jsx';
import { syncActiveVersion } from '../model/variableConfigEditing.js';
import { createVariableVersion, deleteActiveVariableVersion, importVariableConfig, serializeVariableConfig, switchVariableVersion } from '../model/variableConfigTransfer.js';
import { resolveFailure } from '../../../utils/failureText.js';

export function VariableConfigManager({ config, onChange, onClose, onError }) {
  const tUi = useProductTranslation();
  const fileRef = useRef(null), [notice, setNotice] = useState('');
  const current = syncActiveVersion(config);
  return <EditorVersionManager title={tUi("变量版本管理")} versions={current.versions} activeVersionId={current.activeVersionId} onClose={onClose}
    onSelect={id => onChange(switchVariableVersion(current, id))}
    onCopy={name => onChange(createVariableVersion(current, { name, sourceVersionId: current.activeVersionId }))}
    onCreate={name => onChange(createVariableVersion(current, { name, sourceVersionId: '' }))}
    onRename={name => onChange({ ...current, name, versions: current.versions.map(version => version.id === current.activeVersionId ? { ...version, name } : version) })}
    onDelete={() => onChange(deleteActiveVariableVersion(current))} onImport={() => fileRef.current?.click()} notice={notice}
    onExport={() => {
      const active = current.versions.find(version => version.id === current.activeVersionId);
      const json = serializeVariableConfig({ ...current, versions: [active] });
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' })), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${(current.name || tUi("变量配置")).replace(/[\\/:*?"<>|]/g, '-')}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>
    <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try { onChange(importVariableConfig(current, await file.text())); setNotice(tUi("已作为新版本导入，保存后生效。")); }
      catch (cause) { onError(resolveFailure(cause, { fallback: tUi("导入变量配置失败") }).text); }
    }} />
  </EditorVersionManager>;
}
