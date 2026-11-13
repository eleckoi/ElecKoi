import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildSharedFrontendDocument } from '../model/sharedFrontendDocument.js';
import { resolveFailure } from '../../../utils/failureText.js';
import { frontendAssetUrl } from '../model/applicationFrontendTargets.js';
import { readAuthorDocumentDeclaration } from '@eleckoi/author-sdk';
import { useNativeFrontendServices } from '../hooks/NativeFrontendContext.jsx';
import { NativeProjectFrame } from './NativeProjectFrame.jsx';
import { mountFrontendCompatibility } from '@eleckoi/tavern-frontend';

/** Document metadata selects a runtime; undeclared source is never rewritten as native. */
export function AdvancedFrontendFrame(props) {
  const tUi = useProductTranslation();
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
      if (declaration.kind === 'unsupported') throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, declaration.error, { what: '原生作者 SDK 声明' });
      if (nativeOnly && declaration.kind !== 'native') throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, '页面缺少 eleckoi-author-api 原生 SDK 声明', { what: '页面里的原生作者 SDK 声明', path: entryFile });
      setLoaded({ identity, document: { content: result.content, declaration } });
    }).catch(reason => { if (active) { const message = `${project.name} · ${entryFile}: ${resolveFailure(reason, { fallback: tUi("前端页面加载失败") }).text}`; setLoaded({ identity, error: message }); report.current?.(message); } });
    return () => { active = false; };
  }, [request, project.id, project.updatedAt, entryFile, revision, identity, nativeOnly]);
  if (loaded?.identity !== identity) return <div className="frontend-state" role="status">{tUi("正在加载 HTML 前端…")}</div>;
  if (loaded.error) return <div className="frontend-state" role="alert">{tUi("HTML 前端加载失败：")}{loaded.error}</div>;
  const document = loaded.document;
  if (document.declaration.kind === 'native') return <NativeProjectFrame {...props} entryFile={entryFile} content={document.content} runtime={authorRuntime} />;
  return <LegacyProjectFrame {...props} authorRuntime={authorRuntime} entryFile={entryFile} content={document.content} />;
}

/** Project identity owns the document; message updates never replace its DOM. */
function LegacyProjectFrame({ project, runtime, authorRuntime, request, content, entryFile = project.entryFile, revision, context, onError }) {
  const tUi = useProductTranslation();
  const releaseCompatibility = useRef(null), mountedCompatibility = useRef(null);
  const frame = useRef(null), [source, setSource] = useState(''), [error, setError] = useState('');
  const [slotHeight, setSlotHeight] = useState(180), currentDocument = useRef(null);
  const autoHeight = context?.binding?.target === 'slot' && context?.binding?.slot !== 'main';
  const fullHeight = context?.binding?.target === 'root' || context?.binding?.target === 'page' || context?.binding?.slot === 'main';
  const instance = useId();
  const generation = useMemo(() => crypto.randomUUID(), [project.id, project.updatedAt, entryFile, revision, content, runtime, authorRuntime, request]);
  const channel = `frontend:${project.id}:${instance}:${generation}`;
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
      releaseCompatibility.current?.(); releaseCompatibility.current = null; mountedCompatibility.current = null;
      documentWindow ||= currentDocument.current;
      if (!documentWindow) return;
      documentWindow = null;
      currentDocument.current = null;
    };
    const fail = failure => {
      const message = `${project.name} · ${entryFile}: ${resolveFailure(failure, { fallback: tUi("前端页面加载失败") }).text}`;
      if (mounted) { setError(message); errorRef.current?.(message); }
    };
    setError(''); setSource('');
    Promise.resolve({ content }).then(result => {
      if (!mounted) return;
      const folder = entryFile.includes('/') ? entryFile.slice(0, entryFile.lastIndexOf('/') + 1).split('/').map(encodeURIComponent).join('/') : '';
      const baseUrl = `/eleckoi/frontends/${encodeURIComponent(project.id)}/${folder}`;
      setSource(buildSharedFrontendDocument(result.content, runtime, { channel, frameId: channel, baseUrl, characterId: project.scope === 'character' ? project.characterId : undefined, context: contextRef.current, autoHeight,
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
  const mountCompatibility = () => {
    const page = frame.current?.contentWindow;
    if (!page || page.__ElecKoiDocumentChannel !== channel || mountedCompatibility.current === page) return;
    const report = failure => { const text = `${project.name} · ${entryFile}: ${failure?.message || String(failure)}`; setError(text); errorRef.current?.(text); };
    try {
      const mount = mountFrontendCompatibility(page, authorRuntime ? () => authorRuntime.mountProjectDocument(page, {
        projectId: project.id, entryFile, view: contextRef.current?.view || 'main', scope: project.scope,
        ...(project.scope === 'character' ? { characterId: project.characterId,
          ...(contextRef.current?.owner?.conversationId ? { conversationId: contextRef.current.owner.conversationId } : {}) } : {}),
      }) : undefined, report);
      mountedCompatibility.current = page; releaseCompatibility.current = mount.dispose;
      const current = () => releaseCompatibility.current === mount.dispose && mountedCompatibility.current === page;
      void mount.ready.then(() => { if (current()) page.__ElecKoiCompleteSharedDocument(); }, failure => {
        if (current()) { report(failure); page.__ElecKoiCompleteSharedDocument(failure); }
      });
    } catch (failure) { report(failure); page.__ElecKoiCompleteSharedDocument(failure); }
  };
  return <div className="advanced-frontend-region" style={{ position: 'relative', minWidth: 0, minHeight: 0, flex: 1, display: 'flex', ...(autoHeight ? { minHeight: slotHeight, width: '100%', flex: 'none' } : fullHeight ? { height: '100%' } : {}) }}>
    {error ? <div className="frontend-state" role="alert">{tUi("HTML 前端加载失败：")}{error}</div>
      : source ? <iframe key={channel} ref={frame} name={channel} title={project.name} srcDoc={source} onLoad={() => { currentDocument.current = frame.current?.contentWindow; syncContext(); mountCompatibility(); }}
        allow="fullscreen; autoplay; clipboard-read; clipboard-write" style={{ width: '100%', height: '100%', border: 0, position: 'absolute', inset: 0, background: 'transparent', ...(autoHeight ? { height: slotHeight, flex: 'none' } : {}) }} /> : <div className="frontend-state" role="status">{tUi("正在加载 HTML 前端…")}</div>}
  </div>;
}
