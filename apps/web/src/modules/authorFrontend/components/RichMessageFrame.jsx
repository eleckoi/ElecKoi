import { useProductTranslation } from "../../../app/i18n/ProductLocaleContext.jsx";
import { useContext, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { mountFrontendCompatibility } from '@eleckoi/tavern-frontend';
import { MainPageContext } from '../../../app/windows/MainPageContext.jsx';
import { useHtmlResources } from '../../../ui/hooks/useHtmlResources.js';
import { buildRichMessageHtml } from '../model/buildRichMessageHtml.js';
import { readAuthorDocumentDeclaration } from '@eleckoi/author-sdk';
import { NativeMessageFrame } from './NativeMessageFrame.jsx';
import { FrontendDiagnostics } from './FrontendDiagnostics.jsx';
import { useRichMessageRenderPermission } from '../hooks/RichMessageRenderContext.jsx';

const minimumHeight = 1;
const noSubscription = () => () => {};
const noRuntime = () => null;

function createChannel() {
  return globalThis.crypto?.randomUUID?.() || `rich-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function RichMessageFrame(props) {
  const tUi = useProductTranslation();
  const permission = useRichMessageRenderPermission(props.message.id);
  const declaration = useMemo(() => readAuthorDocumentDeclaration(props.document.source), [props.document.source]);
  const identity = useMemo(() => ({}), [props.message.conversationId, props.message.id, props.document.source, props.rootIndex]);
  const [measurement, setMeasurement] = useState(null);
  const height = measurement?.identity === identity ? measurement.height : undefined;
  const settled = useRef(props.onSettled);
  settled.current = props.onSettled;
  useLayoutEffect(() => {
    if (declaration.kind === 'unsupported') settled.current?.({ status: 'error', error: declaration.error });
    else if (!permission.active) settled.current?.({ status: 'deferred' });
  }, [declaration, permission.active, identity]);
  if (declaration.kind === 'unsupported') return <div className="rich-message-error" role="alert">{tUi("互动消息加载失败：")}{declaration.error}</div>;
  const onHeight = value => setMeasurement(current => current?.identity === identity && current.height === value
    ? current : { identity, height: value });
  return <div className={`rich-message-container${permission.managed ? ' is-managed' : ''}`}>
    {permission.active ? <>
      {declaration.kind === 'native' ? <NativeMessageFrame {...props} onHeight={onHeight} initialHeight={height} />
        : <SharedMessageFrame {...props} onHeight={onHeight} initialHeight={height} />}
      {permission.manual && (props.rootIndex ?? 0) === 0 && <button type="button" className="rich-message-stop" onClick={permission.stop}>{tUi("停止此楼层富消息")}</button>}
    </> : <div className="rich-message-placeholder" style={height == null ? undefined : { minHeight: height }}>
      <button type="button" className="rich-message-load" onClick={permission.load}>{tUi("加载此楼层富消息")}</button>
    </div>}
  </div>;
}

function SharedMessageFrame({ message, document, rootIndex = 0, onSettled, onHeight, initialHeight }) {
  const tUi = useProductTranslation();
  const { runtime, state } = useHtmlResources();
  const view = useContext(MainPageContext);
  const connection = view?.characterConfiguration?.scriptRuntimeConnection;
  const authorRuntime = useSyncExternalStore(connection?.subscribe || noSubscription, connection?.getSnapshot || noRuntime, noRuntime);
  const release = useRef(null);
  const frameRef = useRef(null);
  const [height, setHeight] = useState(null);
  const [error, setError] = useState('');
  const [diagnostics, setDiagnostics] = useState([]);
  const settled = useRef(onSettled);
  const reportHeight = useRef(onHeight);
  settled.current = onSettled;
  reportHeight.current = onHeight;
  const channel = useMemo(createChannel, [message.conversationId, message.id, document.contentKey, rootIndex, authorRuntime]);
  const committedDocument = useMemo(() => ({ source: null }), [channel, document.source, message.id, runtime]);
  const source = useMemo(() => runtime && state.status === 'ready'
    ? buildRichMessageHtml(document, channel, runtime, { messageId: message.id, conversationId: message.conversationId })
    // Projection refreshes must not destroy an unchanged author's document.
    : state.status === 'waiting-for-chat' ? committedDocument.source : null,
    [channel, committedDocument, document.source, message.id, message.conversationId, runtime, state.status]);
  useLayoutEffect(() => {
    if (source && state.status === 'ready') committedDocument.source = source;
  }, [committedDocument, source, state.status]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    // Register and reset before the iframe can report its first height.
    setError(''); setHeight(null); setDiagnostics([]);
    let ready = false, measured = false, reported = false;
    const reportReady = () => {
      if (!ready || !measured || reported) return;
      reported = true;
      settled.current?.({ status: 'ready' });
    };
    const receive = event => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === 'eleckoi:rich-height') {
        const value = Number(event.data.height);
        if (Number.isFinite(value)) {
          const nextHeight = Math.max(minimumHeight, Math.ceil(value));
          setHeight(nextHeight);
          reportHeight.current?.(nextHeight);
          measured = true; reportReady();
        }
      } else if (event.data.type === 'eleckoi:frontend-ready') {
        ready = true; reportReady();
      } else if (event.data.type === 'eleckoi:frontend-diagnostic') {
        const diagnostic = String(event.data.message);
        setDiagnostics(current => current.includes(diagnostic) ? current : [...current, diagnostic]);
      } else if (event.data.type === 'eleckoi:frontend-error') {
        const failure = String(event.data.message);
        setError(failure);
        if (!reported) { reported = true; settled.current?.({ status: 'error', error: failure }); }
      }
    };
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      release.current?.(); release.current = null;
    };
  }, [channel, runtime, source]);
  useLayoutEffect(() => {
    if (state.status === 'error') settled.current?.({ status: 'error', error: state.error });
  }, [state.status, state.error]);
  const loaded = () => {
    const page = frameRef.current?.contentWindow;
    if (!page || page.__ElecKoiDocumentChannel !== channel || release.current) return;
    const report = failure => {
      const text = failure?.message || String(failure);
      setDiagnostics(current => current.includes(text) ? current : [...current, text]);
    };
    try {
      const mount = mountFrontendCompatibility(page,
        authorRuntime ? () => authorRuntime.mountDocument(page, message.conversationId, message.id) : undefined, report);
      release.current = mount.dispose;
      const current = () => release.current === mount.dispose && frameRef.current?.contentWindow === page;
      void mount.ready.then(() => { if (current()) page.__ElecKoiCompleteSharedDocument(); }, failure => {
        if (current()) { report(failure); page.__ElecKoiCompleteSharedDocument(failure); }
      });
    } catch (failure) { report(failure); page.__ElecKoiCompleteSharedDocument(failure); }
  };
  if (error || state.status === 'error') return <div className="rich-message-error" role="alert">{tUi("互动消息加载失败：")}{error || state.error}</div>;
  if (!source) return <div className="rich-message-loading" role="status">{tUi("正在加载互动消息…")}</div>;
  return <><iframe key={channel} ref={frameRef} name={channel} className="rich-message-frame" title={tUi("互动消息内容")}
    allow="fullscreen; autoplay; clipboard-read; clipboard-write" loading="eager" srcDoc={source} onLoad={loaded}
    style={{ height: height === null ? initialHeight ?? (globalThis.CSS?.supports?.('height', '100dvh') ? '100dvh' : '100vh') : `${height}px` }} />
    <FrontendDiagnostics messages={diagnostics} /></>;
}
