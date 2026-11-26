// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AvatarCropModal } from '../../src/ui/ui/AvatarCropModal.jsx';
import { encodeCropPng } from '../../src/ui/ui/encodeCropPng.js';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';

globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container?.remove(); root = null;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function fixture(mode = 'success', beforeSave, cropOptions) {
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
      queueMicrotask(() => this.onmessage({ data: mode === 'failure'
        ? { error: { isDSHRemoteError: true, code: ELECKOI_FAILURE_CODES.mediaInvalid, message: 'Synthetic PNG encoder failed', details: { what: '合成裁剪图片' } } }
        : { blob: new Blob(['synthetic-png'], { type: 'image/png' }) } }));
    });
  });
  const drawing = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), clip: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(drawing);
  const pageEncoder = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => { throw new Error('Slow page PNG encoding selected'); });
  const onSave = vi.fn(async () => {});
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<AvatarCropModal file={new File(['synthetic-source'], 'cover.png', { type: 'image/png' })}
    title="Synthetic cover crop" cropWidth={210} cropHeight={280} outputWidth={900} outputShape="portrait" onCancel={() => {}} onSave={onSave} {...cropOptions} />));
  const image = document.querySelector('.avatar-crop-image-transform img');
  Object.defineProperties(image, { naturalWidth: { value: 1800 }, naturalHeight: { value: 2400 } });
  await act(async () => image.dispatchEvent(new Event('load')));
  if (beforeSave) await beforeSave({ image, drawing });
  const save = [...document.querySelectorAll('button')].find(button => button.textContent === '保存');
  await act(async () => save.click());
  return { bitmap, workers, onSave, pageEncoder };
}

async function pointer(type, id, x, y) {
  const stage = document.querySelector('.avatar-crop-stage');
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, button: 0 });
  await act(async () => stage.dispatchEvent(event));
}

it('pinches around the fingers, continues one-finger dragging and saves that crop', async () => {
  let cropDrawing;
  const f = await fixture('success', async ({ drawing }) => {
    cropDrawing = drawing;
    const stage = document.querySelector('.avatar-crop-stage');
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 440, height: 320 });
    await pointer('pointerdown', 1, 200, 160); await pointer('pointerdown', 2, 280, 160);
    await pointer('pointermove', 1, 160, 160); await pointer('pointermove', 2, 320, 160);
    expect(Number(document.querySelector('.avatar-crop-zoom').value)).toBe(2);
    expect(document.querySelector('.avatar-crop-image-transform').style.transform).toBe('translate(-20px, 0px) rotate(0deg)');
    await pointer('pointerup', 2, 320, 160);
    await pointer('pointermove', 1, 170, 160);
    expect(document.querySelector('.avatar-crop-image-transform').style.transform).toBe('translate(-10px, 0px) rotate(0deg)');
    await pointer('pointercancel', 1, 170, 160); await pointer('pointermove', 1, 400, 300);
    expect(document.querySelector('.avatar-crop-image-transform').style.transform).toBe('translate(-10px, 0px) rotate(0deg)');
  });
  const [, x, y, width, height] = cropDrawing.drawImage.mock.calls[1];
  expect(x).toBeCloseTo(492.857142857); expect(y).toBeCloseTo(600);
  expect(width).toBeCloseTo(900); expect(height).toBeCloseTo(1200);
  expect(f.onSave).toHaveBeenCalledOnce();
});

it('keeps pinch limits and resets cancelled pointers before the next gesture', async () => {
  await fixture('success', async () => {
    const stage = document.querySelector('.avatar-crop-stage');
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 440, height: 320 });
    await pointer('pointerdown', 1, 210, 160); await pointer('pointerdown', 2, 230, 160);
    await pointer('pointermove', 1, 60, 160); await pointer('pointermove', 2, 380, 160);
    expect(Number(document.querySelector('.avatar-crop-zoom').value)).toBe(3);
    await pointer('pointermove', 1, 219, 160); await pointer('pointermove', 2, 221, 160);
    expect(Number(document.querySelector('.avatar-crop-zoom').value)).toBe(1);
    await pointer('lostpointercapture', 1, 219, 160); await pointer('pointercancel', 2, 221, 160);
    await pointer('pointerdown', 3, 180, 160); await pointer('pointerdown', 4, 260, 160);
    await pointer('pointermove', 3, 140, 160); await pointer('pointermove', 4, 300, 160);
    expect(Number(document.querySelector('.avatar-crop-zoom').value)).toBe(2);
    expect(document.querySelector('.avatar-crop-image-transform').style.transform).toBe('translate(0px, 0px) rotate(0deg)');
  });
});

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

it('reopens an existing crop and saves its position without encoding a second image', async () => {
  const onSaveTransform = vi.fn();
  const initialTransform = { zoom: 1.5, offset: { x: 22, y: 8 }, rotation: 90 };
  const f = await fixture('success', undefined, { initialTransform, onSaveTransform });
  expect(document.querySelector('.avatar-crop-image-transform').style.transform).toBe('translate(22px, 8px) rotate(90deg)');
  expect(onSaveTransform).toHaveBeenCalledExactlyOnceWith(initialTransform);
  expect(f.onSave).not.toHaveBeenCalled();
  expect(f.workers).toHaveLength(0);
  expect(f.pageEncoder).not.toHaveBeenCalled();
});

it('shows the encoder failure and releases its worker without changing the cover', async () => {
  const f = await fixture('failure');
  expect(f.onSave).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('图片或音频不符合要求：合成裁剪图片');
  expect(f.workers[0].terminate).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
});

it('preserves a real worker capability failure across the message boundary and releases both sides', async () => {
  const f = await fixture('pending');
  const canvases = [], sent = [];
  const workerBitmap = { width: 900, height: 1200, close: vi.fn() };
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(width, height) { this.width = width; this.height = height; canvases.push(this); }
    getContext() { return null; }
  });
  vi.stubGlobal('self', { postMessage: message => { sent.push(structuredClone(message)); f.workers[0].onmessage({ data: sent.at(-1) }); } });
  await import('../../src/ui/ui/cropPng.worker.js');
  await act(async () => self.onmessage({ data: workerBitmap }));
  expect(sent).toEqual([{ error: { isDSHRemoteError: true, code: ELECKOI_FAILURE_CODES.inputUnsupported,
    message: '当前设备无法处理图片。', details: { what: '设备上的图片处理能力' } } }]);
  expect(document.body.textContent).toContain('不支持这个格式、版本或能力：设备上的图片处理能力');
  expect(f.onSave).not.toHaveBeenCalled();
  expect(f.pageEncoder).not.toHaveBeenCalled();
  expect(f.workers[0].terminate).toHaveBeenCalledOnce();
  expect(workerBitmap.close).toHaveBeenCalledOnce();
  expect(f.bitmap.close).toHaveBeenCalledOnce();
  expect([canvases[0].width, canvases[0].height]).toEqual([0, 0]);
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
