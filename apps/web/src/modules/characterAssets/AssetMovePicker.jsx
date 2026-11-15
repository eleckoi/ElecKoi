import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
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
  return <div className="move-picker">
    <div className="move-location">{current && <Button variant="ghost" aria-label={tUi('返回上一级')} onClick={() => setDestination(current.parentId)}><CaretLeft size={18} /></Button>}<span>{current?.name || tUi('资产库')}</span></div>
    <div className="move-folders">{folders.filter(folder => folder.parentId === destination && !excluded.has(folder.id)).map(folder => <Button key={folder.id} variant="ghost" onClick={() => setDestination(folder.id)}><FolderSimple size={20} /><span>{folder.name}</span><CaretRight size={16} /></Button>)}</div>
    <footer className="product-dialog-actions"><Button variant="outline" onClick={onCancel}>{tUi('取消')}</Button><Button variant="primary" disabled={destination === source || excluded.has(destination)} onClick={() => onMove(destination)}>{tUi('移到这里')}</Button></footer>
  </div>;
}
