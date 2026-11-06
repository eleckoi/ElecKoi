import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';
import { useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { buildAuthorDocumentSource } from '@eleckoi/author-sdk';
import { MainPageContext } from '../../../app/windows/MainPageContext.jsx';
import { FrontendDiagnostics } from './FrontendDiagnostics.jsx';
import { resolveFailure } from '../../../utils/failureText.js';

const noSubscription = () => () => {};
const noRuntime = () => null;

/** The injected native service owns SDK calls; React owns the document's DOM lifetime. */
export function NativeMessageFrame({ message, document, rootIndex = 0, onSettled, onHeight, initialHeight }) {
  const tUi = useProductTranslation();
  const view = useContext(MainPageContext);
  const connection = view?.characterConfiguration?.scriptRuntimeConnection;
  const runtime = useSyncExternalStore(connection?.subscribe || noSubscription, connection?.getSnapshot || noRuntime, noRuntime);
  const frame = useRef(null), release = useRef(null);
  const [height, setHeight] = useState(null), [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState([]);
  const settled = useRef(onSettled);
  const reportHeight = useRef(onHeight);
  settled.current = onSettled;
  reportHeight.current = onHeight;
  const channel = useMemo(() => crypto.randomUUID(), [message.conversationId, message.id, document.source, rootIndex, runtime]);
  const source = useMemo(() => buildAuthorDocumentSource(document.source, channel, true), [document.source, channel]);
  useLayoutEffect(() => {
    setError(''); setHeight(null); setDiagnostics([]);
    let ready = false, measured = false, reported = false;
    const reportReady = () => {
      if (!ready || !measured || reported) return;
      reported = true; settled.current?.({ status: 'ready' });
    };
    const receive = event => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === 'eleckoi:rich-height' && Number.isFinite(event.data.height)) {
        const nextHeight = Math.max(1, Math.ceil(event.data.height));
        setHeight(nextHeight);
        reportHeight.current?.(nextHeight);
        measured = true; reportReady();
      }
      if (event.data.type === 'eleckoi:frontend-ready') { ready = true; reportReady(); }
      if (event.data.type === 'eleckoi:frontend-diagnostic') {
        const diagnostic = String(event.data.message);
        setDiagnostics(current => current.includes(diagnostic) ? current : [...current, diagnostic]);
      }
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
    if (!runtime || error) settled.current?.({ status: 'error', error: error || tUi("原生作者插件未启用") });
  }, [runtime, error]);
  const loaded = () => {
    const target = frame.current?.contentWindow;
    if (!target || !runtime) return;
    let complete;
    try {
      complete = target.__ElecKoiCompleteDocument;
      if (target.__ElecKoiDocumentChannel !== channel) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '原生作者页面已离开所属文档', { what: '作者页面的所属文档' });
      if (release.current) return;
      release.current = runtime.mountDocument(target, message.conversationId, message.id);
      complete(target.ElecKoi);
    } catch (failure) {
      release.current?.(); release.current = null;
      complete?.(undefined, failure);
      setError(resolveFailure(failure, { fallback: tUi("原生作者页面加载失败") }).text);
    }
  };
  if (!runtime) return <div className="rich-message-error" role="alert">{tUi("原生作者插件未启用")}</div>;
  if (error) return <div className="rich-message-error" role="alert">{tUi("互动消息加载失败：")}{error}</div>;
  return <><iframe key={channel} ref={frame} name={channel} className="rich-message-frame" title={tUi("互动消息内容")}
    allow="fullscreen; autoplay; clipboard-read; clipboard-write" loading="eager" srcDoc={source}
    onLoad={loaded} style={{ height: height === null ? initialHeight ?? (globalThis.CSS?.supports?.('height', '100dvh') ? '100dvh' : '100vh') : `${height}px` }} />
    <FrontendDiagnostics messages={diagnostics} /></>;
}
