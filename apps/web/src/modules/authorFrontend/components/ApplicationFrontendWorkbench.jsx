import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, ArrowSquareOut, Check, Code, DownloadSimple, File, FilePlus, FloppyDisk, Folder, Image, PencilSimple, Play, Plus, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { registerOverlayBack } from '../../../ui/hooks/overlayBack.js';
import { FrontendWorkbenchPrompt } from './FrontendWorkbenchPrompt.jsx';

const manifestPath = 'eleckoi.frontend.json';
const textual = path => /\.(html?|css|[cm]?js|jsx|tsx?|json|svg|txt|md|xml|yaml|yml|csv|map)$/i.test(path);
const encode = bytes => { let value = ''; for (let i = 0; i < bytes.length; i += 0x8000) value += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(value); };
const starter = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>我的应用</title><style>body{font:15px system-ui;margin:24px;background:#f2f6fb;color:#25364a}button{padding:8px 14px;border:0;border-radius:8px;background:#dceafd}pre{white-space:pre-wrap}</style><h1>我的应用</h1><button id="refresh">刷新角色</button><pre id="result"></pre><script>__ElecKoiFrontendReady.then(()=>{const show=()=>{result.textContent=JSON.stringify(ElecKoi.application.getSnapshot("characters"),null,2)};refresh.onclick=()=>ElecKoi.application.read("characters");ElecKoi.application.subscribe("characters",show);show();})</script></html>';

export function ApplicationFrontendWorkbench({ workspace, request, targets, error: serviceError, onClose, onPreview, onRestore }) {
  const [projectId, setProjectId] = useState(workspace.selectedProjectId || workspace.projects[0]?.id || null);
  const project = workspace.projects.find(item => item.id === projectId);
  const [path, setPath] = useState(''), [text, setText] = useState(''), [original, setOriginal] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [fileLoading, setFileLoading] = useState(false), [showTargets, setShowTargets] = useState(false);
  const importInput = useRef(null), replaceInput = useRef(null), addInput = useRef(null), readVersion = useRef(0);
  const dialog = useRef(null);
  const [question, setQuestion] = useState(null), questionResolver = useRef(null);
  const ask = options => new Promise(resolve => { questionResolver.current = resolve; setQuestion(options); });
  const resolveQuestion = value => { const resolve = questionResolver.current; questionResolver.current = null; setQuestion(null); resolve?.(value); };
  useEffect(() => () => { questionResolver.current?.(null); }, []);
  const dirty = text !== original;
  const discard = async () => !dirty || Boolean(await ask({ title: '放弃未保存的修改？', message: path, confirmLabel: '放弃修改', danger: true }));
  const close = async () => { if (!busy && await discard()) onClose(); };
  useEffect(() => {
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
  }, []);
  useEffect(() => registerOverlayBack(() => { close(); return true; }, window, 1100));
  useEffect(() => { const before = event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before); }, [dirty]);
  const run = async action => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { return await action(); }
    catch (reason) { setError(reason.message || String(reason)); }
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
    } catch (reason) { if (token === readVersion.current) setError(`${nextPath}: ${reason.message}`); }
    finally { if (token === readVersion.current) setFileLoading(false); }
  };
  const activateProject = next => {
    readVersion.current++; setProjectId(next.id); setPath(''); setText(''); setOriginal(''); setError(''); setFileLoading(false);
  };
  const chooseProject = async next => { if (await discard()) activateProject(next); };
  const save = () => run(async () => {
    if (path === manifestPath) await request('frontends.updateProject', { projectId, patch: { manifest: JSON.parse(text) } });
    else await request('frontends.writeFile', { projectId, path, content: text, encoding: 'utf8' });
    setOriginal(text); setNotice('已保存');
  });
  const imported = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file || !await discard()) return;
    await run(async () => {
      const html = /\.html?$/i.test(file.name);
      const next = await request('frontends.import', { filename: file.name, name: file.name.replace(/\.(zip|html?)$/i, ''), data: encode(new Uint8Array(await file.arrayBuffer())),
        ...(html ? { manifest: { manifestVersion: 1, sdkVersion: '1.0.0', scope: 'application', entryFile: 'index.html', bindings: [{ target: 'root', entryFile: 'index.html' }] } } : {}) });
      const created = next.projects.find(item => !workspace.projects.some(old => old.id === item.id)); if (created) activateProject(created);
    });
  };
  const create = () => run(async () => {
    if (!await discard()) return;
    const next = await request('frontends.import', { name: '我的应用', files: [{ path: 'index.html', content: starter }],
      manifest: { manifestVersion: 1, scope: 'application', sdkVersion: '1.0.0', entryFile: 'index.html', bindings: [{ target: 'root', entryFile: 'index.html' }] } });
    const created = next.projects.find(item => !workspace.projects.some(old => old.id === item.id)); if (created) activateProject(created);
  });
  const exportProject = () => run(async () => {
    const result = await request('frontends.export', { projectId });
    const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
    if (window.ElecKoiPlatform?.saveBytes) await window.ElecKoiPlatform.saveBytes(result.filename, bytes, 'application/zip');
    else { const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })); const a = document.createElement('a'); a.href = url; a.download = result.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  });
  const uploadFiles = async (event, replacing) => {
    const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length || !await discard()) return;
    await run(async () => {
      const inputs = await Promise.all(files.map(async file => ({ path: replacing ? path : file.webkitRelativePath || file.name,
        content: encode(new Uint8Array(await file.arrayBuffer())), encoding: 'base64' })));
      await request('frontends.replaceFiles', { projectId, files: inputs });
      setText(''); setOriginal(''); setPath(''); setNotice('文件已更新');
    });
  };
  const addText = async () => {
    if (!await discard()) return; const filename = await ask({ title: '新建文件', label: '相对路径', initialValue: 'styles.css', confirmLabel: '创建' }); if (!filename) return;
    void run(async () => { await request('frontends.replaceFiles', { projectId, files: [{ path: filename, content: '', encoding: 'utf8' }] }); setPath(filename); setText(''); setOriginal(''); });
  };
  return <section ref={dialog} className="af-workbench" role="dialog" aria-modal="true" aria-label="应用前端工作台">
    <header><Code size={20} /><strong>应用前端</strong><span className="af-count">{workspace.projects.length}</span><span className="af-spacer" />
      <button disabled={busy} onClick={onRestore} title="恢复默认界面"><ArrowCounterClockwise size={18} /><span>默认</span></button>
      <button disabled={busy} onClick={close} aria-label="关闭工作台"><X size={20} /></button></header>
    <div className="af-toolbar"><button disabled={busy} onClick={create}><Plus size={17} />新建</button>
      <button disabled={busy} onClick={() => importInput.current.click()}><UploadSimple size={17} />导入</button>
      <span className="af-spacer" /><button aria-pressed={showTargets} onClick={() => setShowTargets(!showTargets)}><ArrowSquareOut size={17} />接入位置</button></div>
    <div className="af-workspace"><aside className="af-explorer">
      <nav aria-label="前端项目">{workspace.projects.map(item => <button key={item.id} disabled={busy} aria-pressed={item.id === projectId} onClick={() => chooseProject(item)}>
        <Folder size={17} /><span>{item.name}</span>{item.id === workspace.selectedProjectId && <Check size={16} />}</button>)}</nav>
      {project && <><div className="af-file-actions"><strong>文件</strong><span className="af-spacer" /><button disabled={busy} onClick={addText} aria-label="新建文件"><FilePlus size={17} /></button><button disabled={busy} onClick={() => addInput.current.click()} aria-label="添加资源"><UploadSimple size={17} /></button></div>
        <nav aria-label="项目文件">{[...new Set([manifestPath, ...project.files])].sort().map(filename => <button key={filename} disabled={busy} aria-pressed={path === filename} onClick={() => chooseFile(filename)} title={filename}>
          {textual(filename) ? <File size={15} /> : <Image size={15} />}<span style={{ paddingInlineStart: Math.min(4, filename.split('/').length - 1) * 9 }}>{filename}</span></button>)}</nav></>}
    </aside><div className="af-editor">
      {project ? <><div className="af-project-actions"><strong>{project.name}</strong><span className="af-spacer" />
        <button disabled={busy} title="重命名项目" onClick={async () => { const name = await ask({ title: '重命名项目', label: '项目名称', initialValue: project.name, confirmLabel: '保存' }); if (name) void run(() => request('frontends.updateProject', { projectId, patch: { name } })); }}><PencilSimple size={17} /></button>
        <button disabled={busy || dirty} onClick={() => onPreview(projectId)}><Play size={17} />预览</button>
        <button disabled={busy || dirty} aria-pressed={workspace.selectedProjectId === projectId} onClick={() => run(() => request('frontends.select', { projectId }))}><Check size={17} />启用</button>
        <button disabled={busy} onClick={exportProject} title="导出项目"><DownloadSimple size={17} /></button>
        <button disabled={busy} title="删除项目" onClick={async () => { if (await ask({ title: '删除项目？', message: `“${project.name}”及其全部文件${dirty ? '、未保存修改' : ''}`, confirmLabel: '删除', danger: true })) void run(async () => { await request('frontends.delete', { projectId }); setProjectId(null); setPath(''); setText(''); setOriginal(''); }); }}><Trash size={17} /></button>
      </div><div className="af-file-bar"><code>{path || '选择文件'}</code>{dirty && <span className="af-dirty">●</span>}<span className="af-spacer" />
        {path && <><button disabled={busy || fileLoading || !textual(path) || !dirty} onClick={save}><FloppyDisk size={17} />保存</button>
          {path !== manifestPath && <><button disabled={busy} onClick={() => replaceInput.current.click()} title="替换文件"><UploadSimple size={17} /></button>
            <button disabled={busy} title="删除文件" onClick={async () => { if (await ask({ title: '删除文件？', message: `${path}${dirty ? '（含未保存修改）' : ''}`, confirmLabel: '删除', danger: true })) void run(async () => { await request('frontends.replaceFiles', { projectId, deletePaths: [path] }); setPath(''); setText(''); setOriginal(''); }); }}><Trash size={17} /></button></>}</>}
      </div>{fileLoading ? <div className="af-empty" role="status">正在读取…</div> : path && textual(path) ? <textarea aria-label={`编辑 ${path}`} spellCheck="false" value={text} disabled={busy} onChange={event => setText(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); void save(); } }} />
        : <div className="af-empty">{path ? <><Image size={40} /><strong>{path}</strong><button onClick={() => replaceInput.current.click()}><UploadSimple size={18} />替换二进制资源</button></> : <><Code size={40} /><button onClick={() => chooseFile(manifestPath)}>编辑入口与绑定</button><button onClick={() => chooseFile(project.entryFile)}>打开 {project.entryFile}</button></>}</div>}</>
        : <div className="af-empty"><Code size={44} /><button onClick={create}>创建应用前端</button><button onClick={() => importInput.current.click()}>导入 HTML / ZIP</button></div>}
    </div>{showTargets && <aside className="af-targets"><strong>当前可用目标</strong>{targets.map((target, index) => <button key={index} onClick={async () => {
      if (!project || !await discard()) return;
      readVersion.current++; setFileLoading(false);
      const binding = { target: target.target, entryFile: project.entryFile, ...(target.target === 'root' ? { view: target.view } : target.target === 'page' ? { pageId: target.pageId, view: 'main' } : { slot: target.slot, ...(['list', 'keyed'].includes(target.kind) ? { entryKey: target.entryKeys[0] || 'custom' } : {}) }) };
      setPath(manifestPath); setOriginal(JSON.stringify(project.manifest, null, 2)); setText(JSON.stringify({ ...project.manifest, bindings: [...(project.manifest.bindings || []), binding] }, null, 2));
    }}><code>{target.pageId || target.slot || target.view}</code><small>{target.target} {target.kind || ''}</small></button>)}</aside>}</div>
    <footer><span role={error || serviceError ? 'alert' : 'status'}>{error || serviceError || notice || (dirty ? '未保存' : project ? `${project.files.length} 个文件` : 'HTML · CSS · JavaScript · ZIP')}</span><code>SDK 1.0 · manifest v1</code></footer>
    <input ref={importInput} type="file" accept=".html,.htm,.zip" hidden onChange={imported} />
    <input ref={replaceInput} type="file" hidden onChange={event => uploadFiles(event, true)} />
    <input ref={addInput} type="file" multiple hidden onChange={event => uploadFiles(event, false)} />
    {question && <FrontendWorkbenchPrompt key={question.title} question={question} onResolve={resolveQuestion} />}
  </section>;
}
