import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { ELECKOI_FAILURE_CODES, productFailure } from '@eleckoi/dsh-product-api'

const baseUrl = '/eleckoi/assets/'
const mime: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp'
}

/** Publish product assets through the same Host that serves the official Web GUI. */
export async function installWebClientAssets(ctx: Context, directory: string): Promise<void> {
  const html = await readFile(resolve(directory, 'dsh.html'), 'utf8')
  const script = html.match(/<script\b[^>]*\bsrc="\.\/assets\/([^"/]+\.js)"/i)?.[1]
  const style = html.match(/<link\b[^>]*\bhref="\.\/assets\/([^"/]+\.css)"/i)?.[1]
  if (!script || !style) {
    throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'ElecKoi WebClient build is incomplete', { what: 'ElecKoi WebClient 构建产物' })
  }
  const root = resolve(directory, 'assets')
  await Promise.all([readFile(resolve(root, script)), readFile(resolve(root, style))])
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'global', name: '__ELECKOI_CLIENT_ASSETS__', value: {
      baseUrl, script: baseUrl + script, style: baseUrl + style
    } })
  })
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: baseUrl.slice(0, -1), resource: async request => {
    let pathname: string
    try { pathname = decodeURIComponent(new URL(request.url).pathname) }
    catch { return new Response(null, { status: 400 }) }
    if (!pathname.startsWith(baseUrl)) return new Response(null, { status: 404 })
    const target = resolve(root, pathname.slice(baseUrl.length))
    if (!target.startsWith(root + sep)) return new Response(null, { status: 403 })
    let content: Buffer
    try { content = await readFile(target) }
    catch (error) {
      if (['ENOENT', 'EISDIR', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        return new Response(null, { status: 404 })
      }
      throw error
    }
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(content), {
      headers: { 'Content-Type': mime[extname(target)] ?? 'application/octet-stream' }
    })
  } }), 'eleckoi: shared WebClient assets')
}
