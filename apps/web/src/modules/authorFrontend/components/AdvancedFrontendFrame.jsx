import { useEffect, useId, useRef, useState } from 'react';
import { buildSharedFrontendDocument } from '../model/sharedFrontendDocument.js';
import { frontendAssetUrl } from '../model/applicationFrontendTargets.js';

/** Project identity owns the document; message updates never replace its DOM. */
export function AdvancedFrontendFrame({ project, runtime, request, entryFile = project.entryFile, revision, context, onError }) {
  const frame = useRef(null), [source, setSource] = useState(''), [error, setError] = useState('');
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
      documentWindow ||= currentDocument.current;
      if (!documentWindow) return;
      const id = documentWindow.__ElecKoiCompatibilityDocumentId;
      if (id) runtime.realm.release(id);
      documentWindow = null;
      currentDocument.current = null;
    };
    const fail = failure => {
      const message = `${project.name} · ${entryFile}: ${failure.message || String(failure)}`;
      if (mounted) { setError(message); errorRef.current?.(message); }
    };
    setError(''); setSource('');
    request('frontends.readFile', { projectId: project.id, path: entryFile }).then(result => {
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
  }, [channel, entryFile, project.id, project.updatedAt, revision, request, runtime, autoHeight]);
  return <div className="advanced-frontend-region" style={autoHeight ? { minHeight: slotHeight, width: '100%', flex: 'none' } : fullHeight ? { height: '100%' } : undefined}>
    {error ? <div className="frontend-state" role="alert">HTML 前端加载失败：{error}</div>
      : source ? <iframe ref={frame} name={channel} title={project.name} srcDoc={source} onLoad={() => { currentDocument.current = frame.current?.contentWindow; syncContext(); }}
        allow="fullscreen; autoplay; clipboard-read; clipboard-write" /> : <div className="frontend-state" role="status">正在加载 HTML 前端…</div>}
  </div>;
}
