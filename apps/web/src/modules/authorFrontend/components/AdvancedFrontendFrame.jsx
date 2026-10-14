import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { activateFrontendScripts, buildSharedFrontendDocument } from '../model/sharedFrontendDocument.js';
import { frontendAssetUrl } from '../model/applicationFrontendTargets.js';
import { readAuthorDocumentDeclaration } from '@eleckoi/author-sdk';
import { useNativeFrontendServices } from '../hooks/NativeFrontendContext.jsx';
import { NativeProjectFrame } from './NativeProjectFrame.jsx';

/** Document metadata selects a runtime; undeclared source is never rewritten as native. */
export function AdvancedFrontendFrame(props) {
  const { project, request, entryFile = project.entryFile, revision, onError, nativeOnly = false } = props;
  const { authorRuntime } = useNativeFrontendServices();
  const identity = useMemo(() => ({}), [request, project.id, project.updatedAt, entryFile, revision, nativeOnly]);
  const [loaded, setLoaded] = useState(null);
  const report = useRef(onError); report.current = onError;
  useEffect(() => {
    let active = true;
    request('frontends.readFile', { projectId: project.id, path: entryFile }).then(result => {
      if (!active) return;
      const declaration = readAuthorDocumentDeclaration(result.content);
      if (declaration.kind === 'unsupported') throw new Error(declaration.error);
      if (nativeOnly && declaration.kind !== 'native') throw new Error('页面缺少 eleckoi-author-api 原生 SDK 声明');
      setLoaded({ identity, document: { content: result.content, declaration } });
    }).catch(reason => { if (active) { const message = `${project.name} · ${entryFile}: ${reason.message || String(reason)}`; setLoaded({ identity, error: message }); report.current?.(message); } });
    return () => { active = false; };
  }, [request, project.id, project.updatedAt, entryFile, revision, identity, nativeOnly]);
  if (loaded?.identity !== identity) return <div className="frontend-state" role="status">正在加载 HTML 前端…</div>;
  if (loaded.error) return <div className="frontend-state" role="alert">HTML 前端加载失败：{loaded.error}</div>;
  const document = loaded.document;
  if (document.declaration.kind === 'native') return <NativeProjectFrame {...props} entryFile={entryFile} content={document.content} runtime={authorRuntime} />;
  return <LegacyProjectFrame {...props} entryFile={entryFile} content={document.content} authorRuntime={authorRuntime} />;
}

/** Project identity owns the document; message updates never replace its DOM. */
function LegacyProjectFrame({ project, runtime, authorRuntime, request, content, entryFile = project.entryFile, revision, context, onError }) {
  const frame = useRef(null), releaseDocument = useRef(null), [source, setSource] = useState(''), [error, setError] = useState('');
  const [slotHeight, setSlotHeight] = useState(180), currentDocument = useRef(null);
  const autoHeight = context?.binding?.target === 'slot' && context?.binding?.slot !== 'main';
  const fullHeight = context?.binding?.target === 'root' || context?.binding?.target === 'page' || context?.binding?.slot === 'main';
  const instance = useId();
  const channel = `frontend:${project.id}:${instance}`;
  const contextRef = useRef(context), errorRef = useRef(onError);
  contextRef.current = context; errorRef.current = onError;
  const contextKey = JSON.stringify(context ?? null);
  const syncContext = () => {
    const target = frame.current?.contentWindow;
    if (!target) return;
    const rect = frame.current.getBoundingClientRect();
    target.ElecKoiFrontendContext = { ...(contextRef.current || {}), container: { width: rect.width, height: rect.height } };
    target.dispatchEvent(new target.CustomEvent('eleckoi:frontend-context', { detail: target.ElecKoiFrontendContext }));
  };
  useEffect(() => { syncContext(); }, [contextKey]);
  useEffect(() => {
    if (!source || !frame.current || typeof ResizeObserver !== 'function') return;
    const resize = new ResizeObserver(syncContext); resize.observe(frame.current);
    return () => resize.disconnect();
  }, [source]);
  useEffect(() => {
    let mounted = true;
    let documentWindow;
    const release = () => {
      releaseDocument.current?.(); releaseDocument.current = null;
      documentWindow ||= currentDocument.current;
      if (!documentWindow) return;
      documentWindow = null;
      currentDocument.current = null;
    };
    const fail = failure => {
      release();
      const message = `${project.name} · ${entryFile}: ${failure.message || String(failure)}`;
      if (mounted) { setError(message); errorRef.current?.(message); }
    };
    setError(''); setSource('');
    Promise.resolve({ content }).then(result => {
      if (!mounted) return;
      const folder = entryFile.includes('/') ? entryFile.slice(0, entryFile.lastIndexOf('/') + 1).split('/').map(encodeURIComponent).join('/') : '';
      const baseUrl = `/eleckoi/frontends/${encodeURIComponent(project.id)}/${folder}`;
      setSource(buildSharedFrontendDocument(result.content, runtime, { channel, frameId: channel, baseUrl, context: contextRef.current, autoHeight,
        globalStyles: (project.manifest?.globalStyles || []).map(path => frontendAssetUrl(project, path, revision)) }));
    }).catch(fail);
    const receive = event => {
      if (event.source === frame.current?.contentWindow && event.data?.channel === channel && event.data.type === 'eleckoi:frontend-error') {
        fail(event.data.message);
      }
      if (event.source === frame.current?.contentWindow && event.data?.channel === channel) documentWindow = event.source;
      if (autoHeight && event.source === frame.current?.contentWindow && event.data?.channel === channel && event.data.type === 'eleckoi:slot-height' && Number.isFinite(event.data.height)) setSlotHeight(Math.max(1, event.data.height));
    };
    const loaded = () => { documentWindow = frame.current?.contentWindow; };
    const node = frame.current;
    node?.addEventListener('load', loaded);
    window.addEventListener('message', receive);
    return () => {
      mounted = false; window.removeEventListener('message', receive);
      node?.removeEventListener('load', loaded); release();
    };
  }, [channel, entryFile, project.id, project.updatedAt, revision, request, runtime, authorRuntime, autoHeight, content]);
  const loaded = async () => {
    const page = frame.current?.contentWindow;
    if (!page || page.__ElecKoiDocumentChannel !== channel || releaseDocument.current) return;
    currentDocument.current = page; syncContext();
    let mounted;
    const current = () => frame.current?.contentWindow === page && currentDocument.current === page && releaseDocument.current === mounted;
    try {
      if (!authorRuntime) throw new Error('原生作者插件未启用');
      mounted = authorRuntime.mountProjectDocument(page, { projectId: project.id, entryFile, view: contextRef.current?.view || 'main', scope: project.scope,
        ...(project.scope === 'character' ? { characterId: project.characterId, ...(contextRef.current?.owner?.conversationId ? { conversationId: contextRef.current.owner.conversationId } : {}) } : {}) });
      releaseDocument.current = mounted;
      await mounted.ready;
      if (!current()) return;
      page.ElecKoiReady = Promise.resolve(page.ElecKoi);
      await activateFrontendScripts(page, current);
      if (current()) page.__ElecKoiCompleteSharedDocument();
    } catch (failure) {
      if (mounted && !current()) return;
      releaseDocument.current?.(); releaseDocument.current = null;
      page.__ElecKoiCompleteSharedDocument(failure);
      const message = `${project.name} · ${entryFile}: ${failure.message || String(failure)}`;
      setError(message); errorRef.current?.(message);
    }
  };
  return <div className="advanced-frontend-region" style={autoHeight ? { minHeight: slotHeight, width: '100%', flex: 'none' } : fullHeight ? { height: '100%' } : undefined}>
    {error ? <div className="frontend-state" role="alert">HTML 前端加载失败：{error}</div>
      : source ? <iframe ref={frame} name={channel} title={project.name} srcDoc={source} onLoad={loaded}
        allow="fullscreen; autoplay; clipboard-read; clipboard-write" /> : <div className="frontend-state" role="status">正在加载 HTML 前端…</div>}
  </div>;
}
