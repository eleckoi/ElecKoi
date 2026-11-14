import { gunzipSync } from 'node:zlib'
import { isPng, readPngArchive, readPngText } from '../../src/storage/media/PngTextChunkCodec'
import { readBundle } from '../../src/domain/characterTransfer/characterBundle'

/** Inspect the document contained in a PNG or ZIP export for preservation assertions. */
export function characterExportRoot(file: { base64: string }): Record<string, any> {
  const bytes = Buffer.from(file.base64, 'base64')
  if (!isPng(bytes)) return readBundle(bytes)
  const archive = readPngArchive(bytes)
  if (archive) return readBundle(archive)
  const payload = readPngText(bytes).get('eleckoi-card')
  if (!payload) throw new Error('Missing character document in PNG export')
  return JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'))
}
