import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, isAbsolute } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { CharacterAssetRepository } from '../src/domain/characterAssets'
const roots: string[] = []
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) { const path = relative(tmpdir(), root); if (!path || path.startsWith('..') || isAbsolute(path)) throw Error('Invalid fixture root'); rmSync(root, { recursive: true, force: true }) } })
function fixture() { const root = mkdtempSync(join(tmpdir(), 'eleckoi-asset-folders-')); roots.push(root); const repo = new CharacterAssetRepository(root, id => id === 'owner' || id === 'other'); return { root, repo } }
function add(repo: CharacterAssetRepository, name: string, folderId: string | null = null) {
  const ticket = repo.begin('owner', { name, size: 3, folderId }); repo.append('owner', ticket.id, 0, 'YWJj'); return repo.finish('owner', ticket.id).items.at(-1)!
}
it('persists nested mixed-media folders, preserves reference and blob identity when moved, and rejects cycles and foreign folders', () => {
  const { root, repo } = fixture(), folder = repo.createFolder('owner', '开场', null).folders[0]!
  const child = repo.createFolder('owner', '结局', folder.id).folders[1]!
  const image = add(repo, 'image.png', child.id), audio = add(repo, 'audio.wav', child.id), originalPath = repo.readAsset('owner', image.id).path
  repo.renameFolder('owner', child.id, '分支结局'); repo.move('owner', [image.id], [], null)
  expect(repo.readAsset('owner', image.id).path).toBe(originalPath)
  expect(repo.readAsset('owner', image.id).asset).toMatchObject({ id: image.id, hash: image.hash, folderId: null })
  expect(() => repo.move('owner', [], [folder.id], child.id)).toThrow('自身')
  expect(() => repo.move('other', [], [], child.id)).toThrow('找不到')
  expect(() => repo.begin('other', { name: 'image.png', size: 0, folderId: child.id })).toThrow('找不到')
  expect(() => repo.renameFolder('owner', child.id, '../bad')).toThrow('目录')
  const reopened = new CharacterAssetRepository(root, id => id === 'owner')
  expect(reopened.list('owner')).toEqual(repo.list('owner'))
  reopened.delete('owner', [], [folder.id])
  expect(reopened.list('owner').folders).toEqual([])
  expect(reopened.list('owner').items.map(item => item.id)).toEqual([image.id])
  expect(readFileSync(reopened.readAsset('owner', image.id).path).toString()).toBe('abc')
  expect(() => reopened.readAsset('owner', audio.id)).toThrow()
})
it('rolls back recursive deletion and refuses to publish an upload into a folder deleted during transfer', () => {
  const { repo } = fixture(), folder = repo.createFolder('owner', '开场', null).folders[0]!, asset = add(repo, 'image.png', folder.id), before = repo.list('owner')
  const ticket = repo.begin('owner', { name: 'video.mp4', size: 3, folderId: folder.id }); repo.append('owner', ticket.id, 0, 'YWJj')
  vi.spyOn(repo as any, 'write').mockImplementationOnce(() => { throw Error('Synthetic write failure') })
  expect(() => repo.delete('owner', [], [folder.id])).toThrow('Synthetic write failure')
  expect(repo.list('owner')).toEqual(before); expect(existsSync(repo.readAsset('owner', asset.id).path)).toBe(true)
  repo.delete('owner', [], [folder.id]); expect(() => repo.finish('owner', ticket.id)).toThrow('文件夹'); repo.cancel('owner', ticket.id)
  expect(repo.list('owner').items).toEqual([])
})
it('validates imported hierarchy before writing files and restores the catalog if the frontend import fails', () => {
  const { root, repo } = fixture(), folder = repo.createFolder('owner', '开场', null).folders[0]!
  add(repo, 'image.png', folder.id); const assets = repo.portable('owner'), folders = repo.portableFolders('owner')
  expect(() => repo.withNewOwner('new', assets, commit => commit(), [{ ...folder, parentId: folder.id }])).toThrow('循环')
  const before = repo.list('other')
  expect(() => repo.withMergedAssets('other', assets, () => { throw Error('Synthetic frontend failure') }, folders)).toThrow('Synthetic frontend failure')
  expect(repo.list('other')).toEqual(before)
  repo.withMergedAssets('other', assets, () => {}, folders)
  expect(repo.list('other').folders).toEqual(folders)
  expect(new CharacterAssetRepository(root, id => ['owner', 'other'].includes(id)).list('other').items[0]).toMatchObject({ folderId: folder.id })
})
