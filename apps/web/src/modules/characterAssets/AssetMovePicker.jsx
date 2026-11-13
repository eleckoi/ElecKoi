import React, { useMemo, useState } from 'react';
import { FolderSimple, CaretLeft, CaretRight } from '../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';

export function AssetMovePicker({ folders, selectedFolders, source, onMove, onCancel }) {
  const tUi = useProductTranslation(), [destination, setDestination] = useState(source);
  const excluded = useMemo(() => {
    const result = new Set(selectedFolders), children = new Map();
    for (const folder of folders) { const list = children.get(folder.parentId) || []; list.push(folder.id); children.set(folder.parentId, list); }
    const queue = [...result];
    for (let i = 0; i < queue.length; i++) for (const id of children.get(queue[i]) || []) { if (!result.has(id)) { result.add(id); queue.push(id); } }
    return result;
  }, [folders, selectedFolders]);
  const current = folders.find(folder => folder.id === destination);
  return <div className="dialog-body move-picker">
    <div className="move-location">{current && <button type="button" className="icon-button" aria-label={tUi('返回上一级')} onClick={() => setDestination(current.parentId)}><CaretLeft size={18} /></button>}<span>{current?.name || tUi('资产库')}</span></div>
    <div className="move-folders">{folders.filter(folder => folder.parentId === destination && !excluded.has(folder.id)).map(folder => <button key={folder.id} type="button" onClick={() => setDestination(folder.id)}><FolderSimple size={20} /><span>{folder.name}</span><CaretRight size={16} /></button>)}</div>
    <footer><button type="button" className="button" onClick={onCancel}>{tUi('取消')}</button><button type="button" className="button primary" disabled={destination === source || excluded.has(destination)} onClick={() => onMove(destination)}>{tUi('移到这里')}</button></footer>
  </div>;
}
