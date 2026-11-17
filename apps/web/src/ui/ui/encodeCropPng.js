import { DesktopError } from '@shared/foundation/DesktopError';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';

/** One crop owns its PNG encoder and releases it after completion or cancellation. */
export async function encodeCropPng(canvas, signal) {
  signal?.throwIfAborted();
  if (typeof Worker !== 'function' || typeof createImageBitmap !== 'function'
    || typeof OffscreenCanvas !== 'function' || typeof OffscreenCanvas.prototype.convertToBlob !== 'function') {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    signal?.throwIfAborted();
    return blob;
  }
  const bitmap = await createImageBitmap(canvas);
  try {
    signal?.throwIfAborted();
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./cropPng.worker.js', import.meta.url), { type: 'module' });
      let done = false;
      const finish = (error, blob) => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', cancel);
        worker.onmessage = worker.onerror = worker.onmessageerror = null;
        worker.terminate();
        if (error) reject(error); else resolve(blob);
      };
      const cancel = () => finish(signal.reason);
      worker.onmessage = event => {
        if (event.data?.blob instanceof Blob && event.data.blob.type === 'image/png' && event.data.blob.size > 0) finish(null, event.data.blob);
        else if (event.data?.error?.isDSHRemoteError === true) finish(event.data.error);
        else finish(new DesktopError(ELECKOI_FAILURE_CODES.mediaInvalid, 'PNG 编码未返回有效图片。', { what: '裁剪后的图片' }));
      };
      worker.onerror = event => finish(new DesktopError(ELECKOI_FAILURE_CODES.internal, event.message || 'PNG 编码失败。', { what: 'PNG 编码 Worker' }));
      worker.onmessageerror = () => finish(new DesktopError(ELECKOI_FAILURE_CODES.contractInvalidResponse, 'PNG 编码结果无法读取。', { issues: [{ path: 'blob', message: '无法读取 Worker 返回的 PNG 编码结果。' }] }));
      signal?.addEventListener('abort', cancel, { once: true });
      try { worker.postMessage(bitmap, [bitmap]); } catch (error) { finish(error); }
    });
  } finally { bitmap.close(); }
}
