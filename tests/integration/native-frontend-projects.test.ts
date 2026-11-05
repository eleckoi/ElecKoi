import { clientBundlePath } from '../support/client-bundle.js'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import { ownerPeer } from '../support/owner-peer.js'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import * as Cordis from '@deepseek-ai/cordis'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { TYPERT_REMOTE } from '@eleckoi/dsh-product-api/remote'
import { NativeFrontendClient } from '@eleckoi/dsh-client-author/frontends'
// @ts-expect-error UI command mapper is a JavaScript module.
import { requestNativeFrontend } from '../../apps/web/src/modules/authorFrontend/model/nativeFrontendRequest.js'
import { ElecKoiAuthorFrontendsApi, eleckoiFrontendAssetsPlugin } from '@eleckoi/dsh-product-api'
import { FrontendIndex, FrontendProjectRepository, FRONTEND_MANIFEST_FILE,
  type FrontendOwner } from '@eleckoi/dsh-product-data/frontends'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { afterEach, describe, expect, it, vi } from 'vitest'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanups.splice(0).reverse()) await close() })
const app: FrontendOwner = { scope: 'application' }
const character = { scope: 'character', characterId: 'synthetic-character' } satisfies FrontendOwner
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'eleckoi-native-frontends-'))
  cleanups.push(() => {
    const child = relative(tmpdir(), directory)
    if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected fixture cleanup path')
    rmSync(directory, { recursive: true, force: true })
  })
  const index = new FrontendIndex(join(directory, 'author-frontends'))
  const repository = new FrontendProjectRepository(index, id => ['synthetic-character', 'synthetic-other'].includes(id))
  return { directory, index, repository }
}
function project(f: ReturnType<typeof fixture>, owner: FrontendOwner = character) {
  const workspace = f.repository.importProject(owner, {
    name: 'Synthetic page', files: [
      { path: 'index.html', content: '<!doctype html><head><meta name="eleckoi-author-api" content="0.1.0"></head><body>Synthetic page</body>' },
      { path: 'assets/value.bin', content: Buffer.from([0, 128, 255, 13]).toString('base64'), encoding: 'base64' },
      { path: '__proto__', content: 'Literal filename' }
    ], project: { authorSetting: { count: 4 } }, manifest: { config: { colors: ['red', 'green'] } }
  })
  return workspace.selectedProjectId!
}
describe('native frontend file projects', () => {
  it('persists resources, selection, metadata and literal filenames without any compatibility owner', () => {
    const f = fixture(), id = project(f)
    expect(f.repository.readFile(character, id, '__proto__').content).toBe('Literal filename')
    expect(f.repository.readAsset(id, 'assets/value.bin').body).toEqual(Buffer.from([0, 128, 255, 13]))
    const reopened = new FrontendProjectRepository(new FrontendIndex(f.index.root), () => true)
    expect(reopened.workspace(character)).toMatchObject({ selectedProjectId: id, revision: 1, projects: [{ id, authorSetting: { count: 4 } }] })
    expect(existsSync(join(f.directory, 'author-plugins'))).toBe(false)
    expect(JSON.parse(readFileSync(f.index.path, 'utf8')).projects[id].files).toContain(FRONTEND_MANIFEST_FILE)
    const archive = reopened.exportProject(character, id)
    const imported = reopened.importProject(app, { filename: archive.filename, data: archive.data, manifest: { scope: 'application' } })
    expect(imported.selectedProjectId).not.toBe(id)
    expect(imported.projects).toMatchObject([{ scope: 'application', authorSetting: { count: 4 } }])
    expect(reopened.readAsset(imported.selectedProjectId!, 'assets/value.bin').body).toEqual(Buffer.from([0, 128, 255, 13]))
    expect(reopened.readFile(app, imported.selectedProjectId!, '__proto__').content).toBe('Literal filename')
  })

  it('uses explicit owner and entry instead of current character or a nested index candidate', () => {
    const f = fixture(), before = f.repository.workspace(app)
    expect(() => f.repository.importProject(app, {})).toThrow('requires files, HTML or encoded data')
    expect(() => f.repository.workspace({ scope: 'character' } as any)).toThrow('explicit character id')
    expect(() => f.repository.workspace({} as any)).toThrow('Unknown frontend scope')
    expect(() => f.repository.importProject(app, { files: [{ path: 'a/index.html', content: 'A' }, { path: 'b/index.html', content: 'B' }] })).toThrow('explicit entryFile')
    expect(f.repository.workspace(app)).toEqual(before)
    const workspace = f.repository.importProject(app, { entryFile: 'b/index.html', files: [{ path: 'a/index.html', content: 'A' }, { path: 'b/index.html', content: 'B' }] })
    expect(f.repository.readFile(app, workspace.selectedProjectId!).content).toBe('B')
    expect(() => f.repository.select(character, workspace.selectedProjectId)).toThrow('another character or scope')
    expect(() => f.repository.readFile(character, workspace.selectedProjectId!)).toThrow('another character or scope')
  })

  it('updates bindings and files together and preserves the old project on an invalid reference', () => {
    const f = fixture(), id = project(f)
    f.repository.replaceFiles(character, id, { files: [{ path: 'page.html', content: 'New synthetic page' }],
      manifest: { bindings: [{ target: 'page', entryFile: 'page.html', pageId: 'synthetic-page' }] } })
    const before = f.repository.workspace(character)
    expect(before.activeBindings).toEqual([{ target: 'page', entryFile: 'page.html', pageId: 'synthetic-page' }])
    expect(() => f.repository.replaceFiles(character, id, { files: [], deletePaths: ['page.html'] })).toThrow('binding entry')
    expect(f.repository.workspace(character)).toEqual(before)
    expect(f.repository.readAsset(id, 'page.html').body.toString()).toBe('New synthetic page')
    expect(() => f.repository.writeFile(character, id, { path: '../outside.html', content: 'Invalid' })).toThrow('Invalid frontend file path')
    expect(() => f.repository.importProject(app, { files: [{ path: 'index.html', content: 'A' }, { path: 'index.html', content: 'B' }] })).toThrow('Duplicate frontend file')
  })

  it('restores original assets and manifest if index persistence fails during a write', () => {
    const f = fixture(), id = project(f), before = f.repository.workspace(character)
    const html = f.repository.readAsset(id, 'index.html').body, manifest = f.repository.readAsset(id, FRONTEND_MANIFEST_FILE).body
    vi.spyOn(f.index, 'atomic').mockImplementationOnce(() => { throw new Error('Synthetic index failure') })
    expect(() => f.repository.writeFile(character, id, { path: 'index.html', content: 'Changed' })).toThrow('Synthetic index failure')
    expect(f.repository.readAsset(id, 'index.html').body).toEqual(html)
    expect(f.repository.readAsset(id, FRONTEND_MANIFEST_FILE).body).toEqual(manifest)
    expect(f.repository.workspace(character)).toEqual(before)
    expect(readdirSync(f.repository.root)).toEqual([id])
  })

  it('restores the directory on failed deletion; deselecting does not delete the project', () => {
    const f = fixture(), id = project(f), before = f.repository.workspace(character)
    vi.spyOn(f.index, 'atomic').mockImplementationOnce(() => { throw new Error('Synthetic delete failure') })
    expect(() => f.repository.delete(character, id)).toThrow('Synthetic delete failure')
    expect(f.repository.workspace(character)).toEqual(before)
    expect(f.repository.hasAsset(id, 'index.html')).toBe(true)
    expect(f.repository.restoreDefault(character).selectedProjectId).toBeNull()
    expect(f.repository.hasAsset(id, 'index.html')).toBe(true)
    expect(f.repository.setMessageRenderer(character, false).messageRendererEnabled).toBe(false)
    f.repository.select(character, id)
    expect(f.repository.delete(character, id)).toMatchObject({ selectedProjectId: null, projects: [] })
    expect(existsSync(join(f.repository.root, id))).toBe(false)
  })

  it('keeps a malformed index intact rather than treating it as an empty successful workspace', () => {
    const f = fixture(); mkdirSync(f.index.root, { recursive: true })
    const bytes = '{"version":9,"projects":{}}'; writeFileSync(f.index.path, bytes)
    expect(() => f.repository.workspace(app)).toThrow('Unsupported or invalid frontend project index')
    expect(readFileSync(f.index.path, 'utf8')).toBe(bytes)
  })

  it('preserves literal metadata keys on update and index rollback without modifying object prototypes', () => {
    const f = fixture(), id = project(f)
    f.repository.updateProject(character, id, JSON.parse('{"__proto__":{"synthetic":true}}'))
    const value = f.index.get('projects', id) as Record<string, any>
    expect(Object.hasOwn(value, '__proto__')).toBe(true)
    expect(value.__proto__).toEqual({ synthetic: true })
    expect(({} as Record<string, any>).synthetic).toBeUndefined()
    expect(() => f.index.atomic(() => {
      f.index.put('projects', id, { changed: true }); throw new Error('Synthetic rollback')
    })).toThrow('Synthetic rollback')
    expect(f.index.get('projects', id)).toEqual(value)
  })
})

async function nativeHost() {
  const f = fixture(), ctx = new Cordis.Context()
  await ctx.plugin(TypertRegistry)
  const unregister = ctx.typert.register(TYPERT as TypertContribution)
  const data = { frontendProjects: () => f.repository }
  ctx.provide('eleckoiProductData', data as any)
  await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService); await ctx.plugin(ElecKoiAuthorFrontendsApi)
  cleanups.push(async () => { unregister(); await ctx.fiber.dispose() })
  const call = async (method: string, args: Record<string, unknown>) => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAuthorFrontends', method, args })
  return { ...f, ctx, data, call }
}

describe('native frontend Remote and resources', () => {
  it('connects the production Client project service through generated Remote and Gateway with no compatibility owner', async () => {
    const f = await nativeHost(), client = new Cordis.Context(), require = createRequire(import.meta.url)
    await client.plugin(TypertRegistry)
    const call = vi.fn(async (_base: string, endpoint: string, payload: any, signal: AbortSignal) => {
      const [namespace, method] = endpoint.split('/')
      try { return { ok: true, value: await f.ctx.typertGateway.invoke({ peer: ownerPeer(f.ctx), namespace: namespace!, method: method!, args: payload.args, signal }) } }
      catch (error) { return { ok: false, error: { code: 'gateway/internal', message: error instanceof Error ? error.message : String(error), details: {} } } }
    })
    const open = vi.fn(async function* (_base: string, endpoint: string, payload: any, signal: AbortSignal) {
      const [namespace, method] = endpoint.split('/')
      yield* await f.ctx.typertGateway.stream({ peer: ownerPeer(f.ctx), namespace: namespace!, method: method!, args: payload.args, signal })
    })
    client.provide('connection', { rpc: { call, open }, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }) } as any)
    let registration: any
    runInNewContext(readFileSync(clientBundlePath(require, '@deepseek-ai/dsh-api-gateway/client'), 'utf8'), {
      window: { __ModuleLoader__: { load(value: any) { registration = value } } }, crypto: globalThis.crypto,
      AbortController, AbortSignal, Error, Object, setTimeout, clearTimeout,
    })
    await client.plugin(registration.factory((name: string) => {
      if (name === '@deepseek-ai/cordis') return Cordis
      throw new Error(`Unexpected native Client dependency: ${name}`)
    }))
    await client.remote.$mount(TYPERT_REMOTE)
    const frontend = new NativeFrontendClient(client.remote.eleckoiAuthorFrontends)
    cleanups.push(async () => { frontend.dispose(); await client.fiber.dispose() })
    const received = vi.fn(), errors = vi.fn(), stop = frontend.watch(app, received, errors)
    await vi.waitFor(() => expect(received).toHaveBeenCalledWith(expect.objectContaining({ revision: 0, projects: [] })))
    const request = (method: string, input = {}) => requestNativeFrontend(frontend, app, `frontends.${method}`, input)
    const created = await request('import', { html: '<head><meta name="eleckoi-author-api" content="0.1.0"></head><body>Synthetic page</body>' }), id = created.selectedProjectId
    expect(await request('readFile', { projectId: id })).toMatchObject({ content: expect.stringContaining('Synthetic page') })
    await request('writeFile', { projectId: id, path: 'synthetic.txt', content: 'Synthetic resource' })
    await request('replaceFiles', { projectId: id, files: [], deletePaths: ['synthetic.txt'] })
    await request('updateProject', { projectId: id, patch: { name: 'Synthetic renamed page' } })
    const archive = await request('export', { projectId: id })
    expect(archive.filename).toMatch(/\.zip$/); expect(archive.project.name).toBe('Synthetic renamed page')
    await request('select', { projectId: null })
    await request('select', { projectId: id })
    await request('setMessageRenderer', { enabled: false })
    await request('restoreDefault')
    await request('delete', { projectId: id })
    await vi.waitFor(() => expect(received).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 9, projects: [], selectedProjectId: null, messageRendererEnabled: false })))
    expect(await request('workspace')).toMatchObject({ projects: [] })
    await expect(request('readFile', { projectId: id })).rejects.toMatchObject({ code: 'gateway/internal' })
    expect(new Set(call.mock.calls.map(([, endpoint]) => endpoint))).toEqual(new Set(['workspace', 'importProject', 'readFile', 'writeFile', 'replaceFiles', 'updateProject', 'exportProject', 'select', 'setMessageRenderer', 'restoreDefault', 'delete'].map(method => `eleckoiAuthorFrontends/${method}`)))
    stop(); frontend.reset()
    expect(open).toHaveBeenCalledOnce(); expect(errors).not.toHaveBeenCalled()
    expect(f.ctx.get('eleckoiCompatibilityApi', false)).toBeUndefined()
    expect(client.get('eleckoiCompatibility', false)).toBeUndefined()
    expect(existsSync(join(f.directory, 'author-plugins'))).toBe(false)
  }, 30_000)
  it('uses the production product-data service for an application project without creating a companion database', async () => {
    const f = fixture(), ctx = new Cordis.Context()
    const previous = Object.fromEntries(['ELECKOI_DATABASE_PATH', 'ELECKOI_MEDIA_ROOT', 'ELECKOI_WORKSPACE_ROOT'].map(key => [key, process.env[key]]))
    process.env.ELECKOI_DATABASE_PATH = join(f.directory, 'product.sqlite3')
    process.env.ELECKOI_MEDIA_ROOT = join(f.directory, 'media')
    process.env.ELECKOI_WORKSPACE_ROOT = f.directory
    cleanups.push(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value
      }
    })
    await ctx.plugin(TypertRegistry)
    const unregister = ctx.typert.register(TYPERT as TypertContribution)
    cleanups.push(async () => { unregister(); await ctx.fiber.dispose() })
    await ctx.plugin(productDataPlugin)
    await ctx.plugin(RemoteAccessService)
  await ctx.plugin(TypertGatewayService)
    await ctx.plugin(ElecKoiAuthorFrontendsApi)
    const created = await ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiAuthorFrontends', method: 'importProject',
      args: { owner: app, input: { html: 'Synthetic production-owned frontend' } } }) as any
    expect(ctx.eleckoiProductData.frontendProjects().readFile(app, created.selectedProjectId).content).toBe('Synthetic production-owned frontend')
    expect(existsSync(join(f.directory, 'author-plugins', 'registry.sqlite'))).toBe(false)
    expect(existsSync(join(f.directory, 'product.sqlite3'))).toBe(false)
    expect(existsSync(join(f.directory, 'author-frontends', 'projects.json'))).toBe(true)
    expect(ctx.get('eleckoiCompatibilityFrontends', false)).toBeUndefined()
  }, 30_000)

  it('uses the actual generated Gateway codec without a compatibility service and emits compact scoped notifications', async () => {
    const f = await nativeHost(), abort = new AbortController()
    const stream = await f.ctx.typertGateway.stream({ peer: ownerPeer(f.ctx), namespace: 'eleckoiAuthorFrontends', method: 'changes', args: { owner: app }, signal: abort.signal })
    const iterator = stream[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toEqual({ kind: 'snapshot', revision: 0 })
    const created = await f.call('importProject', { owner: app, input: { html: 'Synthetic native page', project: { extra: { nested: [1, true, null] } }, manifest: { config: { count: 2 } } } }) as any
    const id = created.selectedProjectId
    expect(await f.call('readFile', { owner: app, projectId: id, input: {} })).toMatchObject({ content: 'Synthetic native page' })
    expect((await iterator.next()).value).toEqual({ kind: 'changed', revision: 1 })
    await f.call('setMessageRenderer', { owner: app, enabled: false })
    await f.call('restoreDefault', { owner: app })
    expect((await iterator.next()).value).toEqual({ kind: 'changed', revision: 3 })
    expect(f.ctx.get('eleckoiCompatibilityFrontends', false)).toBeUndefined()
    expect(existsSync(join(f.directory, 'author-plugins'))).toBe(false)
    await expect(f.call('workspace', { owner: { scope: 'character' } })).rejects.toThrow()
    abort.abort(); await expect(iterator.next()).rejects.toThrow('was aborted')
    const archive = await f.call('exportProject', { owner: app, projectId: id }) as any
    const second = await f.call('importProject', { owner: app, input: { filename: archive.filename, data: archive.data } }) as any
    expect(f.index.get('projects', second.selectedProjectId)).toMatchObject({ extra: { nested: [1, true, null] } })
  })



  it('serves actual bytes through the official WebServer without compatibility and removes the route on plugin disposal', async () => {
    const f = await nativeHost(), id = project(f, app)
    f.repository.writeFile(app, id, { path: 'Build/player.wasm', encoding: 'base64', content: Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]).toString('base64') })
    await f.ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
    const plugin = f.ctx.plugin(eleckoiFrontendAssetsPlugin); await plugin
    const base = `http://127.0.0.1:${f.ctx.webServer.port}/eleckoi/frontends/${id}`
    const wasm = await fetch(`${base}/Build/player.wasm`)
    expect(wasm.headers.get('content-type')).toBe('application/wasm')
    expect(await WebAssembly.compileStreaming(wasm)).toBeInstanceOf(WebAssembly.Module)
    const bytes = await fetch(`${base}/assets/value.bin`)
    expect(bytes.status).toBe(200)
    expect(Buffer.from(await bytes.arrayBuffer())).toEqual(Buffer.from([0, 128, 255, 13]))
    expect(bytes.headers.get('cache-control')).toBe('no-store')
    expect(bytes.headers.get('content-length')).toBe('4')
    expect(bytes.headers.get('accept-ranges')).toBe('bytes')
    for (const [range, expected, contentRange] of [
      ['bytes=1-2', [128, 255], 'bytes 1-2/4'], ['bytes=2-', [255, 13], 'bytes 2-3/4'],
      ['bytes=-2', [255, 13], 'bytes 2-3/4'], ['bytes=-99', [0, 128, 255, 13], 'bytes 0-3/4'],
      ['bytes=0-999999999999999999999999', [0, 128, 255, 13], 'bytes 0-3/4'],
    ] as const) {
      const partial = await fetch(`${base}/assets/value.bin`, { headers: { Range: range } })
      expect(partial.status).toBe(206); expect(partial.headers.get('content-range')).toBe(contentRange)
      expect(partial.headers.get('content-length')).toBe(String(expected.length))
      expect(Buffer.from(await partial.arrayBuffer())).toEqual(Buffer.from(expected))
    }
    for (const range of ['bytes=4-', 'bytes=-0', 'bytes=999999999999999999999999-']) {
      const outside = await fetch(`${base}/assets/value.bin`, { headers: { Range: range } })
      expect(outside.status).toBe(416); expect(outside.headers.get('content-range')).toBe('bytes */4')
      expect(await outside.text()).toBe('')
    }
    for (const range of ['unknown=1-2', 'bytes=invalid', 'bytes=2-1', 'bytes=0-0,2-3']) {
      const entire = await fetch(`${base}/assets/value.bin`, { headers: { Range: range } })
      expect(entire.status).toBe(200); expect(entire.headers.get('content-range')).toBeNull()
      expect(Buffer.from(await entire.arrayBuffer())).toEqual(Buffer.from([0, 128, 255, 13]))
    }
    const conditional = await fetch(`${base}/assets/value.bin`, { headers: { Range: 'bytes=1-2', 'If-Range': '"synthetic-unconfirmed-version"' } })
    expect(conditional.status).toBe(200); expect(Buffer.from(await conditional.arrayBuffer())).toEqual(Buffer.from([0, 128, 255, 13]))
    const head = await fetch(`${base}/index.html`, { method: 'HEAD' })
    expect(head.status).toBe(200); expect(head.headers.get('content-type')).toContain('text/html'); expect(await head.text()).toBe('')
    const headRange = await fetch(`${base}/assets/value.bin`, { method: 'HEAD', headers: { Range: 'bytes=1-2' } })
    expect(headRange.status).toBe(200); expect(headRange.headers.get('content-length')).toBe('4'); expect(await headRange.text()).toBe('')
    expect((await fetch(`${base}/missing.html`)).status).toBe(404)
    expect((await fetch(`${base}/index.html`, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${base}/%ZZ`)).status).toBe(400)
    await plugin.dispose()
    expect((await fetch(`${base}/index.html`)).status).toBe(404)
  }, 30_000)
})
