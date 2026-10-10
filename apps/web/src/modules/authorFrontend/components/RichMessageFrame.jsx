import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSharedFrontendRuntime } from '../../../ui/hooks/useSharedFrontendRuntime.js';
import { buildRichMessageHtml } from '../model/buildRichMessageHtml.js';

const minimumHeight = 1;

function createChannel() {
  return globalThis.crypto?.randomUUID?.() || `rich-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function RichMessageFrame({ message, document, rootIndex = 0 }) {
  const { runtime, state } = useSharedFrontendRuntime();
  const frameRef = useRef(null);
  const [height, setHeight] = useState(minimumHeight);
  const [error, setError] = useState('');
  const channel = useMemo(createChannel, [message.conversationId, message.id, document.contentKey, rootIndex]);
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
    if (!frame) return undefined;
    let width = frame.clientWidth;
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      if (width === frame.clientWidth) return;
      width = frame.clientWidth; setHeight(minimumHeight);
    }) : null;
    observer?.observe(frame);
    return () => observer?.disconnect();
  }, [channel, source]);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    // Register and reset before the iframe can report its first height.
    setError(''); setHeight(minimumHeight);
    const receive = event => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === 'eleckoi:rich-height') {
        const value = Number(event.data.height);
        if (Number.isFinite(value)) setHeight(Math.max(minimumHeight, Math.ceil(value)));
      } else if (event.data.type === 'eleckoi:frontend-error') setError(String(event.data.message));
    };
    window.addEventListener('message', receive);
    return () => {
      window.removeEventListener('message', receive);
      const id = frame?.contentWindow?.__ElecKoiCompatibilityDocumentId;
      if (id) runtime?.realm?.release(id);
    };
  }, [channel, runtime, source]);
  if (error || state.status === 'error') return <div className="rich-message-error" role="alert">互动消息加载失败：{error || state.error}</div>;
  if (!source) return <div className="rich-message-loading" role="status">正在加载互动消息…</div>;
  return <iframe ref={frameRef} className="rich-message-frame" title="互动消息内容"
    allow="fullscreen; autoplay; clipboard-read; clipboard-write" loading="eager" srcDoc={source}
    style={{ height: `${height}px` }} />;
}
