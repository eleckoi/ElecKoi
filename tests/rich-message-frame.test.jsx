// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as libraries from '@eleckoi/compatibility-tavern-shared/browser-libraries';
import { RichMessageFrame } from '../apps/web/src/modules/authorFrontend/components/RichMessageFrame.jsx';
import { registerOverlayBack } from '../apps/web/src/ui/hooks/overlayBack.js';

let root, container, state, listeners, runtime;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state = { status: 'ready', error: '', methods: [] }; listeners = new Set();
  runtime = { assetsBaseUrl: '/eleckoi/compat/', sdk: libraries, getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, realm: { release: vi.fn() } };
  window.__ElecKoiClientCompatibility = runtime;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount()); container.remove();
  delete window.__ElecKoiClientCompatibility; vi.unstubAllGlobals();
});
const props = { message: { id: 'rich-a', conversationId: 'chat-a' }, document: { contentKey: 'content-a', source: '<div>card</div>' } };
const publish = status => act(() => { state = { ...state, status }; listeners.forEach(listener => listener()); });

describe('rich message document lifecycle', () => {
  it('keeps an unchanged iframe through streaming and later durable message refreshes', async () => {
    await act(() => root.render(<RichMessageFrame {...props} />));
    const frame = container.querySelector('iframe'), source = frame.srcdoc;
    frame.contentWindow.localCardState = 'retained';
    await act(() => root.render(<RichMessageFrame {...props} message={{ ...props.message, streamingTail: 'synthetic delta' }} />));
    await publish('waiting-for-chat'); await publish('ready');
    await act(() => root.render(<RichMessageFrame {...props} message={{ ...props.message, laterMessageId: 'user-b' }} />));
    expect(container.querySelector('iframe')).toBe(frame); expect(frame.srcdoc).toBe(source);
    expect(frame.contentWindow.localCardState).toBe('retained');
  });
  it('replaces document identity only when authored content changes', async () => {
    await act(() => root.render(<RichMessageFrame {...props} />));
    const first = container.querySelector('iframe').srcdoc;
    await act(() => root.render(<RichMessageFrame {...props} document={{ contentKey: 'content-b', source: '<div>updated card</div>' }} />));
    expect(container.querySelector('iframe').srcdoc).not.toBe(first);
    expect(container.querySelector('iframe').srcdoc).toContain('updated card');
  });
  it('lets the top extension overlay consume Back, then releases its listeners', () => {
    const underlying = vi.fn(), first = vi.fn(() => true), second = vi.fn(() => true);
    window.addEventListener('eleckoi:platform-back', underlying);
    const stopFirst = registerOverlayBack(first), stopSecond = registerOverlayBack(second, window, 200);
    try {
      window.dispatchEvent(new Event('eleckoi:platform-back', { cancelable: true }));
      expect(second).toHaveBeenCalledOnce(); expect(first).not.toHaveBeenCalled(); expect(underlying).not.toHaveBeenCalled();
      stopSecond(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      expect(first).toHaveBeenCalledOnce();
      stopFirst(); window.dispatchEvent(new Event('eleckoi:platform-back'));
      expect(underlying).toHaveBeenCalledOnce();
    } finally { stopFirst(); stopSecond(); window.removeEventListener('eleckoi:platform-back', underlying); }
  });
});
