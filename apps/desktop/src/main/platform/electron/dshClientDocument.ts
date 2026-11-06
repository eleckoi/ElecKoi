import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

const bootGate = `<script>globalThis.__DSH_BOOT_READY__ = Promise.withResolvers()</script>
<style>
[data-dsh-boot-spinner] {
  box-sizing: border-box !important;
  width: 24px !important;
  height: 24px !important;
  border: 2px solid var(--dsw-alias-border-l2, var(--dsh-boot-border)) !important;
  border-top-color: var(--dsw-alias-brand-primary, var(--dsh-boot-brand)) !important;
  border-radius: 50% !important;
  corner-shape: round !important;
}
[data-dsh-boot-spinner]::after { display: none !important; }
</style>`
const mimeTypes: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}
const withheldHeaders = [
  'set-cookie', 'content-encoding', 'content-length', 'transfer-encoding',
  'connection', 'keep-alive', 'te', 'trailer', 'upgrade',
  'proxy-authenticate', 'proxy-authorization'
]

export const DSH_CLIENT_ORIGIN = 'dsh-app://app'

export function isDshClientAsset(pathname: string): boolean {
  return pathname === '/' || pathname === '/index.html' || pathname.startsWith('/assets/')
    || pathname === '/favicon.svg' || pathname === '/favicon-dark.svg'
    || pathname === '/manifest.webmanifest'
}

export async function serveDshClientAsset(request: Request, frontendDirectory: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
  let pathname: string
  try { pathname = decodeURIComponent(new URL(request.url).pathname) }
  catch { return new Response(null, { status: 400 }) }
  if (!isDshClientAsset(pathname)) return new Response(null, { status: 404 })
  const root = resolve(frontendDirectory)
  const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
  if (!target.startsWith(root + sep)) return new Response(null, { status: 403 })
  let body: Buffer
  try { body = await readFile(target) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 })
    throw error
  }
  const content = pathname === '/' || pathname === '/index.html'
    ? body.toString().replace('<head>', '<head>' + bootGate)
    : new Uint8Array(body)
  return new Response(request.method === 'HEAD' ? null : content, {
    headers: { 'content-type': mimeTypes[extname(target)] ?? 'application/octet-stream' }
  })
}

export async function authenticateDshClientHost(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'manual' })
  const cookie = response.headers.get('set-cookie')
  await response.body?.cancel()
  if (response.status !== 303 || cookie === null) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed, 'DSH 插件宿主鉴权失败。', { operation: 'authenticate', what: 'DSH 插件宿主' })
  }
  const end = cookie.indexOf(';')
  return end < 0 ? cookie : cookie.slice(0, end)
}

export async function forwardDshClientRequest(request: Request, host: string, cookie: string): Promise<Response> {
  const source = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== DSH_CLIENT_ORIGIN) return new Response(null, { status: 403 })
  const target = new URL(host)
  target.pathname = source.pathname
  target.search = source.search
  const headers = new Headers(request.headers)
  for (const name of ['host', 'origin', 'cookie', 'sec-fetch-site']) headers.delete(name)
  headers.set('cookie', cookie)
  const init: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers,
    body: request.body,
    signal: request.signal,
    duplex: 'half',
    redirect: 'manual'
  }
  const response = await fetch(target, init)
  const outgoing = new Headers(response.headers)
  for (const name of withheldHeaders) outgoing.delete(name)
  if (source.pathname.startsWith('/plugins/')) outgoing.set('cache-control', 'no-store')
  return new Response(response.body, { status: response.status, headers: outgoing })
}
