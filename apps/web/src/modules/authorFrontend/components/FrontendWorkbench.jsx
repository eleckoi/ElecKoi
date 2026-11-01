import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ArrowCounterClockwise, ArrowSquareOut, Check, Code, File, FilePlus, FloppyDisk, Folder, Image, PencilSimple, Play, Plus, Trash, X } from '@phosphor-icons/react';
import { ImportIcon, ExportIcon } from '../../../ui/icons/openSourceIcons.jsx';
import { EditorContextMenu, useEditorContextMenu } from '../../../ui/ui/EditorContextMenu.jsx';
import { registerOverlayBack } from '../../../ui/hooks/overlayBack.js';
import { FrontendWorkbenchPrompt } from './FrontendWorkbenchPrompt.jsx';
import { AUTHOR_API_VERSION } from '@eleckoi/author-sdk';
import { resolveFailure } from '../../../utils/failureText.js';
import { useShadowControlStyles } from '../../../ui/hooks/useShadowControlStyles.js';

const manifestPath = 'eleckoi.frontend.json';
const textual = path => /\.(html?|css|[cm]?js|jsx|tsx?|json|svg|txt|md|xml|yaml|yml|csv|map)$/i.test(path);
const encode = bytes => { let value = ''; for (let i = 0; i < bytes.length; i += 0x8000) value += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(value); };
const starter = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="eleckoi-author-api" content="${AUTHOR_API_VERSION}"><title>我的应用</title><style>body{font:15px system-ui;margin:24px;background:#f2f6fb;color:#25364a}button{padding:8px 14px;border:0;border-radius:8px;background:#dceafd}pre{white-space:pre-wrap}</style></head><body><h1>我的应用</h1><button id="refresh">刷新上下文</button><pre id="result"></pre><script type="module">const api=await window.ElecKoiReady;const result=document.querySelector('#result');const show=async()=>{try{result.textContent=JSON.stringify(await api.context.current(),null,2)}catch(error){result.textContent=error.message}};document.querySelector('#refresh').onclick=show;await show();</script></body></html>`;

export const FrontendWorkbench = forwardRef(function FrontendWorkbench({ workspace, request, targets, error: serviceError, onClose, onPreview, onRestore, embedded = false, onDirtyChange }, ref) {
  const character = workspace.scope === 'character';
  const label = character ? '角色前端' : '应用前端';
  const defaultManifest = { manifestVersion: 1, sdkVersion: AUTHOR_API_VERSION, scope: workspace.scope, entryFile: 'index.html',
    bindings: [{ target: 'root', entryFile: 'index.html', ...(character ? { view: 'chat' } : {}) }] };
  const [projectId, setProjectId] = useState(workspace.selectedProjectId || workspace.projects[0]?.id || null);
  const project = workspace.projects.find(item => item.id === projectId);
  const [path, setPath] = useState(''), [text, setText] = useState(''), [original, setOriginal] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [fileLoading, setFileLoading] = useState(false), [showTargets, setShowTargets] = useState(false);
  const importInput = useRef(null), replaceInput = useRef(null), addInput = useRef(null), readVersion = useRef(0);
  const replaceTarget = useRef(null);
  const context = useEditorContextMenu();
  const dialog = useRef(null);
  useShadowControlStyles(dialog);
  const [question, setQuestion] = useState(null), questionResolver = useRef(null);
  const ask = options => new Promise(resolve => { questionResolver.current = resolve; setQuestion(options); });
  const resolveQuestion = value => { const resolve = questionResolver.current; questionResolver.current = null; setQuestion(null); resolve?.(value); };
  useEffect(() => () => { questionResolver.current?.(null); }, []);
  const dirty = text !== original;
  const discard = async () => !dirty || Boolean(await ask({ title: '放弃未保存的修改？', message: path, confirmLabel: '放弃修改', danger: true }));
  const close = async () => { if (!busy && await discard()) onClose(); };
  useEffect(() => {
    if (embedded) return;
    const element = dialog.current, root = element.getRootNode(), previous = root.activeElement;
    element.querySelector('button')?.focus();
    const trap = event => {
      if (event.key !== 'Tab') return;
      const controls = [...element.querySelectorAll('button:not(:disabled),textarea:not(:disabled),input:not([hidden]):not(:disabled)')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && root.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && root.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    element.addEventListener('keydown', trap);
    return () => { element.removeEventListener('keydown', trap); previous?.focus(); };
  }, [embedded]);
  useEffect(() => { if (!embedded) return registerOverlayBack(() => { close(); return true; }, window, 1100); });
  useEffect(() => { if (embedded) return; const before = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, [dirty, embedded]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  const run = async action => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { return await action(); }
    catch (reason) { setError(resolveFailure(reason, { fallback: '操作失败，请重试。' }).text); }
    finally { setBusy(false); }
  };
  const chooseFile = async (nextPath, nextProject = project) => {
    if (!nextProject || !await discard()) return;
    const token = ++readVersion.current; setPath(nextPath); setText(''); setOriginal(''); setError('');
    if (!textual(nextPath)) { setFileLoading(false); return; }
    setFileLoading(true);
    try {
      const result = nextPath === manifestPath ? { content: JSON.stringify(nextProject.manifest, null, 2) }
        : await request('frontends.readFile', { projectId: nextProject.id, path: nextPath });
      if (token === readVersion.current) { setText(result.content); setOriginal(result.content); }
    } catch (reason) { if (token === readVersion.current) setError(`${nextPath}: ${resolveFailure(reason, { fallback: '读取文件失败' }).text}`); }
    finally { if (token === readVersion.current) setFileLoading(false); }
  };
  const activateProject = next => {
    context.close(); readVersion.current++; setProjectId(next.id); setPath(''); setText(''); setOriginal(''); setError(''); setFileLoading(false);
  };
  const chooseProject = async next => { if (await discard()) activateProject(next); };
  const save = async () => !dirty || Boolean(await run(async () => {
    if (path === manifestPath) await request('frontends.updateProject', { projectId, patch: { manifest: JSON.parse(text) } });
    else await request('frontends.writeFile', { projectId, path, content: text, encoding: 'utf8' });
    setOriginal(text); setNotice('已保存'); return true;
  }));
  useImperativeHandle(ref, () => ({ save, discard: () => { setText(original); setError(''); } }));
  const imported = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || !await discard()) return;
    await run(async () => {
      const html = /\.html?$/i.test(file.name);
      const next = await request('frontends.import', { select: false, filename: file.name, name: file.name.replace(/\.(zip|html?)$/i, ''), data: encode(new Uint8Array(await file.arrayBuffer())),
        ...(html ? { manifest: defaultManifest } : {}) });
      const created = next.projects.find(item => !workspace.projects.some(old => old.id === item.id)); if (created) activateProject(created);
    });
  };
  const create = () => run(async () => {
    if (!await discard()) return;
    const next = await request('frontends.import', { select: false, name: character ? '我的角色页面' : '我的应用', files: [{ path: 'index.html', content: starter }], manifest: defaultManifest });
    const created = next.projects.find(item => !workspace.projects.some(old => old.id === item.id)); if (created) activateProject(created);
  });
  const exportProject = (id = projectId) => run(async () => {
    const result = await request('frontends.export', { projectId: id });
    const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
    if (window.ElecKoiPlatform?.saveBytes) await window.ElecKoiPlatform.saveBytes(result.filename, bytes, 'application/zip');
    else { const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })); const a = document.createElement('a'); a.href = url; a.download = result.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
  const uploadFiles = async (event, replacing) => {
    const target = replacing ? replaceTarget.current : { projectId };
    replaceTarget.current = null;
    const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length || !target) return;
    const updatesEditor = target.projectId === projectId && (replacing ? target.path === path : files.some(file => (file.webkitRelativePath || file.name) === path));
    if (updatesEditor && !await discard()) return;
    await run(async () => {
      const inputs = await Promise.all(files.map(async file => ({ path: replacing ? target.path : file.webkitRelativePath || file.name,
        content: encode(new Uint8Array(await file.arrayBuffer())), encoding: 'base64' })));
      await request('frontends.replaceFiles', { projectId: target.projectId, files: inputs });
      if (updatesEditor) { readVersion.current++; setFileLoading(false); setText(''); setOriginal(''); setPath(''); }
      setNotice('文件已更新');
    });
  };
  const replaceFile = (filename = path) => { replaceTarget.current = { projectId, path: filename }; replaceInput.current.click(); };
  const renameProject = async item => {
    const name = await ask({ title: '重命名项目', label: '项目名称', initialValue: item.name, confirmLabel: '保存' });
    if (name) void run(() => request('frontends.updateProject', { projectId: item.id, patch: { name } }));
  };
  const deleteProject = async item => {
    if (!await ask({ title: '删除项目？', message: `“${item.name}”及其全部文件${item.id === projectId && dirty ? '、未保存修改' : ''}`, confirmLabel: '删除', danger: true })) return;
    void run(async () => {
      await request('frontends.delete', { projectId: item.id });
      if (item.id === projectId) { readVersion.current++; setFileLoading(false); setProjectId(null); setPath(''); setText(''); setOriginal(''); }
    });
  };
  const deleteFile = async filename => {
    const id = projectId;
    if (!await ask({ title: '删除文件？', message: `${filename}${path === filename && dirty ? '（含未保存修改）' : ''}`, confirmLabel: '删除', danger: true })) return;
    void run(async () => {
      await request('frontends.replaceFiles', { projectId: id, files: [], deletePaths: [filename] });
      if (path === filename) { readVersion.current++; setFileLoading(false); setPath(''); setText(''); setOriginal(''); }
    });
  };
  const addText = async () => {
    if (!await discard()) return; const filename = await ask({ title: '新建文件', label: '相对路径', initialValue: 'styles.css', confirmLabel: '创建' }); if (!filename) return;
    void run(async () => { await request('frontends.replaceFiles', { projectId, files: [{ path: filename, content: '', encoding: 'utf8' }] }); setPath(filename); setText(''); setOriginal(''); });
  };
  const menuProject = context.menu && workspace.projects.find(item => item.id === context.menu.target.projectId);
  const menuPath = context.menu?.target.path;
  const menuActions = menuProject ? (menuPath ? [
    { label: '编辑', icon: PencilSimple, run: () => chooseFile(menuPath) },
    ...(menuPath === manifestPath ? [] : [
      { label: '替换文件', icon: ImportIcon, run: () => replaceFile(menuPath) },
      { label: '删除文件', icon: Trash, danger: true, run: () => deleteFile(menuPath) },
    ]),
  ] : [
    { label: '编辑', icon: PencilSimple, run: () => chooseProject(menuProject) },
    { label: '重命名', icon: PencilSimple, run: () => renameProject(menuProject) },
    { label: '预览', icon: Play, disabled: dirty, run: () => onPreview(menuProject.id) },
    { label: '启用', icon: Check, disabled: dirty, run: () => run(() => request('frontends.select', { projectId: menuProject.id })) },
    { label: '导出', icon: ExportIcon, run: () => exportProject(menuProject.id) },
    { label: '删除', icon: Trash, danger: true, run: () => deleteProject(menuProject) },
  ]).map(action => ({ ...action, disabled: busy || action.disabled })) : [];
  return <section ref={dialog} className={`af-workbench${embedded ? ' af-inline' : ''}`} role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-label={`${label}工作台`}>
    {!embedded && <header><Code size={20} /><strong>{label}</strong><span className="af-count">{workspace.projects.length}</span><span className="af-spacer" />
      <button disabled={busy} onClick={onRestore} title="恢复默认界面"><ArrowCounterClockwise size={18} /><span>默认</span></button>
      <button disabled={busy} onClick={close} aria-label="关闭工作台"><X size={20} /></button></header>}
    <div className="af-toolbar"><Button data-dsh-control variant="primary" disabled={busy} onClick={create} aria-label="新建" title="新建项目"><Plus size={17} />{!embedded && '新建'}</Button>
      <Button data-dsh-control variant="outline" disabled={busy} onClick={() => importInput.current.click()} aria-label="导入" title="导入 HTML / ZIP"><ImportIcon size={17} />{!embedded && '导入'}</Button>
      <span className="af-spacer" />{embedded && <Button data-dsh-control variant="outline" disabled={busy} onClick={onRestore} title="恢复默认对话界面" aria-label="恢复默认对话界面"><ArrowCounterClockwise size={18} /></Button>}
      <Button data-dsh-control variant="outline" aria-pressed={showTargets} aria-label="接入位置" title="接入位置" onClick={() => setShowTargets(!showTargets)}><ArrowSquareOut size={17} />{!embedded && '接入位置'}</Button></div>
    <div className="af-workspace"><aside className="af-explorer">
      <nav aria-label="前端项目">{workspace.projects.map(item => <button key={item.id} disabled={busy} aria-pressed={item.id === projectId} onClick={() => chooseProject(item)} onContextMenu={event => context.open(event, { projectId: item.id })}>
        <Folder size={17} /><span>{item.name}</span>{item.id === workspace.selectedProjectId && <Check size={16} />}</button>)}</nav>
      {project && <><div className="af-file-actions"><strong>文件</strong><span className="af-spacer" /><Button data-dsh-control variant="outline" disabled={busy} onClick={addText} aria-label="新建文件"><FilePlus size={17} /></Button><Button data-dsh-control variant="outline" disabled={busy} onClick={() => addInput.current.click()} aria-label="添加资源"><ImportIcon size={17} /></Button></div>
        <nav aria-label="项目文件">{[...new Set([manifestPath, ...project.files])].sort().map(filename => <button key={filename} disabled={busy} aria-pressed={path === filename} onClick={() => chooseFile(filename)} title={filename} onContextMenu={event => context.open(event, { projectId, path: filename })}>
          {textual(filename) ? <File size={15} /> : <Image size={15} />}<span style={{ paddingInlineStart: Math.min(4, filename.split('/').length - 1) * 9 }}>{filename}</span></button>)}</nav></>}
    </aside><div className="af-editor">
      {project ? <><div className="af-project-actions"><strong>{project.name}</strong><span className="af-spacer" />
        <Button data-dsh-control variant="outline" disabled={busy} title="重命名项目" onClick={() => renameProject(project)}><PencilSimple size={17} /></Button>
        <Button data-dsh-control variant="outline" disabled={busy || dirty} onClick={() => onPreview(projectId)} aria-label="预览" title="预览"><Play size={17} />{!embedded && '预览'}</Button>
        <Button data-dsh-control variant="primary" disabled={busy || dirty} aria-pressed={workspace.selectedProjectId === projectId} aria-label="启用" title="启用" onClick={() => run(() => request('frontends.select', { projectId }))}><Check size={17} />{!embedded && '启用'}</Button>
        <Button data-dsh-control variant="outline" disabled={busy} onClick={() => exportProject()} title="导出项目" aria-label="导出项目"><ExportIcon size={17} /></Button>
        <Button data-dsh-control variant="outline" disabled={busy} title="删除项目" onClick={() => deleteProject(project)}><Trash size={17} /></Button>
      </div><div className="af-file-bar"><code>{path || '选择文件'}</code>{dirty && <span className="af-dirty">●</span>}<span className="af-spacer" />
        {path && <><Button data-dsh-control variant="primary" disabled={busy || fileLoading || !textual(path) || !dirty} onClick={save} aria-label="保存" title="保存文件"><FloppyDisk size={17} />{!embedded && '保存'}</Button>
          {path !== manifestPath && <><Button data-dsh-control variant="outline" disabled={busy} onClick={() => replaceFile()} title="替换文件"><ImportIcon size={17} /></Button>
            <Button data-dsh-control variant="outline" disabled={busy} title="删除文件" onClick={() => deleteFile(path)}><Trash size={17} /></Button></>}</>}
      </div>{fileLoading ? <div className="af-empty" role="status">正在读取…</div> : path && textual(path) ? <textarea aria-label={`编辑 ${path}`} spellCheck="false" value={text} disabled={busy} onChange={event => setText(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); void save(); } }} />
        : <div className="af-empty">{path ? <><Image size={40} /><strong>{path}</strong><Button data-dsh-control variant="outline" onClick={() => replaceFile()}><ImportIcon size={18} />替换二进制资源</Button></> : <><Code size={40} /><Button data-dsh-control variant="outline" onClick={() => chooseFile(manifestPath)}>编辑入口与绑定</Button><Button data-dsh-control variant="outline" onClick={() => chooseFile(project.entryFile)}>打开 {project.entryFile}</Button></>}</div>}</>
        : <div className="af-empty"><Code size={44} /><Button data-dsh-control variant="primary" onClick={create}>创建{label}</Button><Button data-dsh-control variant="outline" onClick={() => importInput.current.click()}>导入 HTML / ZIP</Button></div>}
    </div>{showTargets && <aside className="af-targets"><strong>当前可用目标</strong>{targets.map((target, index) => <button key={index} onClick={async () => {
      if (!project || !await discard()) return;
      readVersion.current++; setFileLoading(false);
      const entryKey = ['list', 'keyed'].includes(target.kind) ? await ask({ title: '指定插槽条目', label: '条目编号', initialValue: '', confirmLabel: '使用' }) : undefined;
      if (['list', 'keyed'].includes(target.kind) && !entryKey) return;
      const binding = { target: target.target, entryFile: project.entryFile, ...(target.target === 'root' ? { view: target.view } : target.target === 'page' ? { pageId: target.pageId, view: 'main' } : { slot: target.slot, ...(entryKey ? { entryKey } : {}) }) };
      const others = (project.manifest.bindings || []).filter(item => !(item.target === binding.target && (binding.target === 'root' ? item.view === binding.view : binding.target === 'page' ? item.pageId === binding.pageId : item.slot === binding.slot && item.entryKey === binding.entryKey)));
      setPath(manifestPath); setOriginal(JSON.stringify(project.manifest, null, 2)); setText(JSON.stringify({ ...project.manifest, bindings: [...others, binding] }, null, 2));
    }}><code>{target.pageId || target.slot || target.view}</code><small>{target.target} {target.kind || ''}</small></button>)}</aside>}</div>
    <footer><span role={error || serviceError ? 'alert' : 'status'}>{error || serviceError || notice || (dirty ? '未保存' : project ? `${project.files.length} 个文件` : 'HTML · CSS · JavaScript · ZIP')}</span><code>SDK {AUTHOR_API_VERSION} · manifest v1</code></footer>
    <input ref={importInput} type="file" accept=".html,.htm,.zip" hidden onChange={imported} />
    <input ref={replaceInput} type="file" hidden onChange={event => uploadFiles(event, true)} />
    <input ref={addInput} type="file" multiple hidden onChange={event => uploadFiles(event, false)} />
    {menuProject && (!menuPath || menuProject.id === projectId) && <EditorContextMenu menu={context.menu} actions={menuActions} label={menuPath ? '文件操作' : '项目操作'} onClose={context.close} />}
    {question && <FrontendWorkbenchPrompt key={question.title} question={question} onResolve={resolveQuestion} />}
  </section>;
});
