import { createServer, type RequestListener } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { LocalMediaStore } from '@eleckoi/dsh-product-data/media'
import { installProductMediaAssets } from '../src/productMediaAssets'

it('serves owned thumbnails with authenticated private caching, HEAD, ranges and original-byte preservation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-media-http-')), previous = process.env.ELECKOI_MEDIA_ROOT
  process.env.ELECKOI_MEDIA_ROOT = root
  const bytes = await sharp({ create: { width: 900, height: 1200, channels: 4, background: '#44998880' } }).png().toBuffer()
  const store = new LocalMediaStore(root), image = store.prepareImage('character/a', 'portrait', `data:image/png;base64,${bytes.toString('base64')}`)
  image.commit()
  let handler!: RequestListener
  installProductMediaAssets({ effect: (fn: () => unknown) => fn(), connection: { admit: (request: { headers: { authorization?: string } }) => request.headers.authorization === 'sample' ? {} : { rejection: 'test' } },
    webServer: { register: (entry: { handler: RequestListener }) => { handler = entry.handler; return () => {} } } } as unknown as Context)
  const server = createServer((req, res) => handler(req, res)); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const url = `http://127.0.0.1:${port}/eleckoi/media/asset?reference=${encodeURIComponent(image.reference + '?thumbnail=256')}`
  const get = (init: RequestInit = {}) => fetch(url, { ...init, headers: { authorization: 'sample', ...init.headers } })
  try {
    expect((await fetch(url)).status).toBe(401)
    const response = await get(), thumb = Buffer.from(await response.arrayBuffer())
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect((await sharp(thumb).metadata()).height).toBe(256)
    const head = await get({ method: 'HEAD' }); expect(head.headers.get('content-length')).toBe(String(thumb.length)); expect(await head.text()).toBe('')
    const cached = await get({ headers: { 'if-none-match': response.headers.get('etag')! } }); expect(cached.status).toBe(304)
    const range = await get({ headers: { range: 'bytes=1-9' } }); expect(range.status).toBe(206); expect(Buffer.from(await range.arrayBuffer())).toEqual(thumb.subarray(1, 10))
    const invalid = await get({ headers: { range: 'bytes=999999999-' } }); expect(invalid.status).toBe(416); await invalid.text()
    expect(readFileSync(store.pathForReference(image.reference)!)).toEqual(bytes)
    store.removeOwner('character/a')
    const removed = await get(); expect(removed.status).toBe(404); await removed.text()
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
    if (previous === undefined) delete process.env.ELECKOI_MEDIA_ROOT; else process.env.ELECKOI_MEDIA_ROOT = previous
    rmSync(root, { recursive: true, force: true })
  }
})
