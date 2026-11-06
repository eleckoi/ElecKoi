import { useProductTranslation } from "../../app/i18n/ProductLocaleContext.jsx";
import { useRef, useState } from 'react';
import { EditorVersionManager } from './EditorVersionManager.jsx';
import { resolveFailure } from '../../utils/failureText.js';

export function EditorLibraryVersionManager({ title, versions, ownerScope, initialScope = ownerScope, ownerLabel, onClose, busy, extraActions = [] }) {
  const tUi = useProductTranslation();
  const [scope, setScope] = useState(initialScope), [error, setError] = useState('');
  const input = useRef(null);
  const current = versions.current(scope);
  const run = operation => { try { setError(''); operation(); } catch (cause) { setError(resolveFailure(cause, { fallback: tUi("版本操作失败") }).text); } };
  if (!current) return null;
  return <EditorVersionManager title={title} versions={current.versions} activeVersionId={current.activeVersionId}
    scopes={[{ id: ownerScope, label: ownerLabel }, { id: 'global', label: tUi("全局") }]} scope={scope} onScopeChange={setScope}
    onSelect={id => run(() => versions.select(scope, id))} onCopy={name => run(() => versions.create(scope, name, true))}
    onCreate={name => run(() => versions.create(scope, name))} onRename={name => run(() => versions.rename(scope, name))}
    onDelete={() => run(() => versions.remove(scope))} onClose={onClose} busy={busy}
    extraActions={extraActions.map(action => ({ ...action, onClick: () => action.onClick(scope) }))} error={error}
    onImport={() => input.current?.click()} onExport={() => run(() => {
      const { fileName, json } = versions.exportVersion(scope), url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    })}>
    <input ref={input} type="file" accept="application/json,.json" hidden onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try { const json = await file.text(); run(() => versions.importVersion(scope, json)); } catch (cause) { setError(resolveFailure(cause, { fallback: tUi("导入版本失败") }).text); }
    }} />
  </EditorVersionManager>;
}
