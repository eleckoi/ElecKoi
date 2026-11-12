import { FileCode, FolderSimple, CaretRight } from '../../../ui/icons/interfaceIcons.jsx';
import { EditorSwitch } from '../../../ui/ui/EditorLibraryFields.jsx';
import { useProductTranslation } from '../../../app/i18n/ProductLocaleContext.jsx';
import { libraryKey } from '../model/scriptEditing.js';

export function ScriptWorkspaceList({ library, label, query, selection, multi, collapsed, onCollapse, busy, onSelect, onToggle, onToggleLibrary, onContextMenu, dragProps, nameDragProps, rootDragProps }) {
  const tUi = useProductTranslation(), key = libraryKey(library.scope, library.ownerId), search = query.trim().toLocaleLowerCase();
  const matches = item => !search || item.name.toLocaleLowerCase().includes(search);
  const visible = library.trees.filter(tree => tree.type === 'folder' || matches(tree));
  function row(item, parentEnabled = true, parentId = '') {
    const address = JSON.stringify([key, item.id]), folder = item.type === 'folder', closed = collapsed.has(address);
    return <div key={item.id} className={`rs-row script-list-row${parentId ? ' is-nested' : ''}${(multi.active ? multi.selected.has(address) : selection?.key === key && selection.id === item.id) ? ' is-selected' : ''}${!library.enabled || !item.enabled || !parentEnabled ? ' is-disabled' : ''}`}
      data-enabled={library.enabled && item.enabled && parentEnabled} {...dragProps(key, item, parentId)} onClick={() => onSelect({ key, id: item.id })} onContextMenu={event => onContextMenu(event, { key, id: item.id })}>
      {multi.active && <input type="checkbox" disabled={busy} checked={multi.selected.has(address)} aria-label={tUi('选择{value0}', { value0: item.name })} onClick={event => event.stopPropagation()} onChange={() => onSelect({ key, id: item.id })} />}
      {folder ? <button className="rs-folder-toggle" type="button" aria-label={closed ? tUi('展开{value0}', { value0: item.name }) : tUi('收起{value0}', { value0: item.name })} onClick={event => { event.stopPropagation(); onCollapse(address); }}><CaretRight size={12} className={closed ? '' : 'is-expanded'} /></button> : <span className="rs-row-indent" />}
      <button className="rs-row-main script-list-name" type="button" disabled={busy} {...nameDragProps(key, item)}>{folder ? <FolderSimple size={17} /> : <FileCode size={17} />}<span className="rs-row-name">{item.name || tUi('未命名脚本')}</span></button>
      {!multi.active && <EditorSwitch disabled={busy} label={tUi('启用{value0}', { value0: item.name })} checked={item.enabled} onChange={enabled => onToggle(key, item.id, enabled)} />}
    </div>;
  }
  return <section className={`rs-directory-library${!visible.length ? ' is-empty' : ''}`} aria-label={label} {...rootDragProps}>
    <header className="rs-library-heading" onContextMenu={event => onContextMenu(event, { key })}><span>{label}</span>{!multi.active && <EditorSwitch disabled={busy} label={tUi('启用{value0}', { value0: label })} checked={library.enabled} onChange={enabled => onToggleLibrary(key, enabled)} />}</header>
    <div role="tree" aria-label={tUi('脚本条目列表')}>{visible.map(tree => <div key={tree.id}>{row(tree)}{tree.type === 'folder' && (!collapsed.has(JSON.stringify([key, tree.id])) || multi.active || search) && tree.scripts.filter(matches).map(item => row(item, tree.enabled, tree.id))}</div>)}
    {!visible.length && <p className="rs-directory-empty">{search ? tUi('没有匹配的脚本') : tUi('暂无脚本')}</p>}</div>
  </section>;
}
