import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildAuthorDocumentSource } from '@eleckoi/author-sdk';
import { frontendAssetUrl } from '../model/applicationFrontendTargets.js';
import { activateFrontendScripts, deferFrontendScripts } from '../model/sharedFrontendDocument.js';

/** Native project documents contain only their own assets and the native SDK bootstrap. */
export function NativeProjectFrame({ content, project, entryFile, revision, context, runtime, onError }) {
  const frame = useRef(null), release = useRef(null), mountedPage = useRef(null);
  const currentContext = useRef(context), report = useRef(onError);
  currentContext.current = context; report.current = onError;
  const [error, setError] = useState(''), [height, setHeight] = useState(180);
  const instance = useId();
  const characterId = project.scope === 'character' ? project.characterId : undefined;
  const conversationId = project.scope === 'character' ? context?.owner?.conversationId : undefined;
  const identity = useMemo(() => crypto.randomUUID(), [content, project.id, entryFile, revision, project.updatedAt, runtime, characterId, conversationId]);
  const channel = `native-project:${instance}:${identity}`;
  const autoHeight = context?.binding?.target === 'slot' && context?.binding?.slot !== 'main';
  const fullHeight = context?.binding?.target === 'root' || context?.binding?.target === 'page' || context?.binding?.slot === 'main';
  const source = useMemo(() => {
    const folder = entryFile.includes('/') ? entryFile.slice(0, entryFile.lastIndexOf('/') + 1).split('/').map(encodeURIComponent).join('/') : '';
    return buildAuthorDocumentSource(deferFrontendScripts(content), channel, autoHeight, {
      baseUrl: `/eleckoi/frontends/${encodeURIComponent(project.id)}/${folder}`, context: currentContext.current,
      globalStyles: (project.manifest?.globalStyles || []).map(path => frontendAssetUrl(project, path, revision)),
    });
  }, [content, channel, autoHeight, project.id, project.manifest, entryFile, revision]);
  const close = () => { release.current?.(); release.current = null; mountedPage.current = null; };
  const fail = reason => {
    close(); const message = `${project.name} · ${entryFile}: ${reason?.message || String(reason)}`;
    setError(message); report.current?.(message);
  };
  const sync = () => {
    const page = frame.current?.contentWindow;
    if (!page || page.__ElecKoiDocumentChannel !== channel) return;
    const rect = frame.current.getBoundingClientRect();
    page.ElecKoiFrontendContext = { ...(currentContext.current || {}), container: { width: rect.width, height: rect.height } };
    page.dispatchEvent(new page.CustomEvent('eleckoi:frontend-context', { detail: page.ElecKoiFrontendContext }));
  };
  const load = async () => {
    const page = frame.current?.contentWindow;
    if (!page || page.__ElecKoiDocumentChannel !== channel || mountedPage.current === page) return;
    let mounted;
    const current = () => frame.current?.contentWindow === page && page.__ElecKoiDocumentChannel === channel && release.current === mounted;
    try {
      close(); sync();
      if (!runtime) throw new Error('原生作者插件未启用');
      mounted = runtime.mountProjectDocument(page, { projectId: project.id, entryFile, view: currentContext.current?.view || 'main', scope: project.scope,
        ...(project.scope === 'character' ? { characterId, ...(conversationId ? { conversationId } : {}) } : {}) });
      release.current = mounted; mountedPage.current = page;
      await mounted.ready;
      if (!current()) return;
      page.__ElecKoiCompleteDocument(page.ElecKoi);
      await activateFrontendScripts(page, current);
    } catch (reason) { if (!mounted || current()) { page.__ElecKoiCompleteDocument(undefined, reason); fail(reason); } }
  };
  useEffect(() => {
    setError('');
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === 'eleckoi:frontend-error') fail(event.data.message);
      if (autoHeight && event.data.type === 'eleckoi:rich-height' && Number.isFinite(event.data.height)) setHeight(Math.max(1, event.data.height));
    };
    window.addEventListener('message', receive);
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    if (frame.current) resize?.observe(frame.current);
    load();
    return () => { window.removeEventListener('message', receive); resize?.disconnect(); close(); };
  }, [channel, source, runtime, autoHeight]);
  useEffect(sync, [JSON.stringify(context ?? null)]);
  return <div className="advanced-frontend-region" style={autoHeight ? { minHeight: height, width: '100%', flex: 'none' } : fullHeight ? { height: '100%' } : undefined}>
    {error || !runtime ? <div className="frontend-state" role="alert">HTML 前端加载失败：{error || '原生作者插件未启用'}</div>
      : <iframe key={channel} ref={frame} name={channel} title={project.name} srcDoc={source} onLoad={load} style={autoHeight ? { height, flex: 'none' } : undefined}
        allow="fullscreen; autoplay; clipboard-read; clipboard-write" />}
  </div>;
}
