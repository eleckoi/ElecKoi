// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ChatImageGallery } from '../../src/ui/messages/ChatImageGallery.jsx';
import { generatedImageSegments } from '../../src/ui/messages/generatedImagePresentation.js';
import { HistoricalImageCache } from '@deepseek-ai/dsh-client-ui-conversation/src/client/conversation/historical-images.ts';

let root, container;
beforeEach(() => {
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const image = { id: 'synthetic-batch:2', batchId: 'synthetic-batch', frameId: 2, status: 'ready',
  attachmentId: 'synthetic-image', name: 'synthetic.png', dataUrl: 'data:image/png;base64,YQ==', width: 480, height: 960 };
const render = props => act(() => root.render(<ChatImageGallery images={[image]} conversationId="synthetic-chat" {...props} />));
const click = element => act(() => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('submitted image preview handoff', () => {
  function officialCache() {
    vi.stubGlobal('URL', Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:canonical-image'), revokeObjectURL: vi.fn(),
    }));
    let resolveRead, rejectRead;
    const read = vi.fn(() => new Promise((resolve, reject) => { resolveRead = resolve; rejectRead = reject; }));
    const disposers = [];
    const ctx = { effect: dispose => { disposers.push(dispose()); return () => {}; } };
    const binding = { ctx, session: { readAttachment: read } };
    const cache = new HistoricalImageCache(ctx, { binding: id => id === 'session-one' ? binding : undefined });
    const load = Object.assign(vi.fn((_id, ref) => cache.resolve('session-one', ref)), {
      peek: vi.fn((_id, ref) => cache.peek('session-one', ref)),
    });
    return { cache, load, read, resolve: result => resolveRead(result), reject: error => rejectRead(error), dispose: () => disposers.reverse().forEach(dispose => dispose()) };
  }

  it.each([false, true])('keeps the preview visible until the official durable read finishes (agent=%s)', async agentMessage => {
    const official = officialCache();
    const preview = 'data:image/png;base64,cHJldmlldw==';
    const admitted = { attachmentId: 'sha256:submitted-image', mediaType: 'image/png', width: 640, height: 480, name: 'synthetic.png' };
    try {
      await render({ images: [{ ...admitted, attachmentId: 'pending-request-1', dataUrl: preview }], loadImage: official.load, agentMessage });
      expect(container.querySelector('img').getAttribute('src')).toBe(preview);
      expect(official.cache.seed('session-one', admitted, preview)).toBe(true);
      // The durable attachment remounts the thumbnail after the echo retires.
      await render({ images: [admitted], loadImage: official.load, agentMessage });
      const thumbnail = container.querySelector('img');
      expect(thumbnail?.getAttribute('src')).toBe(preview);
      expect(container.querySelector('[aria-label$="加载中"]')).toBeNull();
      expect(thumbnail.getAttribute('width')).toBe('640');
      expect(thumbnail.getAttribute('height')).toBe('480');
      for (let tick = 0; tick < 3; tick++) {
        await render({ images: [{ ...admitted }], loadImage: official.load, agentMessage });
        expect(container.querySelector('img')).toBe(thumbnail);
        expect(thumbnail.getAttribute('src')).toBe(preview);
      }
      await act(() => official.resolve({ ok: true, value: { attachment: admitted, data: new Uint8Array([99, 97, 110, 111, 110, 105, 99, 97, 108]) } }));
      expect(container.querySelector('img')).toBe(thumbnail);
      expect(thumbnail.getAttribute('src')).toBe('blob:canonical-image');
      expect(official.read).toHaveBeenCalledOnce();
    } finally { official.dispose(); }
  });

  it('shows failure if the official admitted read fails and never uses another session preview', async () => {
    const official = officialCache();
    const admitted = { attachmentId: 'sha256:submitted-image', mediaType: 'image/png', width: 640, height: 480 };
    try {
      expect(official.cache.seed('session-one', admitted, 'data:image/png;base64,cHJldmlldw==')).toBe(true);
      expect(official.cache.peek('session-two', admitted)).toBeUndefined();
      await render({ images: [admitted], loadImage: official.load });
      expect(container.querySelector('img')).not.toBeNull();
      await act(() => official.reject(new Error('synthetic read failure')));
      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[aria-label="图片加载失败"]')).not.toBeNull();
    } finally { official.dispose(); }
  });
});

describe('single generated image actions', () => {
  it('opens a full image preview on click and closes it with Back', async () => {
    await render(); await click(container.querySelector('figure'));
    expect(document.querySelector('[aria-label="图片预览"] img').src).toBe(image.dataUrl);
    await act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[aria-label="图片预览"]')).toBeNull();
  });
  it('long press shows download and single-image regeneration, without regenerating the reply', async () => {
    vi.useFakeTimers(); const regenerate = vi.fn(async () => {}), download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await render({ onRegenerateImage: regenerate });
    await act(() => container.querySelector('figure').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 20 })));
    await act(() => vi.advanceTimersByTime(501));
    const menu = document.querySelector('[aria-label="图片菜单"]');
    expect([...menu.querySelectorAll('button')].map(button => button.textContent)).toEqual(['下载图片', '重新生成', '取消']);
    await click(menu.querySelector('button'));
    expect(download).toHaveBeenCalledOnce(); expect(download.mock.instances[0].download).toBe('synthetic.png');
    await act(() => container.querySelector('figure').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    await click([...document.querySelectorAll('[aria-label="图片菜单"] button')].find(button => button.textContent === '重新生成'));
    expect(regenerate).toHaveBeenCalledExactlyOnceWith(image);
    expect(document.querySelector('[aria-label="图片预览"]')).toBeNull();
  });
  it('shows a retry on a failed image and keeps the error visible if retry fails', async () => {
    const failed = { ...image, attachmentId: undefined, dataUrl: undefined, status: 'failed', error: '合成错误' };
    const regenerate = vi.fn(async () => { throw new Error('合成重画失败'); });
    await render({ images: [failed], onRegenerateImage: regenerate });
    const retry = container.querySelector('.chat-image-retry');
    expect(retry.textContent).toBe('重新生成'); await click(retry);
    expect(regenerate).toHaveBeenCalledExactlyOnceWith(failed);
    // 失败面同时给文案与码：状态里存的是失败本身（不是一句话）。
    const alert = container.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('合成重画失败');
    expect(alert.textContent).toContain('eleckoi/internal');
  });
  it('cancels long press while scrolling', async () => {
    vi.useFakeTimers(); await render({ onRegenerateImage: async () => {} }); const target = container.querySelector('figure');
    await act(() => target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 20 })));
    await act(() => target.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 40 })));
    await act(() => vi.advanceTimersByTime(600));
    expect(document.querySelector('[aria-label="图片菜单"]')).toBeNull();
  });
  it('places exact image IDs in the reply and groups only consecutive markers', () => {
    const first = { ...image, id: 'first', frameId: 1 }, third = { ...image, id: 'third', frameId: 3 };
    expect(generatedImageSegments('前文\n[[IMAGE:1]]\n[[IMAGE:2]]\n中间\n[[IMAGE:3]]\n后文', [first, image, third]).map(part => part.type)).toEqual(['text', 'images', 'text', 'images', 'text']);
    expect(generatedImageSegments('前文\n[[IMAGE:2]]', [first, image])[1].images).toEqual([image]);
  });
  it('waits for the streaming frame marker even when the image finished first', () => {
    for (const text of ['', '合成正文', '合成正文\n[[IMAGE:', '合成正文\n[[IMAGE:2]']) {
      const parts = generatedImageSegments(text, [image], true);
      expect(parts.some(part => part.type === 'images')).toBe(false);
      expect(parts.map(part => part.content).join('')).not.toContain('[[IMAGE:');
    }
    expect(generatedImageSegments('合成正文\n[[IMAGE:2]]', [image], true)[1].images).toEqual([image]);
  });
});
