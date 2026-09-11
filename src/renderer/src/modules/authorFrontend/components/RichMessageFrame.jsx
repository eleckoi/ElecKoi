import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { desktopClient } from '../../../bridge/desktopClient.ts';
import { buildRichMessageHtml } from '../model/buildRichMessageHtml.js';
import {
  normalizeRichMessageViewportWidth,
} from '../model/richMessageHeightCache.js';
import { rememberRichMessageHeight } from '../model/richMessageHeights.js';

const minimumHeight = 1;

function createChannel() {
  return globalThis.crypto?.randomUUID?.() || `rich-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function RichMessageFrame({ message, document, rootIndex = 0 }) {
  const frameRef = useRef(null);
  const lastSavedRef = useRef('');
  const viewportWidthRef = useRef(0);
  const identity = useMemo(() => ({
    conversationId: message.conversationId,
    messageId: message.id,
    contentRevision: document.contentKey,
    rootIndex,
  }), [document.contentKey, message.conversationId, message.id, rootIndex]);
  const [height, setHeight] = useState(minimumHeight);
  const channel = useMemo(createChannel, [document.contentKey, message.id]);
  const source = useMemo(
    () => buildRichMessageHtml(document, channel),
    [channel, document.kind, document.source],
  );

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const applyViewportWidth = () => {
      const viewportWidthPx = normalizeRichMessageViewportWidth(frame.clientWidth || 1);
      if (viewportWidthRef.current === viewportWidthPx) return;
      viewportWidthRef.current = viewportWidthPx;
      // A document that uses 100vh must be measured from a collapsed viewport.
      // Reusing its previous iframe height turns that height into a permanent
      // minimum and leaves false blank space below otherwise shorter content.
      setHeight(minimumHeight);
    };
    applyViewportWidth();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(applyViewportWidth);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [identity]);

  useEffect(() => {
    const receive = async (event) => {
      const frameWindow = frameRef.current?.contentWindow;
      const data = event.data;
      if (event.source !== frameWindow || !data) return;
      if (data.channel !== channel) return;
      if (data.type === 'eleckoi:rich-height') {
        const viewportWidthPx = normalizeRichMessageViewportWidth(
          frameRef.current?.clientWidth || data.viewportWidth || 1,
        );
        viewportWidthRef.current = viewportWidthPx;
        const measuredHeight = Math.ceil(Number(data.height));
        const next = Number.isFinite(measuredHeight)
          ? Math.max(minimumHeight, measuredHeight)
          : minimumHeight;
        setHeight(next);
        const saveKey = `${viewportWidthPx}:${next}`;
        if (lastSavedRef.current !== saveKey) {
          lastSavedRef.current = saveKey;
          rememberRichMessageHeight({ ...identity, viewportWidthPx, heightPx: next });
        }
        return;
      }
      if (data.type !== 'eleckoi:author-request' || typeof data.request !== 'string') return;
      let response;
      try {
        const result = await desktopClient.request('command.author_sdk.invoke', {
          conversationId: message.conversationId,
          messageId: message.id,
          request: data.request,
        });
        response = result.response;
      } catch (error) {
        let id = '';
        try { id = String(JSON.parse(data.request)?.id || ''); } catch { /* invalid requests keep an empty id */ }
        response = JSON.stringify({
          id,
          ok: false,
          error: { code: error?.code || 'BRIDGE_ERROR', message: error?.message || '作者 API 调用失败' },
        });
      }
      try {
        const authorRequest = JSON.parse(data.request);
        const authorResponse = JSON.parse(response);
        if (authorResponse?.ok && (authorRequest?.method === 'chat.send' || authorRequest?.method === 'openings.select')) {
          window.dispatchEvent(new CustomEvent('eleckoi:author-action', { detail: {
            conversationId: message.conversationId,
            method: authorRequest.method,
            result: authorResponse.result,
          } }));
        }
      } catch { /* the SDK response still returns to the frame */ }
      frameWindow?.postMessage({ type: 'eleckoi:author-response', channel, response }, '*');
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [channel, identity, message.conversationId, message.id]);

  return (
    <iframe
      ref={frameRef}
      className="rich-message-frame"
      title="互动消息内容"
      allow="fullscreen; autoplay; clipboard-read; clipboard-write"
      loading="eager"
      srcDoc={source}
      style={{ height: `${height}px` }}
    />
  );
}
