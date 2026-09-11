import { AUTHOR_FRONTEND_SOURCE } from '@eleckoi/author-sdk';

function scriptString(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
}

function hostBootstrap(channel) {
  return `
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta charset="utf-8">
<base target="_blank">
<style>
  :root { color-scheme: light dark; }
  html, body { min-width: 0; margin: 0; padding: 0; overflow: hidden; background: transparent; color: inherit; }
  body { font: 14px/1.5 "Microsoft YaHei UI", "Segoe UI", sans-serif; overflow-wrap: anywhere; }
  *, *::before, *::after { box-sizing: border-box; }
  img, video, canvas, svg { max-width: 100%; }
</style>
<script>
(() => {
  'use strict';
  const channel = ${scriptString(channel)};
  const send = (type, payload = {}) => parent.postMessage({ type, channel, ...payload }, '*');
  const watchedFrames = new WeakSet();
  const transport = {
    postMessage(value) {
      send('eleckoi:author-request', { request: String(value) });
    },
    onmessage: undefined
  };
  Object.defineProperty(window, 'ElecKoiNative', { value: transport, configurable: false });
  addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== parent || !data || data.channel !== channel || data.type !== 'eleckoi:author-response') return;
    transport.onmessage?.({ data: String(data.response || '') });
    queueMicrotask(scheduleHeight);
  });
  addEventListener('eleckoi:author-pending-change', () => {
    scheduleHeight();
  });
  addEventListener('click', (event) => {
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    event.preventDefault();
    send('eleckoi:rich-link', { url: link.href });
  }, true);
  const measure = () => {
    const root = document.documentElement;
    const body = document.body;
    const height = Math.max(1, Math.ceil(body?.scrollHeight || 0));
    return {
      height,
      viewportWidth: Math.ceil(root?.clientWidth || innerWidth || 1)
    };
  };
  const reportHeight = () => {
    const measured = measure();
    send('eleckoi:rich-height', measured);
  };
  let scheduled = false;
  const scheduleHeight = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      reportHeight();
    });
  };
  const watchFrame = frame => {
    if (!(frame instanceof HTMLIFrameElement) || watchedFrames.has(frame)) return;
    watchedFrames.add(frame);
    const loaded = () => {
      scheduleHeight();
    };
    frame.addEventListener('load', loaded);
    try {
      if (frame.contentDocument?.readyState === 'complete' && frame.src !== 'about:blank') loaded();
    } catch { /* cross-origin frames publish readiness through their load event */ }
  };
  const watchFramesWithin = root => {
    if (root instanceof HTMLIFrameElement) watchFrame(root);
    root?.querySelectorAll?.('iframe').forEach(watchFrame);
  };
  document.addEventListener('load', (event) => {
    scheduleHeight();
  }, true);
  document.addEventListener('error', scheduleHeight, true);
  const observeDocument = () => {
    const observedRoot = document.body || document.documentElement;
    if (typeof ResizeObserver === 'function') new ResizeObserver(scheduleHeight).observe(observedRoot);
    if (typeof MutationObserver === 'function') new MutationObserver((records) => {
      records.forEach(record => {
        record.addedNodes?.forEach(watchFramesWithin);
      });
      scheduleHeight();
    }).observe(observedRoot, { attributes: true, childList: true, characterData: true, subtree: true });
    watchFramesWithin(observedRoot);
    document.fonts?.addEventListener?.('loadingdone', scheduleHeight);
    document.fonts?.addEventListener?.('loadingerror', scheduleHeight);
    scheduleHeight();
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', observeDocument, { once: true });
  else observeDocument();
  addEventListener('load', scheduleHeight, { once: true });
})();
</script>
<script>${AUTHOR_FRONTEND_SOURCE}</script>`;
}

function injectIntoDocument(source, injection) {
  const head = /<head(?:\s[^>]*)?>/i.exec(source);
  if (head?.index !== undefined) {
    const index = head.index + head[0].length;
    return source.slice(0, index) + injection + source.slice(index);
  }
  const html = /<html(?:\s[^>]*)?>/i.exec(source);
  if (html?.index !== undefined) {
    const index = html.index + html[0].length;
    return source.slice(0, index) + `<head>${injection}</head>` + source.slice(index);
  }
  if (/<body(?:\s[^>]*)?>/i.test(source)) {
    return `<!doctype html><html><head>${injection}</head>${source}</html>`;
  }
  return `<!doctype html><html><head>${injection}</head><body>${source}</body></html>`;
}

export function buildRichMessageHtml(document, channel) {
  const injection = hostBootstrap(channel);
  return document.kind === 'full-document'
    ? injectIntoDocument(document.source, injection)
    : `<!doctype html><html><head>${injection}</head><body>${document.source}</body></html>`;
}
