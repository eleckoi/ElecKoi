import { DesktopError } from '@shared/foundation/DesktopError';
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { foldFailure } from '@shared/foundation/failure';

/** Encode the already-cropped pixels without the page canvas idle scheduler. */
self.onmessage = async event => {
  const bitmap = event.data;
  let canvas;
  try {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, '当前设备无法处理图片。', { what: '设备上的图片处理能力' });
    context.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: { isDSHRemoteError: true, ...foldFailure(error) } });
  } finally {
    bitmap.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
};
