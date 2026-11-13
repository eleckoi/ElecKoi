import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useEffect, useId, useRef, useState } from 'react';
import { Button, CodeBlock, FileTypeIcon, Menu, PathLabel, SegmentedTabs, languageForPath,
  IconBrowseOutlineRegular, IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular,
  IconEditOutlineRegular, IconEllipsisOutlineRegular, IconFolderCloseRegular,
  IconRefreshOutlineRegular, IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { AUTHOR_API_VERSION } from '@eleckoi/author-sdk';
import { ExportIcon } from '../../../ui/icons/openSourceIcons.jsx';
import { useShadowControlStyles } from '../../../ui/hooks/useShadowControlStyles.js';
import { registerOverlayBack } from '../../../ui/hooks/overlayBack.js';
import { resolveFailure } from '../../../utils/failureText.js';
import { characterFrontendEntry } from '../model/characterFrontend.js';
import { frontendAssetUrl } from '../model/applicationFrontendTargets.js';
import { AdvancedFrontendFrame } from './AdvancedFrontendFrame.jsx';
import { FrontendWorkbenchPrompt } from './FrontendWorkbenchPrompt.jsx';
import { FrontendPackageDirectory } from './FrontendPackageDirectory.jsx';

const manifestPath = 'eleckoi.frontend.json';
const textual = path => /\.(html?|css|[cm]?js|jsx|tsx?|json|svg|txt|md|xml|yaml|yml|csv|map|log|sh|py|toml|ini)$/i.test(path);
const imageFile = path => /\.(png|jpe?g|webp|gif|avif|bmp|ico)$/i.test(path);
const encode = bytes => {
  let value = '';
  for (let i = 0; i < bytes.length; i += 0x8000) value += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(value);
};

export function CharacterFrontendPackages({ characterId, workspace, status, request, error: serviceError }) {
  const tUi = useProductTranslation();
  const surface = useRef(null), importInput = useRef(null), resolver = useRef(null), alive = useRef(true), working = useRef(false);
  const [selection, setSelection] = useState(null), [view, setView] = useState('files');
  const [menu, setMenu] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [question, setQuestion] = useState(null), [reading, setReading] = useState(false);
  const project = workspace.projects.find(item => item.id === selection?.projectId)
    || workspace.projects.find(item => item.id === workspace.selectedProjectId) || workspace.projects[0];
  const path = project && selection?.projectId === project.id && (project.files.includes(selection.path) || selection.path === manifestPath) ? selection.path : project?.entryFile;
  const id = useId();
  useShadowControlStyles(surface);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; resolver.current?.(null); };
  }, []);
  useEffect(() => registerOverlayBack(() => {
    if (!reading) return false;
    setReading(false); return true;
  }, window, 1100), [reading]);
  const run = async action => {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { return await action(); }
    catch (reason) { if (alive.current) setError(resolveFailure(reason, { fallback: tUi("前端包操作失败，请重试。") }).text); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  };
  const ask = options => new Promise(resolve => { resolver.current = resolve; setQuestion(options); });
  const resolveQuestion = answer => { const resolve = resolver.current; resolver.current = null; setQuestion(null); resolve?.(answer); };
  const chooseProject = next => { setSelection({ projectId: next.id, path: next.entryFile }); setReading(false); setError(''); setMenu(null); };
  const imported = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    await run(async () => {
      const html = /\.html?$/i.test(file.name);
      const next = await request('frontends.import', { select: true, filename: file.name,
        name: file.name.replace(/\.(zip|html?)$/i, ''), data: encode(new Uint8Array(await file.arrayBuffer())),
        ...(html ? { manifest: { manifestVersion: 1, sdkVersion: AUTHOR_API_VERSION, scope: 'character', entryFile: 'index.html',
          bindings: [{ target: 'root', view: 'chat', entryFile: 'index.html' }] } } : {}) });
      const added = next.projects.find(item => !workspace.projects.some(old => old.id === item.id));
      if (alive.current && added) chooseProject(added);
    });
  };
  const exportProject = target => run(async () => {
    const result = await request('frontends.export', { projectId: target.id });
    if (!alive.current) return;
    const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
    if (window.ElecKoiPlatform?.saveBytes) await window.ElecKoiPlatform.saveBytes(result.filename, bytes, 'application/zip');
    else {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const link = document.createElement('a'); link.href = url; link.download = result.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  const command = async commandId => {
    setMenu(null);
    if (busy || !project) return;
    const target = project;
    if (commandId === 'use') return run(() => request('frontends.select', { projectId: target.id }));
    if (commandId === 'export') return exportProject(target);
    if (commandId === 'default') return run(() => request('frontends.restoreDefault'));
    if (commandId === 'rename') {
      const name = await ask({ title: tUi("重命名前端包"), label: tUi("名称"), initialValue: target.name, confirmLabel: tUi("保存") });
      if (name && alive.current) await run(() => request('frontends.updateProject', { projectId: target.id, patch: { name } }));
    }
    if (commandId === 'delete' && await ask({ title: tUi("移除前端包？"), message: tUi("“{value0}”及其全部文件", {value0: target.name}), confirmLabel: tUi("移除"), danger: true }) && alive.current) {
      await run(() => request('frontends.delete', { projectId: target.id }));
    }
  };
  const tabs = ['preview', 'files'].map((value, index) => ({ value, id: `${id}-${value}`, panelId: `${id}-body`,
    label: <span className="cf-tab-label">{index ? <FileTypeIcon kind="other" size={15} /> : <IconBrowseOutlineRegular size={15} />}<span>{index ? tUi("文件") : tUi("预览")}</span></span> }));
  return <section ref={surface} className="cf-packages" aria-label={tUi("角色前端包")} data-dsh-control aria-busy={busy}>
    <header className="cf-toolbar">
      {project && <Menu open={menu === 'packages'} onClose={() => setMenu(null)} selectedId={project.id} className="cf-package-menu" portal
        anchor={<Button data-dsh-control size="sm" variant="ghost" className="cf-selector" aria-label={tUi("切换前端包")} disabled={busy} onClick={() => setMenu(menu === 'packages' ? null : 'packages')}>
          <FileTypeIcon kind="folder" size={20} /><span>{project.name}</span><IconChevronDownOutlineRegular size={14} /></Button>}
        items={workspace.projects.map(item => ({ id: item.id, label: item.name, icon: <FileTypeIcon kind="folder" size={17} /> }))}
        onSelect={next => chooseProject(workspace.projects.find(item => item.id === next))} />}
      {project && project.id !== workspace.selectedProjectId && <Button data-dsh-control size="sm" variant="primary" disabled={busy}
        className="cf-use" onClick={() => run(() => request('frontends.select', { projectId: project.id }))}>{tUi("使用此前端")}</Button>}
      <div className="cf-spacer" />
      {project && <SegmentedTabs className="cf-tabs" items={tabs} value={view} label={tUi("前端查看方式")} onChange={next => { setView(next); setReading(false); }} />}
      <Button data-dsh-control size="sm" variant={project ? 'outline' : 'primary'} aria-label={tUi("导入前端包")} disabled={busy || status === 'loading' || status === 'unavailable'}
        icon={<IconFolderCloseRegular size={16} />} onClick={() => importInput.current.click()}><span className="cf-import-label">{tUi("导入前端包")}</span><span className="cf-import-short">{tUi("导入")}</span></Button>
      {project && <Menu open={menu === 'more'} onClose={() => setMenu(null)} portal align="end"
        anchor={<Button data-dsh-control size="sm" variant="ghost" disabled={busy} aria-label={tUi("前端包更多操作")} onClick={() => setMenu(menu === 'more' ? null : 'more')}><IconEllipsisOutlineRegular size={18} /></Button>}
        items={[...(project.id !== workspace.selectedProjectId ? [{ id: 'use', label: tUi("使用此前端"), icon: <IconBrowseOutlineRegular size={16} /> }] : []),
          { id: 'rename', label: tUi("重命名"), icon: <IconEditOutlineRegular size={16} /> },
          { id: 'export', label: tUi("导出前端包"), icon: <ExportIcon size={16} /> },
          { id: 'default', label: tUi("使用默认界面"), disabled: !workspace.selectedProjectId, icon: <IconRefreshOutlineRegular size={16} /> },
          { type: 'separator', id: 'remove-group' }, { id: 'delete', label: tUi("移除前端包"), danger: true, icon: <IconTrashOutlineRegular size={16} /> }]}
        onSelect={command} />}
    </header>
    {(error || serviceError) && <div className="cf-error" role="alert">{error || serviceError}</div>}
    {status === 'unavailable' ? <div className="cf-empty" role="alert">{tUi("原生前端插件未启用")}</div>
      : status === 'loading' ? <div className="cf-empty" aria-busy="true" />
      : !project ? <div className="cf-empty"><FileTypeIcon kind="folder" size={44} /><h2>{tUi("导入你的角色前端")}</h2><p>{tUi("支持 HTML、ZIP")}</p></div>
      : <div id={`${id}-body`} className={`cf-body cf-view-${view}`} data-reading={reading || undefined} role="tabpanel" aria-labelledby={`${id}-${view}`}>
        <div className="cf-files" hidden={view !== 'files'}>
          <FrontendPackageDirectory key={project.id} files={project.files} path={path} onSelect={next => { setSelection({ projectId: project.id, path: next }); setReading(true); }} />
          <div className="cf-document"><div className="cf-file-title"><Button data-dsh-control size="sm" variant="ghost" className="cf-file-back" aria-label={tUi("返回文件目录")} onClick={() => setReading(false)}><IconChevronLeftOutlineRegular size={16} /></Button>
            <FileTypeIcon path={path || manifestPath} size={16} /><PathLabel path={path || ''} /></div>
            <PackageDocument key={project.id} project={project} path={path} request={request} visible={view === 'files'} />
          </div>
        </div>
        {view === 'preview' && <PackagePreview project={project} characterId={characterId} request={request} revision={workspace.revision} />}
      </div>}
    <input ref={importInput} type="file" accept=".html,.htm,.zip" hidden onChange={imported} />
    {question && <FrontendWorkbenchPrompt key={question.title} question={question} onResolve={resolveQuestion} />}
  </section>;
}

function PackageDocument({ project, path, request, visible }) {
  const tUi = useProductTranslation();
  const surface = useRef(null);
  const [loaded, setLoaded] = useState(null);
  useShadowControlStyles(surface);
  const revision = project.updatedAt;
  useEffect(() => {
    if (!visible || !path || !textual(path)) return;
    let current = true;
    const identity = { path, revision };
    const read = path === manifestPath ? Promise.resolve({ content: JSON.stringify(project.manifest, null, 2) })
      : request('frontends.readFile', { projectId: project.id, path });
    void read.then(result => { if (current) setLoaded({ ...identity, content: result.content }); }, reason => {
      if (current) setLoaded({ ...identity, error: resolveFailure(reason, { fallback: tUi("读取文件失败") }).text });
    });
    return () => { current = false; };
  }, [visible, path, project.id, project.manifest, revision, request]);
  if (!path) return <div className="cf-empty">{tUi("选择文件")}</div>;
  if (imageFile(path)) return <div className="cf-image"><img key={`${path}:${revision}`} src={frontendAssetUrl(project, path, revision)} alt={path} /></div>;
  if (!textual(path)) return <div className="cf-empty"><FileTypeIcon path={path} size={40} /><span>{path.split('/').at(-1)}</span></div>;
  if (!loaded || loaded.path !== path || loaded.revision !== revision) return <div className="cf-empty" aria-busy="true" />;
  if (loaded.error) return <div className="cf-error" role="alert">{loaded.error}</div>;
  return <div ref={surface} className="cf-source"><CodeBlock code={loaded.content || ''} lang={languageForPath(path)} lineNumbers showHeader={false} copyLabel={tUi("复制")} copiedLabel={tUi("已复制")} /></div>;
}

function PackagePreview({ project, characterId, request, revision }) {
  const tUi = useProductTranslation();
  let entry, error;
  try { entry = characterFrontendEntry(project, characterId); }
  catch (reason) { error = resolveFailure(reason, { fallback: tUi("预览前端包失败") }).text; }
  return error ? <div className="cf-error" role="alert">{error}</div> : <div className="cf-preview"><AdvancedFrontendFrame nativeOnly project={project} request={request}
    entryFile={entry} revision={revision} context={{ view: 'chat', preview: true, binding: { target: 'root' }, owner: { characterId } }} /></div>;
}
