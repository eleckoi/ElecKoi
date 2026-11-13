import { createHash, randomUUID } from 'node:crypto'
import { appendFileSync, closeSync, copyFileSync, openSync, readSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { z } from 'zod'
import { characterAssetFormat, characterAssetId, characterAssetSchema, characterAssetFolderSchema, type CharacterAssetFolder, type CharacterAsset, type CharacterAssetCatalog, type CharacterAssetUpload, type CharacterAssetUploadTicket, type PortableCharacterAsset } from '@shared/contracts/characterAssets'
import { validateAssetFolders, folderDescendants } from './folders'
import { DesktopError } from '@shared/foundation/DesktopError'
import { ELECKOI_FAILURE_CODES as codes } from '@shared/contracts/errors/codes'

const catalogSchema = z.strictObject({ characterId: z.string().min(1), revision: z.number().int().nonnegative(), items: z.array(characterAssetSchema), folders: z.array(characterAssetFolderSchema).default([]) })
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const fail = (message: string): never => { throw new DesktopError(codes.inputInvalid, message, { field: 'asset' }) }
type Upload = { characterId: string; name: string; size: number; folderId: string | null; offset: number; path: string; idleTimer?: ReturnType<typeof setTimeout> }

/** Character-owned immutable blobs plus an atomic metadata catalog. Shared by both Host profiles. */
export class CharacterAssetRepository {
  private uploads = new Map<string, Upload>()
  constructor(readonly root: string, private readonly characterExists: (id: string) => boolean) {
    mkdirSync(root, { recursive: true }); this.ordinary(root)
    const staging = join(root, 'uploads'); mkdirSync(staging, { recursive: true }); this.ordinary(staging)
    for (const entry of readdirSync(staging)) this.remove(join(staging, entry))
    this.recover()
  }
  private ordinary(path: string): void {
    const root = resolve(this.root), absolute = resolve(path)
    if (absolute !== root && !absolute.startsWith(root + sep)) fail('资产路径超出所属目录。')
    const relative = absolute.slice(root.length)
    let current = root
    for (const segment of ['', ...relative.split(sep).filter(Boolean)]) {
      if (segment) current = join(current, segment)
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) fail('资产目录不允许重定向链接。')
    }
  }
  private remove(path: string) { this.ordinary(path); rmSync(path, { recursive: true, force: true }) }
  private directory(id: string): string { if (!id) fail('资产必须有明确所属角色。'); return join(this.root, 'characters', hash(id)) }
  private requireOwner(id: string) { if (!this.characterExists(id)) throw new DesktopError(codes.characterNotFound, '资产所属角色不存在。', { what: '角色' }) }
  private read(id: string): CharacterAssetCatalog {
    const path = join(this.directory(id), 'catalog.json'); this.ordinary(path)
    if (!existsSync(path)) return { characterId: id, revision: 0, items: [], folders: [] }
    const value = catalogSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    if (value.characterId !== id || new Set(value.items.map(item => item.id)).size !== value.items.length) fail('资产目录归属或编号重复。')
    validateAssetFolders(value.items, value.folders)
    return value
  }
  list(id: string): CharacterAssetCatalog { this.requireOwner(id); return this.read(id) }
  private write(value: CharacterAssetCatalog) {
    validateAssetFolders(value.items, value.folders)
    const directory = this.directory(value.characterId); this.ordinary(directory); mkdirSync(directory, { recursive: true })
    const temp = join(directory, `${randomUUID()}.tmp`)
    try { writeFileSync(temp, JSON.stringify(catalogSchema.parse(value)), { flag: 'wx' }); renameSync(temp, join(directory, 'catalog.json')) }
    finally { if (existsSync(temp)) this.remove(temp) }
  }
  private name(name: string): string { if (typeof name !== 'string' || !name.trim() || /[\0\r\n\\/]/.test(name)) fail('资产名称不能为空，也不能包含目录。'); return name.trim() }
  private blob(characterId: string, digest: string): string {
    if (!/^[a-f0-9]{64}$/.test(digest)) fail('资产摘要无效。')
    const path = join(this.directory(characterId), 'blobs', digest); this.ordinary(path); return path
  }
  readAsset(characterId: string, id: string): { path: string; asset: CharacterAsset } {
    characterAssetId.parse(id)
    const asset = this.list(characterId).items.find(item => item.id === id)
    if (!asset) throw new DesktopError(codes.lookupNotFound, '找不到这项资产。', { what: '资产' })
    const path = this.blob(characterId, asset.hash)
    if (statSync(path).size !== asset.size) throw new DesktopError(codes.dataShapeInvalid, '资产文件大小与目录不一致。', { what: '资产文件' })
    return { path, asset }
  }
  begin(characterId: string, input: CharacterAssetUpload): CharacterAssetUploadTicket {
    this.requireOwner(characterId); const name = this.name(input.name)
    this.requireFolder(this.list(characterId), input.folderId ?? null)
    if (!characterAssetFormat(name)) fail('暂不支持这种资产格式。')
    if (!Number.isSafeInteger(input.size) || input.size < 0) fail('资产文件大小无效。')
    const id = randomUUID(), path = join(this.root, 'uploads', id)
    writeFileSync(path, new Uint8Array(), { flag: 'wx' })
    this.uploads.set(id, { characterId, name, size: input.size, folderId: input.folderId ?? null, offset: 0, path }); this.touchUpload(id)
    return { id, offset: 0 }
  }
  private upload(characterId: string, id: string): Upload {
    this.requireOwner(characterId); const item = this.uploads.get(id)
    if (!item || item.characterId !== characterId) fail('上传已结束或不属于当前角色。')
    return item!
  }
  private touchUpload(id: string): void {
    const item = this.uploads.get(id)!
    clearTimeout(item.idleTimer)
    item.idleTimer = setTimeout(() => { try { this.cancel(item.characterId, id) } catch (error) { console.error('Character asset upload staging cleanup failed', error) } }, 30 * 60 * 1000)
    item.idleTimer.unref()
  }
  append(characterId: string, id: string, offset: number, data: string): CharacterAssetUploadTicket {
    const item = this.upload(characterId, id), bytes = decodeAssetBase64(data)
    if (offset !== item.offset || item.offset + bytes.length > item.size) fail('上传位置或文件大小不一致，请重试。')
    appendFileSync(item.path, bytes); item.offset += bytes.length; this.touchUpload(id); return { id, offset: item.offset }
  }
  finish(characterId: string, id: string): CharacterAssetCatalog {
    const item = this.upload(characterId, id)
    if (item.offset !== item.size) fail('文件尚未完整上传。')
    const format = characterAssetFormat(item.name)!, digest = createHash('sha256'), block = Buffer.alloc(1024 * 1024)
    const file = openSync(item.path, 'r')
    try { for (;;) { const size = readSync(file, block, 0, block.length, null); if (!size) break; digest.update(block.subarray(0, size)) } } finally { closeSync(file) }
    const asset = characterAssetSchema.parse({ id: randomUUID(), name: item.name, ...format, size: item.size, hash: digest.digest('hex'), createdAt: new Date().toISOString(), folderId: item.folderId })
    const catalog = this.list(characterId), target = this.blob(characterId, asset.hash)
    this.requireFolder(catalog, item.folderId)
    mkdirSync(join(this.directory(characterId), 'blobs'), { recursive: true })
    const created = !existsSync(target)
    try { if (created) copyFileSync(item.path, target); this.write({ ...catalog, revision: catalog.revision + 1, items: [...catalog.items, asset] }) }
    catch (error) { if (created) this.remove(target); throw error }
    this.cancel(characterId, id); return this.list(characterId)
  }
  cancel(characterId: string, id: string): void {
    const item = this.uploads.get(id)
    if (!item) return
    if (item.characterId !== characterId) fail('上传不属于当前角色。')
    this.remove(item.path); clearTimeout(item.idleTimer); this.uploads.delete(id)
  }
  rename(characterId: string, id: string, name: string): CharacterAssetCatalog {
    const catalog = this.list(characterId), item = this.readAsset(characterId, id).asset
    name = this.name(name)
    // The name is presentation data. The original type/MIME and stable ID do not change.
    this.write({ ...catalog, revision: catalog.revision + 1, items: catalog.items.map(value => value.id === item.id ? { ...value, name } : value) })
    return this.list(characterId)
  }
  duplicate(characterId: string, ids: string[]): CharacterAssetCatalog {
    const catalog = this.list(characterId), items = [...new Set(ids)].map(id => this.readAsset(characterId, id).asset)
    this.write({ ...catalog, revision: catalog.revision + 1, items: [...catalog.items, ...items.map(item => ({ ...item, id: randomUUID(), name: item.name.replace(/(\.[^.]*)?$/, ' 副本$1'), createdAt: new Date().toISOString() }))] })
    return this.list(characterId)
  }
  delete(characterId: string, ids: string[], folderIds: string[] = []): CharacterAssetCatalog {
    const catalog = this.list(characterId), removing = new Set(ids)
    for (const id of removing) this.readAsset(characterId, id)
    for (const id of folderIds) this.requireFolder(catalog, id)
    const folders = folderDescendants(catalog.folders, folderIds)
    for (const item of catalog.items) if (item.folderId && folders.has(item.folderId)) removing.add(item.id)
    const items = catalog.items.filter(item => !removing.has(item.id))
    const referenced = new Set(items.map(item => item.hash)), removingHashes = [...new Set(catalog.items.filter(item => !referenced.has(item.hash)).map(item => item.hash))]
    const removed = join(this.directory(characterId), 'removed'); this.ordinary(removed)
    if (removingHashes.length) mkdirSync(removed, { recursive: true })
    try {
      for (const digest of removingHashes) renameSync(this.blob(characterId, digest), join(removed, digest))
      this.write({ ...catalog, revision: catalog.revision + 1, items, folders: catalog.folders.filter(folder => !folders.has(folder.id)) })
    } finally { this.recoverRemoved(characterId) }
    return this.list(characterId)
  }
  private recoverRemoved(characterId: string): void {
    const removed = join(this.directory(characterId), 'removed'); this.ordinary(removed)
    if (!existsSync(removed)) return
    const referenced = new Set(this.read(characterId).items.map(item => item.hash))
    for (const digest of readdirSync(removed)) {
      const target = this.blob(characterId, digest), source = join(removed, digest); this.ordinary(source)
      if (referenced.has(digest)) renameSync(source, target)
      else this.remove(source)
    }
    this.remove(removed)
  }
  portable(characterId: string): PortableCharacterAsset[] {
    return this.list(characterId).items.map(item => { const bytes = readFileSync(this.readAsset(characterId, item.id).path); if (hash(bytes) !== item.hash) throw new DesktopError(codes.dataShapeInvalid, '资产文件摘要不一致。', { what: '资产文件' }); return { ...item, data: bytes.toString('base64') } })
  }
  portableFolders(characterId: string): CharacterAssetFolder[] { return this.list(characterId).folders }
  private requireFolder(catalog: CharacterAssetCatalog, id: string | null) {
    if (id !== null && (!characterAssetId.safeParse(id).success || !catalog.folders.some(folder => folder.id === id))) fail('找不到当前角色的资产文件夹。')
  }
  createFolder(characterId: string, name: string, parentId: string | null): CharacterAssetCatalog {
    const catalog = this.list(characterId); this.requireFolder(catalog, parentId)
    const folder = { id: randomUUID(), name: this.name(name), parentId, createdAt: new Date().toISOString() }
    this.write({ ...catalog, revision: catalog.revision + 1, folders: [...catalog.folders, folder] }); return this.list(characterId)
  }
  renameFolder(characterId: string, id: string, name: string): CharacterAssetCatalog {
    const catalog = this.list(characterId); this.requireFolder(catalog, id); name = this.name(name)
    this.write({ ...catalog, revision: catalog.revision + 1, folders: catalog.folders.map(folder => folder.id === id ? { ...folder, name } : folder) }); return this.list(characterId)
  }
  move(characterId: string, assetIds: string[], folderIds: string[], destination: string | null): CharacterAssetCatalog {
    const catalog = this.list(characterId); this.requireFolder(catalog, destination)
    for (const id of assetIds) this.readAsset(characterId, id)
    for (const id of folderIds) this.requireFolder(catalog, id)
    if (destination && folderDescendants(catalog.folders, folderIds).has(destination)) fail('文件夹不能移入自身或子文件夹。')
    const assets = new Set(assetIds), folders = new Set(folderIds)
    this.write({ ...catalog, revision: catalog.revision + 1, items: catalog.items.map(item => assets.has(item.id) ? { ...item, folderId: destination } : item), folders: catalog.folders.map(folder => folders.has(folder.id) ? { ...folder, parentId: destination } : folder) })
    return this.list(characterId)
  }
  withMergedAssets<T>(characterId: string, assets: PortableCharacterAsset[], operation: () => T, folders: CharacterAssetFolder[] = []): T {
    const before = this.list(characterId), additions: CharacterAsset[] = [], created: string[] = []
    if (new Set(folders.map(folder => folder.id)).size !== folders.length) fail('前端包文件夹编号重复。')
    const mergedFolders = [...before.folders]
    for (const raw of folders) {
      const folder = characterAssetFolderSchema.parse(raw), existing = mergedFolders.find(item => item.id === folder.id)
      if (existing && (existing.parentId !== folder.parentId || existing.name !== folder.name)) fail('前端包文件夹编号与当前角色冲突。')
      if (!existing) mergedFolders.push(folder)
    }
    validateAssetFolders([...before.items, ...assets.filter(asset => !before.items.some(item => item.id === asset.id))], mergedFolders)
    try {
      const ids = new Set<string>()
      for (const raw of assets) {
        const { data, ...metadata } = raw, asset = characterAssetSchema.parse(metadata), bytes = decodeAssetBase64(data)
        if (ids.has(asset.id) || bytes.length !== asset.size || hash(bytes) !== asset.hash) fail('前端包的资产数据无效或重复。')
        ids.add(asset.id)
        const existing = before.items.find(item => item.id === asset.id)
        if (existing) { if (existing.hash !== asset.hash || existing.mimeType !== asset.mimeType || existing.type !== asset.type) fail('前端包资产编号与当前角色的不同素材冲突。'); continue }
        const target = this.blob(characterId, asset.hash); mkdirSync(join(this.directory(characterId), 'blobs'), { recursive: true })
        if (!existsSync(target)) { writeFileSync(target, bytes, { flag: 'wx' }); created.push(target) }
        additions.push(asset)
      }
      if (additions.length || mergedFolders.length !== before.folders.length) this.write({ ...before, revision: before.revision + 1, items: [...before.items, ...additions], folders: mergedFolders })
      return operation()
    } catch (error) {
      if (additions.length || mergedFolders.length !== before.folders.length) this.write(before)
      for (const path of created) this.remove(path)
      throw error
    }
  }
  withNewOwner<T>(characterId: string, assets: PortableCharacterAsset[], operation: (commit: () => void) => T, folders: CharacterAssetFolder[] = []): T {
    if (this.characterExists(characterId) || existsSync(this.directory(characterId))) fail('导入资产需要新的所属角色。')
    const validated = assets.map(item => { const { data, ...metadata } = item; const asset = characterAssetSchema.parse(metadata), bytes = decodeAssetBase64(data); if (bytes.length !== asset.size || hash(bytes) !== asset.hash) fail('角色卡资产内容校验失败。'); return { asset, bytes } })
    if (new Set(validated.map(item => item.asset.id)).size !== assets.length) fail('角色卡资产编号重复。')
    folders = validateAssetFolders(validated.map(item => item.asset), folders)
    try {
      return operation(() => {
        for (const { asset, bytes } of validated) { const path = this.blob(characterId, asset.hash); mkdirSync(join(this.directory(characterId), 'blobs'), { recursive: true }); if (!existsSync(path)) writeFileSync(path, bytes, { flag: 'wx' }) }
        this.write({ characterId, revision: 1, items: validated.map(item => item.asset), folders })
      })
    } catch (error) { if (!this.characterExists(characterId)) this.remove(this.directory(characterId)); throw error }
  }
  deleteOwners<T>(ids: string[], operation: () => T): T {
    const moved: Array<{ id: string; path: string }> = []
    const trash = join(this.root, 'deletions', randomUUID()); mkdirSync(trash, { recursive: true })
    writeFileSync(join(trash, 'owners.json'), JSON.stringify(ids))
    try {
      for (const id of ids) { const path = this.directory(id); this.ordinary(path); if (existsSync(path)) { const destination = join(trash, hash(id)); renameSync(path, destination); moved.push({ id, path: destination }) } }
      return operation()
    } finally {
      for (const item of moved) if (this.characterExists(item.id)) renameSync(item.path, this.directory(item.id))
      this.remove(trash)
    }
  }
  private recover() {
    const owners = join(this.root, 'characters')
    if (existsSync(owners)) {
      this.ordinary(owners)
      for (const entry of readdirSync(owners)) {
        if (!/^[a-f0-9]{64}$/.test(entry)) fail('资产所属目录名称无效。')
        const directory = join(owners, entry), catalog = join(directory, 'catalog.json'); this.ordinary(directory)
        if (!existsSync(catalog)) { this.remove(directory); continue }
        const value = catalogSchema.parse(JSON.parse(readFileSync(catalog, 'utf8')))
        if (hash(value.characterId) !== entry) fail('资产目录与所属记录不一致。')
        if (!this.characterExists(value.characterId)) this.remove(directory)
        else this.recoverRemoved(value.characterId)
      }
    }
    const root = join(this.root, 'deletions'); if (!existsSync(root)) return; this.ordinary(root)
    for (const entry of readdirSync(root)) {
      characterAssetId.parse(entry); const directory = join(root, entry); this.ordinary(directory)
      const ids = z.array(z.string().min(1)).parse(JSON.parse(readFileSync(join(directory, 'owners.json'), 'utf8')))
      for (const id of ids) { const saved = join(directory, hash(id)); this.ordinary(saved); if (existsSync(saved) && this.characterExists(id)) { if (existsSync(this.directory(id))) fail('资产删除恢复目标已经存在。'); renameSync(saved, this.directory(id)) } }
      this.remove(directory)
    }
  }
  close() { for (const [id, item] of this.uploads) this.cancel(item.characterId, id) }
}
export function decodeAssetBase64(data: string): Buffer {
  if (typeof data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) fail('资产二进制编码损坏。')
  const bytes = Buffer.from(data, 'base64'); if (bytes.toString('base64') !== data) fail('资产二进制编码损坏。'); return bytes
}
