import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { EditorVersionManager } from '../../../ui/ui/EditorVersionManager.jsx';
import { syncActiveVersion } from '../model/variableConfigEditing.js';
import { createVariableVersion, deleteActiveVariableVersion, serializeVariableConfig, switchVariableVersion } from '../model/variableConfigTransfer.js';

export function VariableConfigManager({ config, onChange, onClose, onImport, notice, error }) {
  const tUi = useProductTranslation();
  const current = syncActiveVersion(config);
  return <EditorVersionManager title={tUi("变量版本管理")} versions={current.versions} activeVersionId={current.activeVersionId} onClose={onClose}
    onSelect={id => onChange(switchVariableVersion(current, id))}
    onCopy={name => onChange(createVariableVersion(current, { name, sourceVersionId: current.activeVersionId }))}
    onCreate={name => onChange(createVariableVersion(current, { name, sourceVersionId: '' }))}
    onRename={name => onChange({ ...current, name, versions: current.versions.map(version => version.id === current.activeVersionId ? { ...version, name } : version) })}
    onDelete={() => onChange(deleteActiveVariableVersion(current))} onImport={onImport} notice={notice} error={error}
    onExport={() => {
      const active = current.versions.find(version => version.id === current.activeVersionId);
      const json = serializeVariableConfig({ ...current, versions: [active] });
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' })), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${(current.name || tUi("变量配置")).replace(/[\\/:*?"<>|]/g, '-')}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }} />;
}
