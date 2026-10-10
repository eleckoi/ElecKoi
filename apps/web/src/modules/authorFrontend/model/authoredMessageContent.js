import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { detectRichMessagePresentation } from '@shared/foundation/richMessage';
import { splitRichMessageMedia } from '@shared/foundation/messageMedia.js';
import { ChatImageGallery } from '../../chat/index.js';
import imageStyles from '../styles/authoredMessageMedia.css?inline';
import { buildSharedFrontendDocument } from './sharedFrontendDocument.js';

/** The authored UI uses the same rich-document parser and shared realm as React. */
export function mountAuthoredMessageContent(runtime, view, container, initial) {
  if (container?.ownerDocument?.defaultView !== view) throw new TypeError('Message container must belong to the calling document');
  const converter = new view.showdown.Converter();
  const parts = new Map();
  let mediaStyle;
  let disposed = false;
  view.__ElecKoiClientCompatibility = runtime;
  const release = part => {
    part.root?.unmount();
    if (part.frame) {
      const id = part.frame.contentWindow?.__ElecKoiCompatibilityDocumentId;
      if (id) runtime.realm.release(id);
      view.removeEventListener('message', part.receive);
    }
    part.node.remove();
  };
  const update = ({ content = '', messageId, conversationId = '', images = [], role = 'assistant', streaming = false } = {}) => {
    if (disposed) throw new Error('Message content renderer has been disposed');
    const source = String(content);
    const rich = role === 'assistant' && !streaming ? detectRichMessagePresentation(source, false) : null;
    const next = role === 'assistant' ? splitRichMessageMedia(source, images, rich) : [{ kind: 'text', source }];
    const wanted = new Set();
    for (const [index, item] of next.entries()) {
      const signature = item.kind === 'rich' ? `${conversationId}:${messageId}:${item.document.contentKey}`
        : item.kind === 'image' ? JSON.stringify([conversationId, messageId, item.image]) : item.source;
      const key = item.kind === 'image' ? `image:${item.image.id || item.image.attachmentId || item.image.frameIndex}`
        : item.kind === 'rich' ? `rich:${item.document.contentKey}` : `text:${index}`;
      wanted.add(key);
      let part = parts.get(key);
      if (part && part.kind === 'rich' && part.signature !== signature) { release(part); parts.delete(key); part = null; }
      if (!part) {
        const node = view.document.createElement('div');
        node.className = `eleckoi-message-part eleckoi-message-${item.kind}`;
        part = { node, kind: item.kind };
        parts.set(key, part);
        if (item.kind === 'image') {
          // The authored document gets the same controls; its own CSS can override their presentation.
          if (!mediaStyle) {
            mediaStyle = view.document.createElement('style');
            mediaStyle.dataset.eleckoiMessageMedia = '';
            mediaStyle.textContent = `.eleckoi-message-image{white-space:normal;--chat:var(--surface,#fcfdfd);--control-bg:var(--tint,#285dd80d);--blue:var(--accent,#285dd8);--active:var(--tint,#285dd80d);--radius-sm:8px}.eleckoi-message-image .chat-image-gallery{display:flex;gap:10px;margin:10px 0}.eleckoi-message-image .chat-image-item{position:relative;margin:0;max-width:min(100%,280px);border-radius:12px}.eleckoi-message-image .chat-image-item>img{display:block;width:100%;height:auto;max-height:360px;object-fit:contain}` + imageStyles;
            view.document.head.append(mediaStyle);
          }
          part.root = createRoot(node);
        }
        if (item.kind === 'rich') {
          const channel = view.crypto.randomUUID(), frame = view.document.createElement('iframe');
          frame.title = '互动消息内容'; frame.className = 'rich-message-frame';
          frame.style.cssText = 'display:block;width:100%;height:1px;border:0;background:transparent';
          frame.setAttribute('allow', 'fullscreen; autoplay; clipboard-read; clipboard-write');
          part.frame = frame;
          part.receive = event => {
            if (event.source !== frame.contentWindow || event.data?.channel !== channel) return;
            if (event.data.type === 'eleckoi:rich-height' && Number.isFinite(Number(event.data.height))) {
              frame.style.height = `${Math.max(1, Math.ceil(Number(event.data.height)))}px`;
            } else if (event.data.type === 'eleckoi:frontend-error') {
              let error = node.querySelector('[role=alert]');
              if (!error) { error = view.document.createElement('div'); error.setAttribute('role', 'alert'); node.append(error); }
              error.textContent = `互动消息加载失败：${event.data.message}`;
            }
          };
          view.addEventListener('message', part.receive);
          frame.srcdoc = buildSharedFrontendDocument(item.document.source, runtime, { frameId: channel, channel, messageId, conversationId, rich: true });
          node.append(frame);
        }
      }
      if (part.signature !== signature) {
        if (part.kind === 'text') part.node.innerHTML = converter.makeHtml(item.source);
        else if (part.kind === 'image') part.root.render(createElement(ChatImageGallery, {
          images: [item.image], agentMessage: true, conversationId,
          loadImage: (id, image) => runtime.application.actions.conversations.readImage(id, image),
        }));
      }
      part.signature = signature;
      if (container.children[index] !== part.node) container.insertBefore(part.node, container.children[index] || null);
    }
    for (const [key, part] of parts) if (!wanted.has(key)) { release(part); parts.delete(key); }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const part of parts.values()) release(part);
    parts.clear();
    mediaStyle?.remove();
  };
  update(initial);
  return Object.freeze({ update, dispose });
}
