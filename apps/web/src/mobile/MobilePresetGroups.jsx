import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { useState } from 'react';
import { MobileHeader } from './MobileChrome.jsx';
import { MobileConfirm, MobileNameDialog, useMobileOperation } from './MobileLibraryChrome.jsx';
import { MobileLibraryIcon } from './MobileLibraryIcons.jsx';

export function MobilePresetGroups({ catalog, model, onClose, purpose }) {
  const tUi = useProductTranslation();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [remove, setRemove] = useState(null);
  const { busy, error, run } = useMobileOperation();
  const { groups, presets } = catalog;
  return <div className="mobile-root-page mobile-group-manager">
    <MobileHeader title={tUi("预设分组管理")} back={() => !busy && onClose()} />
    <div className="mobile-group-manager-actions"><button type="button" disabled={busy} onClick={() => setEditing({ id: '', name: '' })}><MobileLibraryIcon name="plus" />{tUi("添加分组")}</button><button type="button" disabled={busy || !groups.length} onClick={() => setDeleting(value => !value)}><MobileLibraryIcon name="trash" />{deleting ? tUi("完成删除") : tUi("删除分组")}</button></div>
    <div className="mobile-scroll mobile-group-manager-list"><div className="mobile-group-manager-all"><MobileLibraryIcon name="history" />{tUi("全部预设 (")}{presets.length})</div>
      {groups.map(group => <div className="mobile-group-manager-row" key={group.id}>
        <button type="button" className="mobile-group-manager-name" disabled={busy} onClick={() => setEditing(group)}>{group.name} ({presets.filter(item => item.libraryGroupId === group.id).length})</button>
        {deleting && <button type="button" className="mobile-group-manager-icon is-destructive" aria-label={tUi("删除分组 {value0}", {value0: group.name})} disabled={busy} onClick={() => setRemove(group)}><MobileLibraryIcon name="trash" /></button>}
      </div>)}{error && <p className="mobile-inline-error" role="alert">{error}</p>}
    </div>
    {editing && <MobileNameDialog title={editing.id ? tUi("重命名分组") : tUi("添加分组")} initialName={editing.name} onClose={() => setEditing(null)} onSave={name => editing.id ? model.renameGroup(editing.id, name) : model.createGroup(name, purpose)} />}
    {remove && <MobileConfirm title={tUi("删除分组？")} onClose={() => setRemove(null)} busy={busy} error={error} onConfirm={() => run(async () => { await model.deleteGroup(remove.id); setRemove(null); })}>“{remove.name}{tUi("”中的预设将移至未分组。")}</MobileConfirm>}
  </div>;
}
