import { readFile } from 'node:fs/promises';

/** Resolve original Author resources from real native attachments, never an invented path. */
export async function readAuthorMediaResource(input, attachments, migratedPaths = []) {
  const id = input.id || input.attachmentId;
  if (!id) throw new Error('Author media resource has no stable attachment identity');
  const mimeType = input.mimeType || input.mediaType || 'application/octet-stream';
  const type = input.type || (mimeType.startsWith('image/') ? 'image' : mimeType.startsWith('audio/') ? 'audio' : 'file');
  let url = input.url || '';
  if (!url && input.attachmentId) {
    if (!attachments) throw new Error('Native attachment service is not mounted');
    if (type === 'image') {
      const actual = await attachments.readImage(input);
      url = `data:${actual.ref.mediaType};base64,${Buffer.from(actual.data).toString('base64')}`;
    } else {
      const path = attachments.fileHostPath(input);
      if (!path) throw new Error(`Native attachment file is unavailable: ${id}`);
      url = `data:${mimeType};base64,${(await readFile(path)).toString('base64')}`;
    }
  }
  if (!url) {
    const reference = input.localPath || input.path || input.reference;
    if (typeof reference === 'string' && reference.startsWith('eleckoi-media://')) url = `/eleckoi/media/asset?reference=${encodeURIComponent(reference)}`;
    else if (migratedPaths.some(item => [item.original, item.target, item.reference].includes(reference))) url = `/eleckoi/media/migrated?reference=${encodeURIComponent(reference)}`;
  }
  if (!url) throw new Error(`Author media resource cannot be resolved: ${id}`);
  return { ...input, id, type, url, mimeType, name: input.name || '', size: input.size ?? input.bytes ?? 0,
    width: input.width ?? null, height: input.height ?? null, duration: input.duration ?? null, metadata: input.metadata ?? {} };
}
