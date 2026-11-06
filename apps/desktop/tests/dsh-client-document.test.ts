import { createServer, type RequestListener } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  authenticateDshClientHost,
  forwardDshClientRequest,
  serveDshClientAsset
} from '../src/main/platform/electron/dshClientDocument'

const require = createRequire(import.meta.url)
const frontendDirectory = join(dirname(require.resolve('@deepseek-ai/dsh-web-frontend/package.json')), 'dist')
const servers: Array<ReturnType<typeof createServer>> = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error === undefined ? resolve() : reject(error))
    server.closeAllConnections()
  })))
})

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('HTTP test listener has no port')
  return `http://127.0.0.1:${address.port}/`
}

describe('DSH client document transport', () => {
  it('serves the pinned frontend with a boot gate and rejects traversal', async () => {
    const page = await serveDshClientAsset(new Request('dsh-app://app/'), frontendDirectory)
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('__DSH_BOOT_READY__ = Promise.withResolvers()')
    const escaped = await serveDshClientAsset(new Request('dsh-app://app/assets/%2e%2e/%2e%2e/package.json'), frontendDirectory)
    expect(escaped.status).not.toBe(200)
  })

  it('uses the Host cookie without exposing it to the document', async () => {
    const host = await listen((request, response) => {
      if (request.url === '/login') {
        response.writeHead(303, { 'set-cookie': 'dsh-session=test-token; HttpOnly; SameSite=Strict', location: '/' })
        response.end()
        return
      }
      response.setHeader('set-cookie', 'must-not-reach-client=1')
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ url: request.url, cookie: request.headers.cookie, origin: request.headers.origin }))
    })
    const cookie = await authenticateDshClientHost(new URL('login', host).href)
    const reply = await forwardDshClientRequest(new Request('dsh-app://app/api/check?cursor=1', {
      headers: { origin: 'dsh-app://app' }
    }), host, cookie)
    expect(await reply.json()).toEqual({ url: '/api/check?cursor=1', cookie: 'dsh-session=test-token' })
    expect(reply.headers.has('set-cookie')).toBe(false)
    const rejected = await forwardDshClientRequest(new Request('dsh-app://app/api/check', {
      headers: { origin: 'https://example.invalid' }
    }), host, cookie)
    expect(rejected.status).toBe(403)
  })

  it('cancels the Host stream when the browser request is aborted', async () => {
    let responseClosed: () => void = () => {}
    const closed = new Promise<void>(resolve => { responseClosed = resolve })
    const host = await listen((_request, response) => {
      response.on('close', responseClosed)
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.write('first chunk')
    })
    const controller = new AbortController()
    const reply = await forwardDshClientRequest(new Request('dsh-app://app/api/stream', {
      signal: controller.signal
    }), host, 'dsh-session=test-token')
    const reader = reply.body?.getReader()
    expect(reader).toBeDefined()
    expect(new TextDecoder().decode((await reader!.read()).value)).toBe('first chunk')
    controller.abort()
    await expect(reader!.read()).rejects.toThrow()
    await expect(Promise.race([
      closed.then(() => true),
      new Promise(resolve => setTimeout(() => resolve(false), 2_000))
    ])).resolves.toBe(true)
  })
})
