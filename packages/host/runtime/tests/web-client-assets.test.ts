import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { afterEach, expect, it } from 'vitest'
import { installWebClientAssets } from '@eleckoi/dsh-runtime'
import { ownerPeer } from '../../../../tests/support/owner-peer.js'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close()
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'eleckoi-web-assets-'))
  cleanups.push(async () => {
    const child = relative(tmpdir(), directory)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Invalid temporary directory')
    await rm(directory, { recursive: true, force: true })
  })
  await mkdir(join(directory, 'assets'))
  await writeFile(join(directory, 'dsh.html'), '<link href="./assets/product.css"><script src="./assets/product.js"></script>')
  await writeFile(join(directory, 'assets/product.css'), '.product { color: red }')
  await writeFile(join(directory, 'assets/product.js'), 'globalThis.productLoaded = true')
  await writeFile(join(directory, 'secret.txt'), 'outside the asset directory')
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  return { ctx, directory, origin: ctx.webServer.getOrigin() }
}

it('delivers product boot inputs and assets through HTTP without an Electron preload', async () => {
  const { ctx, directory, origin } = await fixture()
  await installWebClientAssets(ctx, directory)
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/', handler: (_request, response) => {
    response.setHeader('Content-Type', 'text/html')
    response.end(ctx.webServer.renderIndex('<html><head></head><body></body></html>', ownerPeer(ctx)))
  } }))
  const page = await fetch(origin)
  const html = await page.text()
  expect(html).toContain('__ELECKOI_CLIENT_ASSETS__')
  expect(html).toContain('/eleckoi/assets/product.js')
  expect(html).not.toContain('dsh-app:')
  const script = await fetch(new URL('/eleckoi/assets/product.js', origin))
  expect(script.status).toBe(200)
  expect(script.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
  expect(await script.text()).toBe('globalThis.productLoaded = true')
  const internal = await ctx.webServer.readResource(new Request(new URL('/eleckoi/assets/product.js', origin)), ownerPeer(ctx))
  expect(internal.status).toBe(200)
  expect(await internal.text()).toBe('globalThis.productLoaded = true')
  const style = await fetch(new URL('/eleckoi/assets/product.css', origin))
  expect(style.headers.get('content-type')).toBe('text/css; charset=utf-8')
  expect(await style.text()).toBe('.product { color: red }')
}, 15_000)

it('keeps asset requests inside the built directory and preserves HTTP method handling', async () => {
  const { ctx, directory, origin } = await fixture()
  await installWebClientAssets(ctx, directory)
  const request = (path: string, method = 'GET') => fetch(origin + path, { method })
  const head = await request('/eleckoi/assets/product.js', 'HEAD')
  expect(head.status).toBe(200)
  expect(await head.text()).toBe('')
  const post = await request('/eleckoi/assets/product.js', 'POST')
  expect(post.status).toBe(405)
  expect(post.headers.get('allow')).toBe('GET, HEAD')
  expect((await request('/eleckoi/assets/missing.js')).status).toBe(404)
  expect((await request('/eleckoi/assets')).status).toBe(404)
  expect((await request('/eleckoi/assets/%2e%2e%2fsecret.txt')).status).toBe(403)
  expect((await request('/eleckoi/assets/%2e%2e%5csecret.txt')).status).not.toBe(200)
  expect((await request('/eleckoi/assets/%E0%A4%A')).status).toBe(400)
}, 15_000)

it('rejects an incomplete build before publishing boot inputs or asset routes', async () => {
  const { ctx, directory, origin } = await fixture()
  await rm(join(directory, 'assets/product.js'))
  await expect(installWebClientAssets(ctx, directory)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(ctx.webServer.renderIndex('<head></head>', ownerPeer(ctx))).not.toContain('__ELECKOI_CLIENT_ASSETS__')
  expect((await fetch(origin + '/eleckoi/assets/product.css')).status).toBe(404)
}, 15_000)
