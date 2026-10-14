import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { resolveLocalMediaPath } from '@eleckoi/dsh-product-data/media'
import type {} from '@eleckoi/dsh-product-api'
import type {} from '@deepseek-ai/dsh-host-webserver'

const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg', '.pdf': 'application/pdf',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.ttc': 'font/collection', '.woff': 'font/woff', '.woff2': 'font/woff2' }

/** Serve the original product's local media references through the official same-origin Host. */
export function installProductMediaAssets(ctx: Context) {
  const root = process.env.ELECKOI_MEDIA_ROOT
  if (!root) throw new Error('Product media root is required')
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/eleckoi/media', handler(request, response) {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return }
    if ('rejection' in ctx.connection.admit(request)) { response.writeHead(401); response.end(); return }
    const url = new URL(request.url ?? '/', 'http://localhost'), reference = url.searchParams.get('reference') ?? ''
    let path: string | undefined
    if (url.pathname === '/eleckoi/media/asset') path = resolveLocalMediaPath(root, reference)
    if (!path || !existsSync(path) || !statSync(path).isFile()) { response.writeHead(404); response.end('Media resource does not exist'); return }
    const size = statSync(path).size, headers: Record<string, string | number> = { 'Content-Type': mime[extname(path).toLowerCase()] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes' }
    let start = 0, end = size - 1, status = 200
    if (request.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range)
      if (!range || (!range[1] && !range[2])) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return }
      start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
      if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    }
    headers['Content-Length'] = Math.max(0, end - start + 1)
    response.writeHead(status, headers)
    if (request.method === 'HEAD' || size === 0) { response.end(); return }
    const stream = createReadStream(path, { start, end }); stream.on('error', error => response.destroy(error)); stream.pipe(response)
  } }), 'eleckoi: product media assets')
}
