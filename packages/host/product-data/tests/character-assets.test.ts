import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import * as Cordis from '@deepseek-ai/cordis'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { CharacterAssetRepository } from '../src/domain/characterAssets'
import { decodeCharacterCard } from '../src/domain/characterTransfer/characterCardFormats'
import { readPngArchive, removePngArchive } from '../src/storage/media/PngTextChunkCodec'
import { readZipEntries } from '../src/storage/archive/readZipEntries'
import { afterEach, describe, expect, it, vi } from 'vitest'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs() })
function directory() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-character-assets-'))
  cleanups.push(() => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw Error('Invalid fixture path'); rmSync(root, { recursive: true, force: true }) })
  return root
}
function upload(repo: Pick<CharacterAssetRepository, 'begin' | 'append' | 'finish'>, characterId: string, name: string, bytes: Buffer) {
  const ticket = repo.begin(characterId, { name, size: bytes.length })
  for (let offset = 0; offset < bytes.length; offset += 65536) repo.append(characterId, ticket.id, offset, bytes.subarray(offset, offset + 65536).toString('base64'))
  const catalog = repo.finish(characterId, ticket.id); return catalog.items.at(-1)!
}
async function host() {
  const root = directory()
  vi.stubEnv('ELECKOI_DATABASE_PATH', join(root, 'product.sqlite'))
  vi.stubEnv('ELECKOI_MEDIA_ROOT', join(root, 'media'))
  vi.stubEnv('ELECKOI_WORKSPACE_ROOT', join(root, 'workspace'))
  const ctx = new Cordis.Context(); await ctx.plugin(productDataPlugin); cleanups.push(() => ctx.fiber.dispose())
  return { root, ctx, data: ctx.eleckoiProductData }
}

describe('character asset library', () => {
  it('persists chunk uploads, keeps references on rename, copies independently and rejects other owners and paths', () => {
    const root = directory(), owners = new Set(['card-a', 'card-b']), repo = new CharacterAssetRepository(root, id => owners.has(id))
    const bytes = Buffer.from([0, 255, 18, 0, 128]), item = upload(repo, 'card-a', '测试 图片 #.png', bytes)
    expect(readFileSync(repo.readAsset('card-a', item.id).path)).toEqual(bytes)
    expect(repo.rename('card-a', item.id, '展示名称.jpeg').items[0]).toMatchObject({ id: item.id, mimeType: 'image/png', hash: item.hash })
    expect(() => repo.readAsset('card-b', item.id)).toThrow()
    for (const id of ['../outside', '%2e%2e', 'C:\\outside', 'a/b']) expect(() => repo.readAsset('card-a', id)).toThrow()
    expect(() => repo.begin('card-a', { name: '../outside.png', size: 1 })).toThrow()
    const copy = repo.duplicate('card-a', [item.id]).items[1]!
    repo.delete('card-a', [item.id]); expect(readFileSync(repo.readAsset('card-a', copy.id).path)).toEqual(bytes)
    const reopened = new CharacterAssetRepository(root, id => owners.has(id))
    expect(reopened.list('card-a').items).toEqual(repo.list('card-a').items)
    const ticket = reopened.begin('card-a', { name: 'media.mp4', size: 3 })
    expect(() => reopened.append('card-b', ticket.id, 0, 'AAAA')).toThrow()
    expect(() => reopened.append('card-a', ticket.id, 1, 'AAAA')).toThrow()
    expect(() => reopened.finish('card-a', ticket.id)).toThrow('完整')
    reopened.close(); expect(readdirSync(join(root, 'uploads'))).toEqual([])
  })

  it.each(['png', 'zip', 'json'] as const)('round trips assets, regex HTML, many openings and selected nested frontends through %s to another directory', async format => {
    const source = await host(), characterId = 'synthetic-source'
    source.data.createCharacter({ id: characterId, name: '完整素材卡' })
    const bytes = Buffer.alloc(2 * 1024 * 1024 + 31); for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251
    const repo = source.data.characterAssets()
    const folder = repo.createFolder(characterId, '开场 /?'.replace('/', '—'), null).folders[0]!
    repo.createFolder(characterId, '空文件夹', folder.id)
    const uploaded = upload(repo, characterId, '中文 movie #.mp4', bytes)
    const asset = repo.move(characterId, [uploaded.id], [], folder.id).items[0]!
    const reference = `asset://${asset.id}`
    const html = `<!doctype html><head><meta name="eleckoi-author-api" content="0.1.0"><link rel="stylesheet" href="../styles/theme.css"></head><body><video src="${reference}"></video><script src="../code/app.js"></script></body>`
    const workspace = source.data.frontendProjects().importProject({ scope: 'character', characterId }, {
      name: '独立前端', entryFile: 'pages/start.html', files: [{ path: 'pages/start.html', content: html },
        { path: 'styles/theme.css', content: `body{background:url('${reference}')}` },
        { path: 'code/app.js', content: `window.storyAsset='${reference}';` },
        { path: '中文 目录/素材.bin', content: 'AP+A', encoding: 'base64' }],
      manifest: { bindings: [{ target: 'root', view: 'chat', entryFile: 'pages/start.html' }] },
    })
    const openings = source.data.readCharacterOpenings(characterId)
    const long = '完整长正文'.repeat(20000)
    source.data.saveCharacterOpenings(characterId, { ...openings, openingMessages: Array.from({ length: 501 }, (_, index) => ({ id: `opening-${index}`, title: `开场 ${index}`, content: index === 500 ? long + reference : reference, variableVersionId: '' })), defaultOpeningMessageId: 'opening-500' })
    const regex = source.data.readRegexRules(characterId)
    source.data.saveRegexRules(characterId, { ...regex, characterRules: [{ id: 'asset-regex', name: '素材正则', pattern: 'PLACEHOLDER', replacement: `<img src="${reference}">`, targets: ['AiOutput'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0 }] }, regex.revision)
    const exported = source.data.exportCharacter(characterId, format), binary = Buffer.from(exported.base64, 'base64')
    if (format === 'png') {
      expect(readPngArchive(binary)?.length).toBeGreaterThan(bytes.length)
      expect(() => decodeCharacterCard(removePngArchive(binary), 'eleckoi')).toThrow('素材包缺失')
      const corrupted = Buffer.from(binary); corrupted[Math.floor(corrupted.length / 2)]! ^= 1
      expect(() => decodeCharacterCard(corrupted, 'eleckoi')).toThrow()
    }
    if (format !== 'json') {
      const entries = readZipEntries(format === 'png' ? readPngArchive(binary)! : binary)
      expect([...entries.keys()].some(path => path.startsWith('frontends/0/pages/start.html'))).toBe(true)
      expect([...entries.keys()].some(path => /^frontends\/\d+\.zip$/.test(path))).toBe(false)
    }
    const target = await host()
    const preview = target.data.prepareCharacterImports([{ displayName: exported.fileName, mimeType: exported.mimeType, base64: exported.base64 }], 'eleckoi')
    expect(preview.items[0]?.errorMessage).toBe(''); expect(preview.items[0]?.importable).toBe(true)
    const importedId = target.data.commitCharacterImports(preview.token).importedCharacterIds[0]!
    expect(importedId).not.toBe(characterId)
    const imported = target.data.characterAssets().list(importedId).items[0]!
    expect(imported).toEqual(asset)
    expect(target.data.characterAssets().list(importedId).folders).toEqual(repo.list(characterId).folders)
    const loaded = readFileSync(target.data.characterAssets().readAsset(importedId, imported.id).path)
    expect(createHash('sha256').update(loaded).digest('hex')).toBe(asset.hash)
    const frontend = target.data.frontendProjects().workspace({ scope: 'character', characterId: importedId })
    expect(frontend.selectedProjectId).toBeTruthy(); expect(frontend.selectedProjectId).not.toBe(workspace.selectedProjectId)
    expect(target.data.frontendProjects().readFile({ scope: 'character', characterId: importedId }, frontend.selectedProjectId!, 'pages/start.html').content).toBe(html)
    expect(target.data.readCharacterOpenings(importedId).openingMessages[500]?.content).toBe(long + reference)
    expect(target.data.readRegexRules(importedId).characterRules[0]?.replacement).toContain(reference)
    const duplicate = target.data.duplicateCharacter(importedId)
    expect(target.data.characterAssets().list(duplicate.characterId).items[0]).toEqual(asset)
    expect(target.data.characterAssets().list(duplicate.characterId).folders).toEqual(repo.list(characterId).folders)
    target.data.deleteCharacters([importedId])
    expect(readFileSync(target.data.characterAssets().readAsset(duplicate.characterId, asset.id).path)).toEqual(bytes)
    expect(source.data.characterAssets().list(characterId).items).toEqual([asset])
  })

  it('publishes no half card when a resource hash or frontend archive fails validation', async () => {
    const f = await host(); f.data.createCharacter({ id: 'source', name: '失败源卡' })
    upload(f.data.characterAssets(), 'source', 'image.png', Buffer.from('synthetic'))
    const exported = f.data.exportCharacter('source', 'json'), root = JSON.parse(Buffer.from(exported.base64, 'base64').toString())
    root.library_assets[0].hash = '0'.repeat(64)
    const before = f.data.readCharacters()
    const preview = f.data.prepareCharacterImports([{ displayName: 'bad.json', mimeType: 'application/json', base64: Buffer.from(JSON.stringify(root)).toString('base64') }], 'eleckoi')
    expect(() => f.data.commitCharacterImports(preview.token)).toThrow('校验失败')
    expect(f.data.readCharacters()).toEqual(before)
    expect(existsSync(join(f.root, 'outside'))).toBe(false)
  })
})

it('automatically enables a sole frontend without a saved selection and makes standalone ZIP exports self contained', async () => {
  const source = await host(); source.data.createCharacter({ id: 'source', name: '完整前端' });
  const assets = source.data.characterAssets(), folder = assets.createFolder('source', '开场', null).folders[0]!;
  assets.createFolder('source', '空文件夹', folder.id);
  const uploaded = upload(assets, 'source', 'texture.png', Buffer.from('synthetic-image'));
  const asset = assets.move('source', [uploaded.id], [], folder.id).items[0]!;
  const repository = source.data.frontendProjects(), owner = { scope: 'character' as const, characterId: 'source' };
  const created = repository.importProject(owner, { select: false, files: [{ path: 'index.html', content: `<meta name="eleckoi-author-api" content="0.1.0"><img src="asset://${asset.id}">` }] });
  const exported = source.data.exportCharacter('source', 'png'); const target = await host();
  const preview = target.data.prepareCharacterImports([{ displayName: exported.fileName, mimeType: exported.mimeType, base64: exported.base64 }], 'eleckoi');
  const imported = target.data.commitCharacterImports(preview.token).importedCharacterIds[0]!;
  expect(target.data.frontendProjects().workspace({ scope: 'character', characterId: imported }).selectedProjectId).toBeTruthy();
  const zip = repository.exportProject(owner, created.projects[0]!.id);
  target.data.createCharacter({ id: 'standalone', name: '独立导入' });
  const standalone = target.data.frontendProjects().importProject({ scope: 'character', characterId: 'standalone' }, { filename: zip.filename, data: zip.data });
  expect(standalone.selectedProjectId).toBeTruthy();
  expect(target.data.characterAssets().list('standalone').items[0]).toEqual(asset);
  expect(target.data.characterAssets().list('standalone').folders).toEqual(assets.list('source').folders);
  expect(standalone.projects[0]!.files.some(path => path.startsWith('.eleckoi-assets'))).toBe(false);
});

it('rolls back an entire imported card and its first frontend if a later frontend has an invalid path', async () => {
  const source = await host(); source.data.createCharacter({id:'source',name:'合成回滚源'});
  const asset=upload(source.data.characterAssets(),'source','image.png',Buffer.from('synthetic-resource'));
  const repo=source.data.frontendProjects(),owner={scope:'character' as const,characterId:'source'};
  repo.importProject(owner,{html:`<img src="asset://${asset.id}">`});
  repo.importProject(owner,{html:'<html>Second synthetic project</html>'});
  const exported=source.data.exportCharacter('source','json'),root=JSON.parse(Buffer.from(exported.base64,'base64').toString());
  root.frontends.projects[1].files.push({path:'../escape.bin',content:'AA==',encoding:'base64'});
  const target=await host(),before=target.data.readCharacters(),projects=target.data.frontendProjects();
  const preview=target.data.prepareCharacterImports([{displayName:'invalid.json',mimeType:'application/json',base64:Buffer.from(JSON.stringify(root)).toString('base64')}],'eleckoi');
  expect(()=>target.data.commitCharacterImports(preview.token)).toThrow('Invalid frontend file path');
  expect(target.data.readCharacters()).toEqual(before);
  expect(existsSync(projects.root)?readdirSync(projects.root):[]).toEqual([]);
  expect(readdirSync(join(target.root,'author-frontends','.character-imports'))).toEqual([]);
  expect(readdirSync(join(target.root,'character-assets','characters'))).toEqual([]);
},30_000);

it('reclaims the final physical copy, restores blobs on a failed delete, and expires abandoned upload staging', () => {
  const root=directory(),repo=new CharacterAssetRepository(root,()=>true);
  const asset=upload(repo,'owner','large.mp4',Buffer.alloc(1024*1024,7)),path=repo.readAsset('owner',asset.id).path;
  vi.spyOn(repo as any,'write').mockImplementationOnce(()=>{throw Error('Synthetic catalog failure')});
  expect(()=>repo.delete('owner',[asset.id])).toThrow('Synthetic catalog failure');
  expect(readFileSync(repo.readAsset('owner',asset.id).path)).toHaveLength(1024*1024);
  repo.delete('owner',[asset.id]);expect(existsSync(path)).toBe(false);
  vi.useFakeTimers();
  try { const ticket=repo.begin('owner',{name:'pending.wav',size:1024});vi.advanceTimersByTime(30*60*1000);expect(readdirSync(join(root,'uploads'))).toEqual([]);expect(()=>repo.finish('owner',ticket.id)).toThrow(); }
  finally {vi.useRealTimers();repo.close()}
});

it('retains an empty-only folder hierarchy in PNG and standalone frontend ZIP exports', async () => {
  const source = await host(); source.data.createCharacter({ id: 'empty-source', name: '空分组' })
  const assets = source.data.characterAssets(), folder = assets.createFolder('empty-source', '开场', null).folders[0]!
  assets.createFolder('empty-source', '结局', folder.id)
  const project = source.data.frontendProjects().importProject({ scope: 'character', characterId: 'empty-source' }, { files: [{ path: 'index.html', content: '<html>Empty library</html>' }] })
  const png = source.data.exportCharacter('empty-source', 'png'), target = await host()
  const preview = target.data.prepareCharacterImports([{ displayName: png.fileName, mimeType: png.mimeType, base64: png.base64 }], 'eleckoi')
  const id = target.data.commitCharacterImports(preview.token).importedCharacterIds[0]!
  expect(target.data.characterAssets().list(id).folders).toEqual(assets.list('empty-source').folders)
  const zip = source.data.frontendProjects().exportProject({ scope: 'character', characterId: 'empty-source' }, project.selectedProjectId!)
  target.data.createCharacter({ id: 'empty-target', name: '空分组导入' })
  target.data.frontendProjects().importProject({ scope: 'character', characterId: 'empty-target' }, { filename: zip.filename, data: zip.data })
  expect(target.data.characterAssets().list('empty-target')).toMatchObject({ items: [], folders: assets.list('empty-source').folders })
})
