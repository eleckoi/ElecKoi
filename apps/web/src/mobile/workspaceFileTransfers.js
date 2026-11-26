import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes';
import { DesktopError } from '@shared/foundation/DesktopError';

const chunkSize = 64 * 1024;
const transferFailure = (message, field) => new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, message, { what: field });

export async function importWorkspaceFile(model, sessionId, path, file, signal) {
  const stream = model.importWorkspaceFile(sessionId, path, file.name, file.size, signal);
  let offset = 0;
  let complete = false;
  try {
    for await (const frame of stream) {
      signal.throwIfAborted();
      if (frame.kind === 'complete') {
        complete = offset === file.size;
        continue;
      }
      if (frame.offset !== offset || complete) throw transferFailure('Invalid workspace upload acknowledgement', file.name);
      if (offset === file.size) {
        stream.end();
        continue;
      }
      const bytes = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
      signal.throwIfAborted();
      let binary = '';
      for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      stream.send(btoa(binary));
      offset += bytes.length;
    }
    signal.throwIfAborted();
    if (!complete) throw transferFailure('Workspace upload ended without committing the file', file.name);
  } finally { stream.dispose(); }
}

export async function exportWorkspaceFiles(model, sessionId, path, entries, platform, signal) {
  const remote = model.exportWorkspaceFiles(sessionId, path, entries, signal);
  try {
    const iterator = remote[Symbol.asyncIterator]();
    const first = await iterator.next();
    signal.throwIfAborted();
    if (first.done || first.value.kind !== 'file') throw transferFailure('Workspace export did not send file metadata', '导出文件');
    const { name, mime } = first.value;
    const bytes = new ReadableStream({
      async pull(controller) {
        signal.throwIfAborted();
        remote.send(true);
        const next = await iterator.next();
        signal.throwIfAborted();
        if (next.done) throw transferFailure('Workspace export ended before completing the file', name);
        if (next.value.kind === 'complete') { controller.close(); return; }
        if (next.value.kind !== 'chunk') throw transferFailure('Workspace export sent unexpected metadata', name);
        controller.enqueue(Uint8Array.from(atob(next.value.data), char => char.charCodeAt(0)));
      },
      cancel() { remote.dispose(); },
    }, { highWaterMark: 0 });
    return await platform.saveStream(name, bytes, mime);
  } finally { remote.dispose(); }
}
