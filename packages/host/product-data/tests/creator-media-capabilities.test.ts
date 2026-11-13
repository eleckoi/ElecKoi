import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { creatorCapabilities } from '../src/domain/creatorStudio/capabilities'
import { readZipEntries } from '../src/storage/archive/readZipEntries'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs() })
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-creator-media-'))
  cleanups.push(() => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path'); rmSync(root, { recursive: true, force: true }) })
  vi.stubEnv('ELECKOI_DATABASE_PATH', join(root, 'product.sqlite')); vi.stubEnv('ELECKOI_MEDIA_ROOT', join(root, 'media'))
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose()); await ctx.plugin(productDataPlugin)
  const data = ctx.eleckoiProductData, characterId = 'synthetic-media-owner'
  for (const id of [characterId, 'synthetic-other-owner']) data.createCharacter({ id, name: `Synthetic ${id}` })
  const capabilities = creatorCapabilities(data)
  const call = (id: string, input: unknown = {}, selected = characterId) => capabilities.find(item => item.id === id)!.execute(selected, input) as any
  const asset = (operation: string, input: object) => call(`assets.${operation}`, { expectedRevision: call('assets.list').revision, ...input })
  const frontend = (operation: string, input: object) => call(`frontends.${operation}`, { expectedRevision: call('frontends.list').revision, ...input })
  return { ctx, data, characterId, call, asset, frontend }
}
const html = '<!doctype html><html><head><meta name="eleckoi-author-api" content="0.1.0"></head><body>Synthetic UI<script type="module">const api = await window.ElecKoiReady;</script></body></html>'

describe('Character media authoring uses the existing repositories', { timeout: 30_000 }, () => {
  it('imports content, organizes mixed folders and preserves references through moves, copies and reopen', async () => {
    const f = await fixture(), other = f.data.characterAssets().list('synthetic-other-owner')
    const folder = f.asset('create_folder', { name: 'Synthetic mixed folder', parentId: null }).createdFolderIds[0]
    const nested = f.asset('create_folder', { name: 'Synthetic nested folder', parentId: folder }).createdFolderIds[0]
    const source = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    const imported = f.asset('import', { name: 'Synthetic image.svg', encoding: 'utf8', content: source, folderId: nested })
    const id = imported.importedIds[0], reference = imported.items[0].reference
    expect(reference).toBe(`asset://${id}`)
    expect(f.call('assets.read', { id }).item).toMatchObject({ reference, folderId: nested, type: 'image' })
    f.asset('rename', { id, name: 'Synthetic renamed.svg' }); f.asset('rename_folder', { folderId: folder, name: 'Synthetic renamed folder' })
    f.asset('move', { assetIds: [id], folderIds: [], destination: folder })
    f.asset('move', { assetIds: [], folderIds: [nested], destination: null })
    expect(f.call('assets.read', { id }).item.reference).toBe(reference)
    const duplicate = f.asset('duplicate', { assetIds: [id] }).copiedIds[0]
    expect(duplicate).not.toBe(id)
    const content = f.call('assets.read_content', { id, offset: 0, length: 9 })
    expect(Buffer.from(content.content, 'base64').toString()).toBe(source.slice(0, 9))
    expect(content.next_offset).toBe(9)
    const before = f.call('assets.list')
    expect(() => f.call('assets.rename', { id, name: 'Unexpected', expectedRevision: 0 })).toThrow('重新读取')
    expect(() => f.asset('move', { assetIds: [], folderIds: [folder], destination: folder })).toThrow()
    expect(() => f.asset('import', { name: 'Synthetic.png', content: 'not base64', encoding: 'base64', folderId: null })).toThrow()
    expect(() => f.call('assets.read', { id }, 'synthetic-other-owner')).toThrow()
    expect(() => f.call('assets.list', { target: { scope: 'global' } })).toThrow()
    expect(f.call('assets.list')).toEqual(before)
    f.asset('delete', { assetIds: [], folderIds: [folder] })
    expect(f.call('assets.list').items).toEqual([])
    expect(f.call('assets.list').folders.map((item: any) => item.id)).toEqual([nested])
    expect(f.data.characterAssets().list('synthetic-other-owner')).toEqual(other)
    const saved = f.call('assets.list')
    await f.ctx.fiber.dispose()
    const reopened = new Context(); cleanups.push(() => reopened.fiber.dispose()); await reopened.plugin(productDataPlugin)
    expect(reopened.eleckoiProductData.characterAssets().list(f.characterId)).toEqual({ ...saved, items: [] })
  })

  it('recovers all binary windows without changing source bytes and rejects nonexistent folders atomically', async () => {
    const f = await fixture(), bytes = Buffer.alloc(2 * 1024 * 1024 + 53)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
    const id = f.asset('import', { name: 'Synthetic media.mp4', content: bytes.toString('base64'), encoding: 'base64' }).importedIds[0]
    const parts: Buffer[] = []; let offset: number | null = 0
    do { const page = f.call('assets.read_content', { id, offset }); parts.push(Buffer.from(page.content, 'base64')); offset = page.next_offset } while (offset !== null)
    expect(Buffer.concat(parts).equals(bytes)).toBe(true)
    const before = f.call('assets.list')
    expect(() => f.asset('move', { assetIds: [id], folderIds: [], destination: '11111111-1111-4111-8111-111111111111' })).toThrow()
    expect(f.call('assets.list')).toEqual(before)
  })

  it('creates and updates independent project files, enables explicitly and exports assets with folders', async () => {
    const f = await fixture()
    const folder = f.asset('create_folder', { name: 'Synthetic assets', parentId: null }).createdFolderIds[0]
    const media = f.asset('import', { name: 'Synthetic.svg', content: '<svg/>', encoding: 'utf8', folderId: folder }).items[0]
    const imported = f.frontend('import', { format: 'files', name: 'Synthetic page', entryFile: 'pages/main.html', files: [
      { path: 'pages/main.html', content: html.replace('Synthetic UI', `<img src="${media.reference}">Synthetic UI`) },
      { path: 'styles.css', content: 'body { color: #123; }' }, { path: 'retained.js', content: 'export const retained = true;' },
    ] })
    const projectId = imported.importedProjectIds[0]
    expect(imported.selectedProjectId).toBe(null)
    f.frontend('write_files', { projectId, files: [{ path: 'styles.css', content: 'body { color: #456; }' }, { path: 'new.js', content: 'export const value = 2;' }], deletePaths: ['retained.js'] })
    expect(f.call('frontends.read_file', { projectId, path: 'styles.css' }).content).toContain('#456')
    expect(f.call('frontends.read_file', { projectId }).content).toContain(media.reference)
    expect(() => f.call('frontends.read_file', { projectId }, 'synthetic-other-owner')).toThrow()
    f.frontend('update', { projectId, changes: { name: 'Synthetic renamed page', manifest: { bindings: [{ target: 'root', view: 'chat', entryFile: 'pages/main.html' }] } } })
    expect(f.frontend('select', { projectId }).selectedProjectId).toBe(projectId)
    expect(f.frontend('configure', { messageRendererEnabled: false }).messageRendererEnabled).toBe(false)
    const before = f.call('frontends.list')
    expect(() => f.call('frontends.select', { expectedRevision: 0, projectId: null })).toThrow('重新读取')
    expect(() => f.frontend('write_files', { projectId, files: [{ path: '../outside.js', content: 'Unexpected' }] })).toThrow()
    expect(() => f.frontend('update', { projectId, changes: { manifest: { scope: 'application' } } })).toThrow()
    expect(() => f.frontend('write_files', { projectId, files: [], deletePaths: ['pages/main.html'] })).toThrow()
    expect(f.call('frontends.list')).toEqual(before)
    const exported = f.call('frontends.export', { projectId }), zip = readZipEntries(Buffer.from(exported.data, 'base64'))
    expect([...zip.keys()]).toContain(`.eleckoi-assets/${media.id}`)
    expect(JSON.parse(Buffer.from(zip.get('.eleckoi-assets.json')!).toString()).folders[0].id).toBe(folder)
    expect(f.frontend('select', { projectId: null }).selectedProjectId).toBe(null)
    const assets = f.call('assets.list'); f.frontend('delete', { projectId })
    expect(f.call('frontends.list').projects).toEqual([])
    expect(f.call('assets.list')).toEqual(assets)
  })
})
