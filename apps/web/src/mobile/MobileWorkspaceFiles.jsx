import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLineRight } from '@phosphor-icons/react';
import {
  Button, Input, IconCheckOutlineRegular as Check, IconChecklistOutlineRegular as Select,
  IconChevronRightOutlineRegular as Chevron, IconChevronsUpDownOutlineRegular as Sort,
  IconCodeOutlineRegular as Code, IconCopyOutlineRegular as Copy, IconDownloadOutlineRegular as Import,
  IconEditOutlineRegular as Edit, IconFolderCloseRegular as Folder, IconFolderOpenOutlineRegular as OpenFolder,
  IconPlanOutlineRegular as Document, IconProjectAddOutlineRegular as NewFolder,
  IconTrashOutlineRegular as Trash, IconUploadOutlineRegular as Export,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../app/i18n/ProductLocaleContext.jsx';
import { useMainPageView } from '../app/windows/MainPageContext.jsx';
import { FailureAlert } from '../ui/ui/FailureAlert.jsx';
import { MobileDialog, MobileHeader, useMobileBack } from './MobileChrome.jsx';
import { exportWorkspaceFiles, importWorkspaceFile } from './workspaceFileTransfers.js';
import './mobile-workspace-files.css';

const emptySubscription = () => () => {};
const closedRightbar = () => false;
const textExtension = /\.(js|mjs|cjs|ts|jsx|tsx|css|html|json|py|sh)$/i;
const selectionOf = ({ name, version }) => ({ name, version });
const sameDirectory = (a, b) => a.length === b.length && a.every((part, i) => part === b[i]);

function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function WorkspaceFileRow({ entry, selecting, checked, onSelect, onOpen }) {
  const t = useProductTranslation();
  const press = useRef(null);
  const handled = useRef(false);
  const folder = entry.kind === 'directory';
  function clear() {
    clearTimeout(press.current?.timer);
    press.current = null;
  }
  useEffect(() => clear, []);
  const icon = folder ? <Folder size={27} /> : textExtension.test(entry.name) ? <Code size={25} /> : <Document size={25} />;
  const metadata = folder ? t('文件夹') : entry.kind === 'file' ? fileSize(entry.bytes) : t('特殊文件');
  return <li className="wf-entry" data-selected={checked || undefined}>
    <button type="button" className="wf-row" disabled={entry.kind === 'other'}
      aria-label={selecting ? t('选择{value0}', { value0: ` ${entry.name}` }) : entry.name}
      aria-pressed={selecting ? checked : undefined}
      onPointerDown={event => {
        handled.current = false;
        if (selecting || event.button !== 0) return;
        const { clientX: x, clientY: y } = event;
        press.current = { x, y, pointer: event.pointerId, timer: setTimeout(() => {
          press.current = null;
          handled.current = true;
          onSelect();
        }, 480) };
      }}
      onPointerMove={event => {
        const pending = press.current;
        if (pending?.pointer === event.pointerId && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 9) clear();
      }}
      onPointerUp={clear} onPointerCancel={clear} onPointerLeave={clear}
      onContextMenu={event => {
        event.preventDefault();
        clear();
        if (!handled.current && !selecting) { handled.current = true; onSelect(); }
      }}
      onClick={event => {
        if (event.detail && handled.current) { handled.current = false; return; }
        if (selecting) onSelect();
        else onOpen();
      }}>
      {selecting && <span className="wf-check" aria-hidden="true"><span><Check size={14} /></span></span>}
      <span className="wf-type" data-document={!folder || undefined}>{icon}</span>
      <span className="wf-caption"><strong>{entry.name}</strong><small>{new Date(entry.modifiedAt).toLocaleString()}</small></span>
      <span className="wf-detail">{metadata}</span>
      {folder && <Chevron size={16} className="wf-chevron" />}
    </button>
  </li>;
}

function FileAction({ icon: Icon, children, onClick, disabled, danger }) {
  return <button type="button" className="wf-action" data-danger={danger || undefined} onClick={onClick} disabled={disabled}>
    <Icon size={24} aria-hidden="true" /><span>{children}</span>
  </button>;
}

function useDirectory(model, sessionId, path, revision) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    if (!model) return undefined;
    const controller = new AbortController();
    setState(previous => previous.path === path && previous.status === 'ready' ? previous : { status: 'loading', path });
    model.listWorkspaceFiles(sessionId, path, controller.signal).then(
      value => { if (!controller.signal.aborted) setState({ status: 'ready', path, value }); },
      error => { if (!controller.signal.aborted) setState({ status: 'error', path, error }); },
    );
    return () => controller.abort();
  }, [model, sessionId, path, revision]);
  return state.path === path ? state : { status: 'loading' };
}

function PathBar({ name, path, onChange, disabled }) {
  const t = useProductTranslation();
  return <nav className="wf-path" aria-label={t('当前位置')}>
    <button type="button" disabled={disabled} aria-current={path.length ? undefined : 'page'} onClick={() => onChange([])}>
      <OpenFolder size={17} /><span>{name || t('工作区')}</span>
    </button>
    {path.map((part, index) => <span className="wf-path-part" key={index}><Chevron size={12} />
      <button type="button" disabled={disabled} aria-current={index === path.length - 1 ? 'page' : undefined}
        onClick={() => onChange(path.slice(0, index + 1))}>{part}</button>
    </span>)}
  </nav>;
}

export function MobileWorkspaceFiles({ model, sessionId }) {
  const t = useProductTranslation();
  const view = useMainPageView();
  const [path, setPath] = useState([]);
  const [selection, setSelection] = useState(null);
  const [reverse, setReverse] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const input = useRef(null);
  const operation = useRef(null);
  const state = useDirectory(model, sessionId, path, revision);
  const rightbar = useSyncExternalStore(view.rightbar?.subscribe ?? emptySubscription, view.rightbar?.getSnapshot ?? closedRightbar);
  const controls = globalThis.ElecKoiPlatform;
  const entries = [...state.value?.entries ?? []].sort((a, b) =>
    Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
    a.name.localeCompare(b.name, undefined, { numeric: true }) * (reverse ? -1 : 1));
  const selectable = entries.filter(entry => entry.kind !== 'other');
  const allSelected = selectable.length > 0 && selectable.every(entry => selection?.some(item => item.name === entry.name && item.version === entry.version));
  const selected = selection ?? [];
  const reload = () => setRevision(value => value + 1);

  useEffect(() => () => operation.current?.abort(), []);
  function navigate(next) { setPath(next); setSelection(null); setError(null); }
  function back() {
    if (rightbar?.shown) return false;
    if (busy) return true;
    if (selection !== null) { setSelection(null); return true; }
    if (path.length) { navigate(path.slice(0, -1)); return true; }
    return false;
  }
  useMobileBack(back);
  function toggle(entry) {
    setError(null);
    setSelection(previous => {
      const other = previous?.filter(item => item.name !== entry.name) ?? [];
      return previous?.some(item => item.name === entry.name && item.version === entry.version)
        ? other : [...other, selectionOf(entry)];
    });
  }
  function show(kind) { setError(null); setDialog(kind); }

  async function run(kind, action) {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setError(null);
    setBusy(kind);
    try {
      const reply = await action(controller.signal);
      if (controller.signal.aborted) return;
      if (!reply?.cancelled) {
        setDialog(null);
        setSelection(null);
        reload();
      }
    } catch (failure) {
      if (!controller.signal.aborted) { setError(failure); reload(); }
    } finally {
      if (operation.current === controller) operation.current = null;
      if (!controller.signal.aborted) setBusy('');
    }
  }
  function edit(edit) { return run(edit.kind, signal => model.editWorkspaceFiles(sessionId, path, edit, signal)); }
  function picked(event) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    void run('import', async signal => {
      for (const file of files) await importWorkspaceFile(model, sessionId, path, file, signal);
    });
  }
  function openEntry(entry) {
    const next = [...path, entry.name];
    if (entry.kind === 'directory') navigate(next);
    else if (entry.address) view.rightbar?.openWorkspaceResource?.(sessionId, entry.address);
  }
  return <section className="wf mobile-root-page">
    {selection === null ? <MobileHeader title={t('工作区文件')} back={view.goBack}>
      <button type="button" aria-label={t('多选')} disabled={Boolean(busy) || !selectable.length}
        onClick={() => { setError(null); setSelection([]); }}><Select size={22} /></button>
    </MobileHeader> : <header className="wf-selection-header">
      <button type="button" disabled={Boolean(busy) || !selectable.length}
        onClick={() => setSelection(allSelected ? [] : selectable.map(selectionOf))}>{allSelected ? t('取消全选') : t('全选')}</button>
      <h1 aria-live="polite">{t('已选择 {value0} 项', { value0: selected.length })}</h1>
      <button type="button" disabled={Boolean(busy)} onClick={() => { setError(null); setSelection(null); }}>{t('取消')}</button>
    </header>}
    <PathBar name={state.value?.name} path={path} onChange={navigate} disabled={Boolean(busy) || selection !== null} />
    <div className="wf-tools">
      <button className="wf-sort" type="button" onClick={() => setReverse(value => !value)}>{t('名称')} {reverse ? 'Z–A' : 'A–Z'}<Sort size={15} /></button>
      {selection === null && <div className="wf-create">
        <button type="button" disabled={Boolean(busy) || state.status !== 'ready'} onClick={() => input.current?.click()}><Import size={19} />{t('导入')}</button>
        <button type="button" disabled={Boolean(busy) || state.status !== 'ready'} onClick={() => show('mkdir')}><NewFolder size={19} />{t('新建文件夹')}</button>
      </div>}
      <input ref={input} type="file" multiple hidden onChange={picked} />
    </div>
    <div className="wf-scroll" aria-busy={Boolean(busy) || state.status === 'loading'} inert={busy ? true : undefined}>
      <FailureAlert className="wf-error" failure={state.error} onRetry={reload} />
      {!dialog && <FailureAlert className="wf-error" failure={error} />}
      {state.status === 'loading' && <p className="wf-empty" role="status">{t('正在加载…')}</p>}
      {state.status === 'ready' && (entries.length ? <ul className="wf-list">
        {entries.map(entry => <WorkspaceFileRow key={entry.name} entry={entry} selecting={selection !== null}
          checked={selected.some(item => item.name === entry.name && item.version === entry.version)}
          onSelect={() => toggle(entry)} onOpen={() => openEntry(entry)} />)}
      </ul> : <p className="wf-empty" role="status">{t('文件夹为空')}</p>)}
    </div>
    {busy && <p className="wf-notice" role="status">{t('正在处理…')}</p>}
    {selection !== null && <div className="wf-bottom" role="group" aria-label={t('选中文件操作')}>
      <FileAction icon={Edit} disabled={Boolean(busy) || selected.length !== 1} onClick={() => show('rename')}>{t('重命名')}</FileAction>
      <FileAction icon={Copy} disabled={Boolean(busy) || !selected.length} onClick={() => show('copy')}>{t('复制')}</FileAction>
      <FileAction icon={ArrowLineRight} disabled={Boolean(busy) || !selected.length} onClick={() => show('move')}>{t('移动')}</FileAction>
      <FileAction icon={Trash} disabled={Boolean(busy) || !selected.length} danger onClick={() => show('delete')}>{t('删除')}</FileAction>
      <FileAction icon={Export} disabled={Boolean(busy) || !selected.length || !controls?.saveStream}
        onClick={() => void run('export', signal => exportWorkspaceFiles(model, sessionId, path, selected, controls, signal))}>{t('导出')}</FileAction>
    </div>}
    {dialog && <WorkspaceFileDialog kind={dialog} model={model} sessionId={sessionId} path={path} entries={selected}
      onSubmit={edit} busy={Boolean(busy)} failure={error} onClose={() => { setDialog(null); setError(null); }} />}
  </section>;
}

function WorkspaceFileDialog({ kind, model, sessionId, path, entries, onSubmit, busy, failure, onClose }) {
  const t = useProductTranslation();
  const [name, setName] = useState(kind === 'rename' ? entries[0].name : '');
  const [destination, setDestination] = useState(path);
  const [revision, setRevision] = useState(0);
  const transfer = kind === 'copy' || kind === 'move';
  const status = useDirectory(transfer ? model : null, sessionId, destination, revision);
  const title = { mkdir: t('新建文件夹'), rename: t('重命名'), delete: t('确认删除'), copy: t('复制到'), move: t('移动到') }[kind];
  const confirm = { mkdir: t('新建'), rename: t('保存'), delete: t('删除'), copy: t('复制到这里'), move: t('移动到这里') }[kind];
  const invalidDestination = entries.some(entry => destination.length > path.length && sameDirectory(destination.slice(0, path.length), path) && destination[path.length] === entry.name);
  const nameField = kind === 'rename' || kind === 'mkdir';
  const ready = nameField ? Boolean(name.trim()) : !transfer || status.status === 'ready' && !invalidDestination && (kind !== 'move' || !sameDirectory(destination, path));
  function submit(event) {
    event.preventDefault();
    if (busy || !ready) return;
    if (kind === 'mkdir') void onSubmit({ kind, name });
    else if (kind === 'rename') void onSubmit({ kind, entry: entries[0], name });
    else if (transfer) void onSubmit({ kind, entries, destination });
    else void onSubmit({ kind, entries });
  }
  return <MobileDialog title={title} busy={busy} onClose={onClose} className="wf-dialog"
    footer={<div className="product-dialog-actions"><Button variant="outline" onClick={onClose} disabled={busy}>{t('取消')}</Button>
      <Button type="submit" form="workspace-file-edit" variant="primary" disabled={busy || !ready}>{confirm}</Button></div>}>
    <form id="workspace-file-edit" className="product-dialog-fields" onSubmit={submit}>
      {nameField && <label>
        <span>{t('名称')}</span>
        <Input className="product-dialog-field" data-modal-autofocus value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      </label>}
      {kind === 'delete' && <><p>{t('确定删除所选项目及文件夹内的内容？')}</p>
        <ul className="wf-delete-list">{entries.map(item => <li key={item.name}>{item.name}</li>)}</ul></>}
      {transfer && <>
        <PathBar name={status.value?.name} path={destination} onChange={setDestination} disabled={busy} />
        <FailureAlert failure={status.error} onRetry={() => setRevision(value => value + 1)} />
        {status.status === 'loading' && <p role="status">{t('正在加载…')}</p>}
        <div className="wf-destinations">{status.value?.entries.filter(entry => entry.kind === 'directory' &&
          !(sameDirectory(path, destination) && entries.some(item => item.name === entry.name)))
          .map(entry => <button type="button" key={entry.name} disabled={busy} onClick={() => setDestination([...destination, entry.name])}>
            <Folder size={21} /><span>{entry.name}</span><Chevron size={15} />
          </button>)}</div>
      </>}
      <FailureAlert failure={failure} />
    </form>
  </MobileDialog>;
}
