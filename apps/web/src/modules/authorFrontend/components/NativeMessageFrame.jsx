import { useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { buildAuthorDocumentSource } from '@eleckoi/author-sdk';
import { MainPageContext } from '../../../app/windows/MainPageContext.jsx';
import { activateFrontendScripts, deferFrontendScripts } from '../model/sharedFrontendDocument.js';

const noSubscription = () => () => {};
const noRuntime = () => null;

/** The injected native service owns SDK calls; React owns the document's DOM lifetime. */
export function NativeMessageFrame({ message, document, rootIndex = 0, onSettled }) {
  const view = useContext(MainPageContext);
  const connection = view?.characterConfiguration?.scriptRuntimeConnection;
  const runtime = useSyncExternalStore(connection?.subscribe || noSubscription, connection?.getSnapshot || noRuntime, noRuntime);
  const frame = useRef(null), release = useRef(null);
  const [height, setHeight] = useState(1), [error, setError] = useState('');
  const settled = useRef(onSettled);
  settled.current = onSettled;
  const channel = useMemo(() => crypto.randomUUID(), [message.conversationId, message.id, document.source, rootIndex, runtime]);
  const source = useMemo(() => buildAuthorDocumentSource(deferFrontendScripts(document.source), channel, true), [document.source, channel]);
  useLayoutEffect(() => {
    setError(''); setHeight(1);
    let ready = false, measured = false, reported = false;
    const reportReady = () => {
      if (!ready || !measured || reported) return;
      reported = true; settled.current?.({ status: 'ready' });
    };
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === 'eleckoi:rich-height' && Number.isFinite(event.data.height)) {
        setHeight(Math.max(1, Math.ceil(event.data.height)));
        measured = true; reportReady();
      }
      if (event.data.type === 'eleckoi:frontend-ready') { ready = true; reportReady(); }
      if (event.data.type === 'eleckoi:frontend-error') {
        release.current?.(); release.current = null;
        const failure = String(event.data.message);
        setError(failure);
        if (!reported) { reported = true; settled.current?.({ status: 'error', error: failure }); }
      }
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); release.current?.(); release.current = null; };
  }, [channel, runtime]);
  useLayoutEffect(() => {
    if (!runtime || error) settled.current?.({ status: 'error', error: error || '原生作者插件未启用' });
  }, [runtime, error]);
  const loaded = async () => {
    const target = frame.current?.contentWindow;
    if (!target || !runtime) return;
    let complete, mounted;
    const current = () => frame.current?.contentWindow === target && target.__ElecKoiDocumentChannel === channel && release.current === mounted;
    try {
      complete = target.__ElecKoiCompleteDocument;
      if (target.__ElecKoiDocumentChannel !== channel) throw new Error('原生作者页面已离开所属文档');
      if (release.current) return;
      mounted = runtime.mountDocument(target, message.conversationId, message.id);
      release.current = mounted;
      await mounted.ready;
      if (!current()) return;
      complete(target.ElecKoi);
      await activateFrontendScripts(target, current);
    } catch (failure) {
      if (mounted && !current()) return;
      release.current?.(); release.current = null;
      complete?.(undefined, failure);
      setError(failure.message || String(failure));
    }
  };
  if (!runtime) return <div className="rich-message-error" role="alert">原生作者插件未启用</div>;
  if (error) return <div className="rich-message-error" role="alert">互动消息加载失败：{error}</div>;
  return <iframe key={channel} ref={frame} name={channel} className="rich-message-frame" title="互动消息内容"
    allow="fullscreen; autoplay; clipboard-read; clipboard-write" loading="eager" srcDoc={source}
    onLoad={loaded} style={{ height: `${height}px` }} />;
}
