// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AvatarCropModal } from '../../src/ui/ui/AvatarCropModal.jsx';
import { encodeCropPng } from '../../src/ui/ui/encodeCropPng.js';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove(); root = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function fixture(mode = 'success') {
  const BrowserURL = globalThis.URL;
  vi.stubGlobal('URL', class extends BrowserURL { static createObjectURL() { return 'blob:synthetic-crop'; } static revokeObjectURL() {} });
  const bitmap = { width: 900, height: 1200, close: vi.fn() };
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
  vi.stubGlobal('OffscreenCanvas', class { convertToBlob() {} });
  const workers = [];
  vi.stubGlobal('Worker', class {
    constructor(url, options) { this.url = url; this.options = options; this.terminate = vi.fn(); workers.push(this); }
    postMessage = vi.fn(() => {
      if (mode === 'pending') return;
      queueMicrotask(() => this.onmessage({ data: mode === 'failure' ? { error: 'Synthetic PNG encoder failed' } : { blob: new Blob(['synthetic-png'], { type: 'image/png' }) } }));
    });
  });
  const drawing = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), clip: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawing);
  const pageEncoder = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => { throw new Error('Slow page PNG encoding selected'); });
  const onSave = vi.fn(async () => {});
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<AvatarCropModal file={new File(['synthetic-source'], 'cover.png', { type: 'image/png' })}
    title="Synthetic cover crop" cropWidth={210} cropHeight={280} outputWidth={900} outputShape="portrait" onCancel={() => {}} onSave={onSave} />));
  const image = document.querySelector('.avatar-crop-image-transform img');
  Object.defineProperties(image, { naturalWidth: { value: 1800 }, naturalHeight: { value: 2400 } });
  await act(async () => image.dispatchEvent(new Event('load')));
  const save = [...document.querySelectorAll('button')].find(button => button.textContent === '保存');
  await act(async () => save.click());
  return { bitmap, workers, onSave, pageEncoder };
}

it('saves the cover through a worker while the page PNG encoder is unavailable', async () => {
  const f = await fixture();
  expect(f.onSave).toHaveBeenCalledOnce();
  const [file] = f.onSave.mock.calls[0];
  expect(file).toMatchObject({ name: 'cover-cropped.png', type: 'image/png', size: 13 });
  expect(f.pageEncoder).not.toHaveBeenCalled();
  expect(f.workers).toHaveLength(1);
  expect(f.workers[0].postMessage).toHaveBeenCalledWith(f.bitmap, [f.bitmap]);
  expect(f.workers[0].terminate).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
});

it('shows the encoder failure and releases its worker without changing the cover', async () => {
  const f = await fixture('failure');
  expect(f.onSave).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Synthetic PNG encoder failed');
  expect(f.workers[0].terminate).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
});

it('terminates pending encoding on exit without saving a late result', async () => {
  const f = await fixture('pending');
  await act(async () => root.unmount()); root = null;
  expect(f.workers[0].terminate).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect(f.onSave).not.toHaveBeenCalled();
});

it('uses the existing encoder when worker canvas encoding is unavailable', async () => {
  vi.stubGlobal('Worker', undefined);
  const blob = new Blob(['synthetic-png'], { type: 'image/png' });
  const canvas = { toBlob: vi.fn(callback => callback(blob)) };
  await expect(encodeCropPng(canvas)).resolves.toBe(blob);
  expect(canvas.toBlob).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 'image/png');
});

it('closes a late bitmap after cancellation without starting another worker', async () => {
  const f = await fixture();
  const bitmap = { close: vi.fn() }, abort = new AbortController();
  let finish;
  createImageBitmap.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const encoding = encodeCropPng({}, abort.signal);
  abort.abort(); finish(bitmap);
  await expect(encoding).rejects.toBe(abort.signal.reason);
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(f.workers).toHaveLength(1);
});

it('closes its bitmap and reports a worker startup error', async () => {
  await fixture();
  const bitmap = { close: vi.fn() };
  createImageBitmap.mockResolvedValueOnce(bitmap);
  vi.stubGlobal('Worker', class { constructor() { throw new Error('Synthetic worker blocked'); } });
  await expect(encodeCropPng({})).rejects.toThrow('Synthetic worker blocked');
  expect(bitmap.close).toHaveBeenCalledOnce();
});
