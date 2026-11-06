import { useProductTranslation } from "../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useRef, useState } from 'react';
import { characterGroup, characterName } from '../utils/characterDisplay.js';
import { MobileHeader, MobileSearch, useMobileBack } from './MobileChrome.jsx';
import { MobileConfirm, MobileNameDialog, MobileSelectionHeader, useMobileOperation } from './MobileLibraryChrome.jsx';
import { MobileLibraryIcon } from './MobileLibraryIcons.jsx';

export function MobileCharacterGroups({ groups, characters, persona, onSave, onClose, renderGrid }) {
  const tUi = useProductTranslation();
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [remove, setRemove] = useState('');
  const [membership, setMembership] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [dropTarget, setDropTarget] = useState('');
  const drag = useRef(null);
  const { busy, error, run } = useMobileOperation();
  useMobileBack(() => { if (!busy) { setMembership(null); setDeleting(false); } return true; }, Boolean(membership || deleting));
  async function saveName(value) {
    if (groups.includes(value) && value !== editing) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, '分组名称已存在', { what: '分组' });
    const next = editing ? groups.map(name => name === editing ? value : name) : [...groups, value];
    const assignments = editing ? characters.filter(item => characterGroup(item) === editing).map(item => ({ characterId: item.id, group: value })) : [];
    await onSave(next, assignments);
  }
  async function deleteGroup() {
    await run(async () => {
      const next = groups.filter(name => name !== remove);
      const assignments = characters.filter(item => characterGroup(item) === remove).map(item => ({ characterId: item.id, group: next[0] || '' }));
      await onSave(next, assignments); setRemove('');
    });
  }
  function reorder(source, target) {
    if (!source || source === target || busy) return;
    const next = groups.filter(name => name !== source);
    next.splice(groups.indexOf(target), 0, source);
    return run(() => onSave(next));
  }
  function dragTarget(clientY) {
    return [...document.querySelectorAll('[data-character-group]')].find(row => { const rect = row.getBoundingClientRect(); return clientY >= rect.top && clientY <= rect.bottom; })?.dataset.characterGroup;
  }
  function openMembership(name) {
    setMembership(name); setKeyword(''); setSelectedIds(characters.filter(item => characterGroup(item) === name).map(item => item.id));
  }
  async function saveMembership() {
    await run(async () => {
      const assignments = characters.filter(item => selectedIds.includes(item.id) || characterGroup(item) === membership)
        .map(item => ({ characterId: item.id, group: selectedIds.includes(item.id) ? membership : '' }));
      await onSave(groups, assignments); setMembership(null);
    });
  }
  if (membership) {
    const visible = characters.filter(item => !keyword || characterName(item, tUi).toLocaleLowerCase().includes(keyword.toLocaleLowerCase()));
    return <div className="mobile-root-page mobile-group-manager">
      <MobileHeader title={membership} back={() => { if (!busy) setMembership(null); }}><button type="button" disabled={busy} onClick={saveMembership}>{tUi("保存")}</button></MobileHeader>
      <MobileSearch label={tUi("搜索角色名称")} value={keyword} onChange={setKeyword} />
      <MobileSelectionHeader title={tUi("选择角色")} busy={busy} onAll={() => setSelectedIds([...new Set([...selectedIds, ...visible.map(item => item.id)])])} onCancel={() => setMembership(null)} />
      {renderGrid({ characters: visible, persona, selection: 'group', selectedIds, onClick: item => !busy && setSelectedIds(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id]) })}
      {error && <p className="mobile-inline-error" role="alert">{error}</p>}
    </div>;
  }
  return <div className="mobile-root-page mobile-group-manager">
    <MobileHeader title={tUi("角色分组管理")} back={() => !busy && onClose()} />
    <div className="mobile-group-manager-actions"><button type="button" disabled={busy} onClick={() => setEditing('')}><MobileLibraryIcon name="plus" />{tUi("添加分组")}</button><button type="button" disabled={busy || !groups.length} onClick={() => setDeleting(value => !value)}><MobileLibraryIcon name="trash" />{deleting ? tUi("完成删除") : tUi("删除分组")}</button></div>
    <div className="mobile-scroll mobile-group-manager-list">
      <div className="mobile-group-manager-all"><MobileLibraryIcon name="history" /><span>{tUi("全部角色 (")}{characters.length})</span></div>
      {groups.map((name, index) => <div className="mobile-group-manager-row" data-character-group={name} data-drop-target={dropTarget === name || undefined} key={name}>
        <button type="button" className="mobile-group-drag" aria-label={tUi("调整分组 {value0} 的顺序", {value0: name})} disabled={busy}
          onKeyDown={event => { const target = event.key === 'ArrowUp' ? groups[index - 1] : event.key === 'ArrowDown' ? groups[index + 1] : null; if (target) { event.preventDefault(); reorder(name, target); } }}
          onPointerDown={event => { if (busy) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = name; }}
          onPointerMove={event => { if (drag.current) setDropTarget(dragTarget(event.clientY) || ''); }}
          onPointerUp={event => { const source = drag.current; drag.current = null; setDropTarget(''); const target = dragTarget(event.clientY); if (target) reorder(source, target); }}
          onPointerCancel={() => { drag.current = null; setDropTarget(''); }}><svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">{[5,13].flatMap(x => [4,9,14].map(y => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />))}</svg></button>
        <button type="button" className="mobile-group-manager-name" disabled={busy} onClick={() => setEditing(name)}>{name} ({characters.filter(item => characterGroup(item) === name).length})</button>
        {deleting ? <button type="button" className="mobile-group-manager-icon is-destructive" aria-label={tUi("删除分组 {value0}", {value0: name})} disabled={busy} onClick={() => setRemove(name)}><MobileLibraryIcon name="trash" /></button>
          : <button type="button" className="mobile-group-manager-icon" aria-label={tUi("管理分组 {value0} 的角色", {value0: name})} disabled={busy} onClick={() => openMembership(name)}><MobileLibraryIcon name="plus" /></button>}
      </div>)}
      {error && <p className="mobile-inline-error" role="alert">{error}</p>}
    </div>
    {editing !== null && <MobileNameDialog title={editing ? tUi("重命名分组") : tUi("添加分组")} initialName={editing} onClose={() => setEditing(null)} onSave={saveName} />}
    {remove && <MobileConfirm title={tUi("删除分组？")} onClose={() => setRemove('')} onConfirm={deleteGroup} busy={busy} error={error}>“{remove}{tUi("”中的角色将移至")}{groups.filter(name => name !== remove)[0] ? `“${groups.filter(name => name !== remove)[0]}”` : tUi("未分组")}。</MobileConfirm>}
  </div>;
}
