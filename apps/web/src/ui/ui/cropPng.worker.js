/** Encode the already-cropped pixels without the page canvas idle scheduler. */
self.onmessage = async event => {
  const bitmap = event.data;
  let canvas;
  try {
    canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前设备无法处理图片。');
    context.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    bitmap.close();
    if (canvas) canvas.width = canvas.height = 0;
  }
};
