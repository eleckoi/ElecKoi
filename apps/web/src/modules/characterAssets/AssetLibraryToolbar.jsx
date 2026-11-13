import React from 'react';
import { CaretDown, Check, ArrowSquareIn } from '../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { AssetMenuPopover } from './AssetMenuPopover.jsx';

export function NewFolderIcon({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11V9.5A2.5 2.5 0 0 0 18 7h-5.2a2 2 0 0 1-1.5-.7l-1.1-1.2a2 2 0 0 0-1.5-.7H5A2.5 2.5 0 0 0 2.5 7v10A2.5 2.5 0 0 0 5 19.5h8"/><path d="M18.5 14v8m-4-4h8"/></svg>;
}

export function AssetLibraryToolbar({ menu, setMenu, formats, setFormats, sort, setSort, size, setSize, newFolder, upload }) {
  const tUi = useProductTranslation();
  const types = [['image', '图片'], ['video', '视频'], ['audio', '音频'], ['model', '模型']];
  const popup = (kind, label, contents) => <div className="menu-anchor">
    <button type="button" className="library-pill" aria-label={tUi(label)} aria-expanded={menu?.kind === kind} onClick={event => setMenu(menu?.kind === kind ? null : { kind, anchor:event.currentTarget })}>{tUi(label)}{kind === 'filter' && formats.length > 0 && <small>{formats.length}</small>}<CaretDown size={14} /></button>
    {menu?.kind === kind && <AssetMenuPopover anchor={menu.anchor} label={tUi(label)} onClose={() => setMenu(null)}>{contents}</AssetMenuPopover>}
  </div>;
  const choices = (options, value, change) => options.map(([id, label]) => <button key={id} type="button" className="menu-action" role="menuitemradio" aria-checked={value === id} onClick={() => { change(id); setMenu(null); }}><span>{tUi(label)}</span>{value === id && <Check size={16} />}</button>);
  return <div className="library-toolbar">
    <div className="library-filters">
      {popup('filter', '筛选', <><div className="menu-section-title">{tUi('类别')}</div>{types.map(([id, label]) => <button key={id} type="button" className="menu-action" role="menuitemcheckbox" aria-checked={formats.includes(id)} onClick={() => setFormats(formats.includes(id) ? formats.filter(value => value !== id) : [...formats, id])}><span>{tUi(label)}</span><span className={`selection-box${formats.includes(id) ? ' checked' : ''}`}>{formats.includes(id) && <Check size={12} />}</span></button>)}{formats.length > 0 && <><div className="menu-divider" /><button type="button" className="menu-action" role="menuitem" onClick={() => setFormats([])}>{tUi('清除筛选')}</button></>}</>)}
      {popup('sort', '排序', choices([['newest', '最新导入'], ['oldest', '最早导入'], ['name', '名称排序'], ['size', '文件大小']], sort, setSort))}
      {popup('size', '展示尺寸', choices([['small', '小'], ['medium', '中'], ['large', '大']], size, setSize))}
    </div>
    <div className="library-create-actions"><button type="button" className="library-pill" onClick={newFolder}><NewFolderIcon />{tUi('新建文件夹')}</button><button type="button" className="library-pill upload-file-button" onClick={upload}><ArrowSquareIn size={17} />{tUi('导入文件')}</button></div>
  </div>;
}
