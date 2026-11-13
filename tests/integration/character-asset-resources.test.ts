import * as Cordis from '@deepseek-ai/cordis'
import RemoteAccessService from '@deepseek-ai/dsh-api-remote-access'
import TypertRegistry, { type TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import TypertGateway from '@deepseek-ai/dsh-api-gateway'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import { ElecKoiCharacterAssetsApi, ElecKoiAuthorFrontendsApi, eleckoiCharacterAssetFilesPlugin, eleckoiFrontendAssetsPlugin } from '@eleckoi/dsh-product-api'
import { TYPERT } from '@eleckoi/dsh-product-api/typert'
import { CharacterAssetRepository } from '@eleckoi/dsh-product-data/character-assets'
import { FrontendIndex, FrontendProjectRepository } from '@eleckoi/dsh-product-data/frontends'
import { ownerPeer } from '../support/owner-peer.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })

it('uploads through generated Remote, scopes notifications, streams ranged bytes and resolves project resources after import', async () => {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-asset-resources-'))
  cleanups.push(() => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw Error('Invalid fixture directory'); rmSync(root, { recursive: true, force: true }) })
  const characterId = 'synthetic # 角色', other = 'synthetic-other', owner = { scope: 'character' as const, characterId }
  const exists = (id: string) => [characterId, other].includes(id)
  const assets = new CharacterAssetRepository(join(root, 'assets'), exists)
  const projects = new FrontendProjectRepository(new FrontendIndex(join(root, 'frontends')), exists, () => assets)
  const ctx = new Cordis.Context()
  cleanups.push(async () => { assets.close(); await ctx.fiber.dispose() })
  await ctx.plugin(TypertRegistry)
  const unregister = ctx.typert.register(TYPERT as TypertContribution); cleanups.push(unregister)
  ctx.provide('eleckoiProductData', { characterAssets: () => assets, frontendProjects: () => projects } as any)
  const reveal = vi.fn(async () => ({ opened: true as const }))
  const canReveal = vi.fn(() => true)
  ctx.provide('sessionController', { canOpenWorkspacePath: canReveal, openWorkspacePath: reveal } as any)
  await ctx.plugin(RemoteAccessService); await ctx.plugin(TypertGateway)
  await ctx.plugin(ElecKoiCharacterAssetsApi); await ctx.plugin(ElecKoiAuthorFrontendsApi)
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 })
  const files = ctx.plugin(eleckoiCharacterAssetFilesPlugin); await files
  await ctx.plugin(eleckoiFrontendAssetsPlugin)
  const call = (method: string, args = {}) => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterAssets', method, args: { characterId, ...args } }) as Promise<any>
  const capability = () => ctx.typertGateway.invoke({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterAssets', method: 'canReveal', args: {} })
  const abort = new AbortController()
  const stream = await ctx.typertGateway.stream({ peer: ownerPeer(ctx), namespace: 'eleckoiCharacterAssets', method: 'changes', args: { characterId }, signal: abort.signal })
  const iterator = stream[Symbol.asyncIterator]()
  expect((await iterator.next()).value).toEqual({ revision: 0 })
  const ticket = await call('beginUpload', { input: { name: '媒体 #.mp4', size: 6 } })
  await expect(call('appendUpload', { characterId: other, uploadId: ticket.id, offset: 0, data: 'AAEC' })).rejects.toThrow()
  expect(await call('appendUpload', { uploadId: ticket.id, offset: 0, data: 'AAEC' })).toMatchObject({ offset: 3 })
  await expect(call('finishUpload', { uploadId: ticket.id })).rejects.toThrow()
  await call('appendUpload', { uploadId: ticket.id, offset: 3, data: 'A/7/' })
  const catalog = await call('finishUpload', { uploadId: ticket.id }), asset = catalog.items[0]
  expect(await capability()).toBe(true)
  await call('reveal', { assetId: asset.id })
  expect(reveal).toHaveBeenCalledWith({ path: assets.readAsset(characterId, asset.id).path, action: 'reveal' }, expect.any(AbortSignal))
  await expect(call('reveal', { characterId: other, assetId: asset.id })).rejects.toThrow()
  expect(reveal).toHaveBeenCalledOnce()
  canReveal.mockReturnValue(false)
  expect(await capability()).toBe(false)
  reveal.mockRejectedValueOnce(new Error('Synthetic file manager failure'))
  await expect(call('reveal', { assetId: asset.id })).rejects.toThrow('Synthetic file manager failure')
  expect((await iterator.next()).value).toEqual({ revision: 1 })
  await call('rename', { assetId: asset.id, name: '第一次.mp4' }); await call('rename', { assetId: asset.id, name: '展示名称.mp4' })
  expect((await iterator.next()).value).toEqual({ revision: 3 })
  const grouped = await call('createFolder', { name: '开场', parentId: null }), folder = grouped.folders[0]
  await call('move', { assetIds: [asset.id], folderIds: [], destination: folder.id })
  const renamed = await call('renameFolder', { folderId: folder.id, name: '分支开场' })
  expect(renamed.items[0]).toMatchObject({ id: asset.id, hash: asset.hash, folderId: folder.id })
  expect(renamed.folders[0].name).toBe('分支开场')
  await expect(call('move', { characterId: other, assetIds: [], folderIds: [], destination: folder.id })).rejects.toThrow()
  expect((await iterator.next()).value).toEqual({ revision: 6 })
  await expect(call('list', { characterId: 'missing-owner' })).rejects.toThrow()
  const origin = `http://127.0.0.1:${ctx.webServer.port}`, base = `${origin}/eleckoi/character-assets/${encodeURIComponent(characterId)}/${asset.id}`
  const whole = await fetch(base)
  expect(whole.status).toBe(200); expect(whole.headers.get('content-type')).toBe('video/mp4')
  expect(Buffer.from(await whole.arrayBuffer())).toEqual(Buffer.from([0, 1, 2, 3, 254, 255]))
  const range = await fetch(base, { headers: { Range: 'bytes=2-4' } })
  expect(range.status).toBe(206); expect(range.headers.get('content-range')).toBe('bytes 2-4/6')
  expect(Buffer.from(await range.arrayBuffer())).toEqual(Buffer.from([2, 3, 254]))
  expect((await fetch(base, { headers: { Range: 'bytes=6-' } })).status).toBe(416)
  const head = await fetch(base, { method: 'HEAD' }); expect(head.headers.get('content-length')).toBe('6'); expect(await head.text()).toBe('')
  expect((await fetch(base.replace(encodeURIComponent(characterId), other))).status).toBe(404)
  expect((await fetch(base, { method: 'POST' })).status).toBe(405)
  expect((await fetch(`${origin}/eleckoi/character-assets/%ZZ/${asset.id}`)).status).toBe(400)
  const reference = `asset://${asset.id}`
  const project = projects.importProject(owner, { files: [{ path: 'index.html', content: '<html>Resource fixture</html>' }, { path: 'styles/media.css', content: `body{background:url('${reference}')}` }, { path: 'code/media.js', content: `window.fixture='${reference}'` }] })
  for (const name of ['styles/media.css', 'code/media.js']) {
    const served = await fetch(`${origin}/eleckoi/frontends/${project.selectedProjectId}/${name}`), text = await served.text()
    expect(served.status).toBe(200); expect(text).toContain(`/eleckoi/character-assets/${encodeURIComponent(characterId)}/${asset.id}`); expect(text).not.toContain('asset://')
    expect(projects.readFile(owner, project.selectedProjectId!, name).content).toContain(reference)
  }
  const cancelled = await call('beginUpload', { input: { name: 'cancel.wav', size: 1 } }); await call('cancelUpload', { uploadId: cancelled.id })
  expect((await call('list')).items).toHaveLength(1)
  abort.abort(); await expect(iterator.next()).rejects.toThrow('was aborted')
  await files.dispose(); expect((await fetch(base)).status).toBe(404)
}, 30_000)
