import { DesktopError } from '@shared/foundation/DesktopError';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, FilmStrip, MusicNote, Cube, Plus, ArrowSquareIn, ArrowSquareOut, MagnifyingGlass, SquaresFour, ListBullets, DotsThree, Copy, LinkSimple, PencilSimple, Trash, DownloadSimple, Check, X, CaretLeft, CaretRight, ListChecks, Eye, FolderOpen } from '../../ui/icons/interfaceIcons.jsx';
import { SystemBarOverlay } from '../../ui/ui/SystemBarOverlay.jsx';
import { useEditorPresentation } from '../../ui/ui/EditorPresentationContext.jsx';
import { EditorContextMenu, useEditorContextMenu } from '../../ui/ui/EditorContextMenu.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import { resolveFailure } from '../../utils/failureText.js';
import { characterAssetAccept } from '@shared/contracts/characterAssets';
import { characterAssetReference } from '@shared/foundation/characterAssetReference';
import { useCharacterAssets } from './useCharacterAssets.js';
import { AssetFolderVisual } from './AssetFolderVisual.jsx';
import { AssetLibraryToolbar, NewFolderIcon } from './AssetLibraryToolbar.jsx';
import { AssetMovePicker } from './AssetMovePicker.jsx';
import { AssetMenuPopover } from './AssetMenuPopover.jsx';
import './character-assets.css';
import '../../ui/styles/editor-heading.css';
const fileSize = size => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
const types = [
  { id: 'image', label: '图片', unit: '张', Icon: ImageIcon, accept: 'image/*' },
  { id: 'video', label: '视频', unit: '段', Icon: FilmStrip, accept: 'video/*' },
  { id: 'audio', label: '音频', unit: '段', Icon: MusicNote, accept: 'audio/*' },
  { id: 'model', label: '模型', unit: '个', Icon: Cube, accept: '.glb,.gltf,.obj,.fbx,.vrm,.zip' },
];
function IconButton({ Icon, label, onClick, active = false, className = '', ...rest }) {
  return <button type="button" className={`icon-button ${active ? 'is-active' : ''} ${className}`} aria-label={label} title={label} onClick={onClick} {...rest}><Icon size={18} /></button>;
}
function Action({ Icon, children, danger, onClick, ...rest }) {
  return <button type="button" role="menuitem" className={`menu-action${danger ? ' danger' : ''}`} onClick={onClick} {...rest}><Icon size={18} /><span>{children}</span></button>;
}
export function CharacterAssetLibrary({ characterId }) {
  const tUi = useProductTranslation();
  const library = useCharacterAssets(characterId), { items } = library;
  const folders = library.folders || [];
  const { registerBackHandler } = useEditorPresentation();
  const context = useEditorContextMenu();
  const [folderId, setFolderId] = useState(null), [view, setView] = useState('grid'), [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest'), [formats, setFormats] = useState([]), [size, setSize] = useState('medium');
  const [selecting, setSelecting] = useState(false), [selected, setSelected] = useState([]);
  const [menu, setMenu] = useState(null), [modal, setModal] = useState(null), [draft, setDraft] = useState('');
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const upload = useRef(null), modalInput = useRef(null), dialogRef = useRef(null), working = useRef(false), alive = useRef(true);
  const currentFolder = folders.find(folder => folder.id === folderId);
  const contents = useMemo(() => {
    const result = new Map();
    for (const file of items) { const group = result.get(file.folderId ?? null) || { files: [], folders: [] }; group.files.push(file); result.set(file.folderId ?? null, group); }
    for (const folder of folders) { const group = result.get(folder.parentId) || { files: [], folders: [] }; group.folders.push(folder); result.set(folder.parentId, group); }
    return result;
  }, [items, folders]);
  const visible = useMemo(() => {
    const matches = item => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    const compare = (a,b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? (b.size || 0) - (a.size || 0) : sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt);
    return [...folders.filter(folder => folder.parentId === folderId && matches(folder)).sort(compare).map(folder => ({ ...folder, isFolder: true })),
      ...items.filter(item => (item.folderId ?? null) === folderId && (!formats.length || formats.includes(item.type)) && matches(item)).sort(compare)];
  }, [items, folders, folderId, formats, query, sort]);
  const chosen = items.filter(item => selected.includes(item.id)), chosenFolders = folders.filter(folder => selected.includes(folder.id));
  const focused = modal?.item && [...items, ...folders].find(item => item.id === modal.item);
  const crumbs = [];
  for (let current = currentFolder; current; current = folders.find(folder => folder.id === current.parentId)) crumbs.unshift(current);
  const parts = ids => [ids.filter(id => items.some(item => item.id === id)), ids.filter(id => folders.some(folder => folder.id === id))];
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 2400); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (['rename', 'newFolder', 'renameFolder'].includes(modal?.kind)) modalInput.current?.focus(); }, [modal]);
  const closeLayer = () => { if (busy) return false; if (context.menu) context.close(); else if (modal) setModal(null); else if (menu) setMenu(null); else if (selecting) { setSelecting(false); setSelected([]); } else if (folderId) { enterFolder(currentFolder?.parentId ?? null); } else return false; return true; };
  useEffect(() => registerBackHandler?.(closeLayer), [registerBackHandler, context.menu, modal, menu, selecting, busy, folderId]);
  useEffect(() => {
    const previous = document.activeElement;
    const key = event => {
      if (event.key === 'Escape' && closeLayer()) { event.preventDefault(); event.stopPropagation(); }
      if (event.key === 'Tab' && modal) {
        const controls = [...(dialogRef.current?.querySelectorAll('button:not(:disabled),input,textarea,a[href],audio[controls],video[controls]') || [])];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    if (modal) requestAnimationFrame(() => (modalInput.current || dialogRef.current?.querySelector('button'))?.focus());
    return () => { window.removeEventListener('keydown', key); if (modal && previous?.isConnected) previous.focus(); };
  }, [context.menu, modal, menu, selecting, busy, folderId]);
  useEffect(() => { setSelected(current => current.filter(id => [...items, ...folders].some(item => item.id === id))); }, [library.revision]);
  useEffect(() => { if (folderId && !currentFolder && !library.loading) setFolderId(null); }, [library.revision, folderId, currentFolder, library.loading]);
  async function action(operation) {
    if (working.current) return false;
    working.current = true; setBusy(true); setError('');
    try { return await operation(); }
    catch (cause) { if (alive.current) setError(resolveFailure(cause, { fallback: tUi('资产操作失败，请重试。') }).text); return false; }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function enterFolder(id) { if (busy) return; context.close(); setFolderId(id); setQuery(''); setMenu(null); setSelected([]); setSelecting(false); }
  function toggle(id) { setSelected(all => all.includes(id) ? all.filter(value => value !== id) : [...all,id]); }
  function message(text) { if (alive.current) { setNotice(text); setMenu(null); } }
  function beginModal(kind,item) { context.close(); setMenu(null); setDraft(kind === 'newFolder' ? tUi('未命名文件夹') : ['rename', 'renameFolder'].includes(kind) ? [...items, ...folders].find(value => value.id === item)?.name || '' : ''); setModal({kind,item}); }
  async function copyReference(list) {
    const text = list.map(item => characterAssetReference(item.id)).join('\n');
    try { await navigator.clipboard.writeText(text); message(tUi('已复制引用')); }
    catch { setModal({kind:'reference',item:list[0]?.id,value:text}); setMenu(null); }
  }
  async function duplicate(list) { await action(async () => { await library.request('duplicate',list.map(item => item.id)); message(tUi('已复制')); }); }
  async function download(item) { await action(async () => {
    if (window.ElecKoiPlatform?.saveBytes) { const response=await fetch(item.src); if(!response.ok) throw new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, 'Asset download failed', { operation: 'read' }); await window.ElecKoiPlatform.saveBytes(item.name,new Uint8Array(await response.arrayBuffer()),item.mimeType); }
    else { const a=document.createElement('a'); a.href=item.src+'?download=1'; a.download=item.name; a.click(); }
    setMenu(null);
  }); }
  async function reveal(item) { await action(async () => { await library.request('reveal', item.id); setMenu(null); }); }
  function showFile(item) { if (selecting) toggle(item.id); else setModal({kind:'preview',item:item.id}); }
  function openUpload() { if (!busy) { context.close(); setMenu(null); upload.current.click(); } }
  function openContext(event) {
    if (busy || library.loading || modal || (event.target.closest('button,input,textarea,a,[role="menu"],.asset-card,.modal-backdrop') && !event.target.closest('.menu-dismiss'))) return;
    setMenu(null); context.open(event, { folderId });
  }
  async function receiveFiles(files) { const list=Array.from(files); upload.current.value=''; if(!list.length) return; await action(async () => { await library.upload(list, folderId); message(tUi('导入完成')); }); }
  async function saveDialog(event) { event.preventDefault(); if(!draft.trim()) return; await action(async () => { if (modal.kind === 'newFolder') await library.request('createFolder', draft.trim(), folderId); else await library.request(modal.kind, modal.item, draft.trim()); if(alive.current) setModal(null); }); }
  async function commitDelete() { await action(async () => { await library.request('delete', ...parts(modal.ids || [modal.item])); if(alive.current) setModal(null); message(tUi('已删除')); }); }
  const previewBody = item => item.type === 'image' ? <img src={item.src} alt={item.name} /> : item.type === 'audio' ? <div className="audio-preview"><MusicNote size={60} weight="light" /><audio controls src={item.src} /></div> : item.type === 'video' ? <video controls src={item.src} /> : <div className="model-preview"><Cube size={96} weight="thin" /><span>{item.name.split('.').at(-1).toUpperCase()}</span></div>;
  return <section className="character-asset-library editor-heading-surface" tabIndex={0} aria-label={tUi('资产库')} aria-busy={busy || library.loading} onContextMenu={openContext} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) openContext(event); }} onClickCapture={event => { if (busy) { event.preventDefault(); event.stopPropagation(); } }}>
      <header className="library-heading"><div className="library-title">{folderId && <IconButton Icon={CaretLeft} label={tUi('返回上一级')} onClick={() => enterFolder(currentFolder?.parentId ?? null)} />}<h1>{currentFolder?.name || tUi('资产库')}</h1></div>
        <div className="library-heading-tools"><label className="asset-search"><MagnifyingGlass size={17} /><input aria-label={tUi('搜索资产')} placeholder={tUi('搜索资产')} value={query} onChange={e => { setQuery(e.target.value); setSelected([]); }} /></label>
        <div className="view-switch" role="group" aria-label={tUi('显示方式')}><IconButton Icon={SquaresFour} label={tUi('网格视图')} active={view === 'grid'} onClick={() => setView('grid')} /><IconButton Icon={ListBullets} label={tUi('列表视图')} active={view === 'list'} onClick={() => setView('list')} /></div></div>
      </header>
      {(error || library.error) && <div className="asset-failure" role="alert">{error || library.error}<button type="button" onClick={() => action(async () => { setError(''); library.retry(); })}>{tUi('重试')}</button></div>}
      {library.progress && <div className="asset-upload-progress" role="status">{library.progress.name}<progress max={library.progress.total || 1} value={library.progress.loaded} /><span>{Math.round(library.progress.loaded / (library.progress.total || 1) * 100)}%</span></div>}
      <AssetLibraryToolbar menu={menu} setMenu={setMenu} formats={formats} setFormats={setFormats} sort={sort} setSort={setSort} size={size} setSize={setSize} newFolder={() => beginModal('newFolder')} upload={openUpload} />
      {folderId && <nav className="asset-breadcrumbs" aria-label={tUi('文件夹位置')}><button onClick={() => enterFolder(null)}>{tUi('资产库')}</button>{crumbs.map(folder => <React.Fragment key={folder.id}><CaretRight size={12} /><button aria-current={folder.id === folderId ? 'page' : undefined} onClick={() => enterFolder(folder.id)}>{folder.name}</button></React.Fragment>)}</nav>}
      {selecting && <div className="selection-toolbar"><button className="select-all" onClick={() => setSelected(selected.length === visible.length ? [] : visible.map(item => item.id))}><span className={`selection-box${visible.length && selected.length === visible.length ? ' checked' : ''}`}>{visible.length > 0 && selected.length === visible.length && <Check size={12} weight="bold" />}</span>{tUi('全选')}</button><span className="selection-count">{tUi('已选 {count} 项', {count:selected.length})}</span><div className="bulk-actions"><button disabled={!chosen.length || !!chosenFolders.length} onClick={() => copyReference(chosen)}><LinkSimple size={16} />{tUi('复制引用')}</button><button disabled={!chosen.length || !!chosenFolders.length} onClick={() => duplicate(chosen)}><Copy size={16} />{tUi('复制')}</button><button disabled={!selected.length} onClick={() => setModal({ kind: 'move', ids: selected })}><FolderOpen size={16} />{tUi('移动到')}</button><button className="danger" disabled={!selected.length} onClick={() => setModal({ kind: 'delete', ids: selected })}><Trash size={16} />{tUi('删除')}</button></div><button className="cancel-select" onClick={() => { setSelecting(false); setSelected([]); }}>{tUi('取消')}</button></div>}
      <div className={`asset-content ${view}`} data-size={size} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); receiveFiles(e.dataTransfer.files); }}>
        {visible.map(item => <article key={item.id} className={`asset-card${item.isFolder ? ' folder-card' : ''}${selected.includes(item.id) ? ' selected' : ''}`} data-asset-id={item.id}>
          <div className="asset-thumbnail-slot">{item.isFolder ? <AssetFolderVisual folder={item} files={contents.get(item.id)?.files || []} onEnter={id => selecting ? toggle(id) : enterFolder(id)} /> : <button type="button" className="asset-thumb" aria-label={tUi('预览 {name}', {name:item.name})} onClick={() => showFile(item)}>{item.type === 'image' ? <img src={item.src} alt="" loading="lazy" /> : React.createElement(types.find(type => type.id === item.type).Icon, {size:42,weight:'thin'})}</button>}
            {selecting && <button type="button" aria-label={tUi('选择 {name}', {name: item.name})} aria-pressed={selected.includes(item.id)} className={`selection-box thumb-check${selected.includes(item.id) ? ' checked' : ''}`} onClick={() => toggle(item.id)}>{selected.includes(item.id) && <Check size={14} weight="bold" />}</button>}
          </div>
          <div className="asset-card-name"><span title={item.name}>{item.name}</span><span className="asset-card-size">{item.isFolder ? (contents.get(item.id)?.files.length || 0) + (contents.get(item.id)?.folders.length || 0) ? tUi('{count} 项', {count: (contents.get(item.id)?.files.length || 0) + (contents.get(item.id)?.folders.length || 0)}) : tUi('暂无素材') : fileSize(item.size)}</span></div>
          {!selecting && <div className="menu-anchor item-menu-anchor"><IconButton Icon={DotsThree} label={tUi('{name}的更多操作', {name:item.name})} className="card-more" onClick={event => setMenu(menu?.item === item.id ? null : { kind: 'item', item: item.id, anchor:event.currentTarget })} />{menu?.kind === 'item' && menu.item === item.id && <AssetMenuPopover anchor={menu.anchor} align="end" label={tUi('{name}的更多操作', {name:item.name})} onClose={() => setMenu(null)}>
            {item.isFolder ? <Action Icon={FolderOpen} onClick={() => enterFolder(item.id)}>{tUi('打开')}</Action> : <><Action Icon={Eye} onClick={() => { setModal({ kind: 'preview', item: item.id }); setMenu(null); }}>{tUi('预览')}</Action><Action Icon={LinkSimple} onClick={() => copyReference([item])}>{tUi('复制引用')}</Action></>}
            <Action Icon={ListChecks} onClick={() => { setSelecting(true); setSelected([item.id]); setMenu(null); }}>{tUi('选择')}</Action>
            <Action Icon={PencilSimple} onClick={() => beginModal(item.isFolder ? 'renameFolder' : 'rename', item.id)}>{tUi('重命名')}</Action>
            <Action Icon={FolderOpen} onClick={() => { setModal({kind:'move',ids:[item.id]}); setMenu(null); }}>{tUi('移动到')}</Action>
            {!item.isFolder && <><Action Icon={Copy} onClick={() => duplicate([item])}>{tUi('复制一份')}</Action><Action Icon={DownloadSimple} onClick={() => download(item)}>{tUi('下载')}</Action>{library.canReveal && <Action Icon={ArrowSquareOut} onClick={() => reveal(item)}>{tUi('打开所在目录')}</Action>}</>}
            <div className="menu-divider" /><Action Icon={Trash} danger onClick={() => beginModal('delete', item.id)}>{tUi('删除')}</Action>
          </AssetMenuPopover>}</div>}
        </article>)}
        {!query && !library.loading && <div className="upload-card-wrap"><button type="button" className="upload-card" aria-label={tUi('添加文件')} onClick={openUpload}><div className="upload-thumb"><span className="upload-plus"><Plus size={24} weight="light" /></span></div><div className="upload-caption">{tUi('导入文件')}</div></button></div>}
        {!visible.length && query && <div className="search-empty"><MagnifyingGlass size={30} weight="light" /><span>{tUi('没有找到相关资产')}</span></div>}
      </div>
      <input ref={upload} type="file" className="file-input" aria-label={tUi('导入资产文件')} accept={characterAssetAccept} multiple onChange={e => receiveFiles(e.target.files)} />
    {context.menu && <EditorContextMenu menu={context.menu} label={tUi('资产库操作')} onClose={context.close} actions={[
      { label: tUi('导入文件'), icon: ArrowSquareIn, disabled: busy, run: openUpload },
      { label: tUi('新建文件夹'), icon: NewFolderIcon, disabled: busy, run: () => beginModal('newFolder') },
    ]} />}
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
    {modal && <SystemBarOverlay className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(null); }}><section role="dialog" aria-modal="true" aria-label={tUi(modal.kind === 'preview' ? '资产预览' : modal.kind === 'reference' ? '资产引用' : modal.kind === 'newFolder' ? '新建文件夹' : modal.kind === 'move' ? '移动到' : ['rename', 'renameFolder'].includes(modal.kind) ? '重命名' : '删除资产')} ref={dialogRef} className={`modal ${modal.kind === 'preview' ? 'preview-dialog' : ''}`}>
      <header className="modal-heading"><h2>{modal.kind === 'preview' || modal.kind === 'reference' ? focused?.name : tUi(modal.kind === 'newFolder' ? '新建文件夹' : modal.kind === 'move' ? '移动到' : ['rename', 'renameFolder'].includes(modal.kind) ? '重命名' : '删除资产')}</h2><IconButton Icon={X} label={tUi('关闭弹窗')} onClick={() => setModal(null)} /></header>
      {modal.kind === 'preview' && focused && <div className="preview-layout"><div className="preview-stage">{previewBody(focused)}</div><aside className="preview-details"><dl><div><dt>{tUi('类型')}</dt><dd>{tUi(types.find(t => t.id === focused.type)?.label)}</dd></div><div><dt>{tUi('大小')}</dt><dd>{fileSize(focused.size)}</dd></div>{focused.dimensions && <div><dt>{tUi('尺寸')}</dt><dd>{focused.dimensions}</dd></div>}</dl><label className="reference-field">{tUi('引用')}<input aria-label={tUi('资产引用地址')} value={`asset://${focused.id}`} readOnly /></label><div className="preview-actions"><button type="button" className="button primary" onClick={() => copyReference([focused])}><LinkSimple size={17} />{tUi('复制引用')}</button><button type="button" className="button" onClick={() => download(focused)}><DownloadSimple size={17} />{tUi('下载')}</button></div></aside></div>}
      {modal.kind === 'reference' && focused && <div className="dialog-body"><textarea autoFocus aria-label={tUi('资产引用地址')} value={modal.value || `asset://${focused.id}`} readOnly onFocus={e => e.target.select()} /></div>}
      {['rename', 'renameFolder', 'newFolder'].includes(modal.kind) && <form className="dialog-body" onSubmit={saveDialog}><label>{tUi('名称')}<input ref={modalInput} aria-label={tUi('资产名称')} value={draft} onChange={e => setDraft(e.target.value)} /></label><footer><button type="button" className="button" onClick={() => setModal(null)}>{tUi('取消')}</button><button type="submit" className="button primary" disabled={!draft.trim()}>{tUi('确定')}</button></footer></form>}
      {modal.kind === 'move' && <AssetMovePicker folders={folders} selectedFolders={parts(modal.ids)[1]} source={folderId} onCancel={() => setModal(null)} onMove={destination => action(async () => { await library.request('move', ...parts(modal.ids), destination); setModal(null); setSelected([]); setSelecting(false); message(tUi('已移动')); })} />}
      {modal.kind === 'delete' && <div className="dialog-body"><p>{modal.ids ? tUi("删除选中的 {count} 项资产？", {count:modal.ids.length}) : tUi("删除“{name}”？", {name:focused?.name})}</p><p>{tUi("文件夹内的内容也会删除，引用这些资产的前端将无法继续加载它们。")}</p><footer><button className="button" onClick={() => setModal(null)}>{tUi('取消')}</button><button className="button destructive" onClick={commitDelete}>{tUi('删除')}</button></footer></div>}
    </section></SystemBarOverlay>}
  </section>;
}
