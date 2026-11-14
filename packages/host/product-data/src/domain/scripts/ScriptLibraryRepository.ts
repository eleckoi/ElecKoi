import { recordCharacterEdit } from '@product-data/domain/characterCatalog'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { dirname, isAbsolute, join } from 'node:path'
import { scriptLibrarySchema, type ScriptLibrary, type ScriptLibraryScope, type ScriptTree } from '@shared/contracts/scripts/schemas'
import { scriptLibraries } from '@product-data/storage/sqlite/schema/common'
import type { ElecKoiDatabase, ElecKoiSqliteStore } from '@product-data/storage/sqlite/SqliteDatabase'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { errorMessage } from '@shared/foundation/errorMessage'
import { ScriptSourceFiles, sourceHash } from './ScriptSourceFiles'
import { decodeScriptFiles, type PortableScriptLibrary } from './scriptLibraryImport'

const metadata = z.record(z.string(), z.json())
const storedScript = z.strictObject({ type: z.literal('script'), metadata, sourceFile: z.string(), sourceHash: z.string() })
const storedFolder = z.strictObject({ type: z.literal('folder'), metadata, scripts: z.array(storedScript) })
const sourceIndex = z.strictObject({ version: z.literal(1), items: z.array(z.discriminatedUnion('type', [storedScript, storedFolder])) })
type SourceIndex = z.infer<typeof sourceIndex>
/** 已落盘的脚本库载荷：解析不出来就是存储损坏，原异常诊断留在 message 里。 */
function parseStoredJson(raw: string, what: string): unknown {
  try { return JSON.parse(raw) }
  catch (error) { throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt, `${what}已损坏：${errorMessage(error)}`, { what }) }
}
export interface ScriptLibraryOwners {
  character(db: ElecKoiDatabase, ownerId: string): boolean
  preset(db: ElecKoiDatabase, ownerId: string): boolean
}

export class ScriptLibraryRepository {
  readonly files: ScriptSourceFiles
  constructor(private readonly store: ElecKoiSqliteStore, private readonly owners: ScriptLibraryOwners, root?: string) {
    if (!root && !isAbsolute(store.native.name)) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, '脚本库需要明确的本地目录。', { what: '脚本库目录' })
    this.files = new ScriptSourceFiles(root ?? join(dirname(store.native.name), 'author-scripts'), store,
      (scope, ownerId) => this.owners[scope](store.db, ownerId))
  }

  directory(scope: ScriptLibraryScope, ownerId: string): string {
    scriptLibrarySchema.parse({ scope, ownerId, enabled: false, revision: 0, trees: [], variables: {} })
    return scope === 'global' ? 'global' : `${scope}/${sourceHash(ownerId)}`
  }

  workspace(scope: ScriptLibraryScope, ownerId: string) {
    const empty = scriptLibrarySchema.parse({ scope, ownerId, enabled: false, revision: 0, trees: [], variables: {} })
    this.requireOwner(empty, this.store.db)
    const directory = this.directory(scope, ownerId)
    const row = this.store.db.select().from(scriptLibraries).where(and(eq(scriptLibraries.scope, scope), eq(scriptLibraries.ownerId, ownerId))).get()
    const index = row ? sourceIndex.parse(parseStoredJson(row.treesJson, '脚本库树')) : { version: 1, items: [] } as SourceIndex
    const entries = index.items.flatMap(item => item.type === 'folder' ? item.scripts : [item]).map(item => {
      if (!item.sourceFile.startsWith(`${directory}/`)) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '脚本源码登记的所属目录不匹配。', { what: '脚本源码登记的所属目录' })
      this.files.path(item.sourceFile)
      return { id: z.string().parse(item.metadata.id), file: item.sourceFile.slice(directory.length + 1) }
    })
    return { path: this.files.directory(directory), version: this.files.version(directory), entries }
  }

  asset(scope: ScriptLibraryScope, ownerId: string, version: string, file: string): Uint8Array {
    const workspace = this.workspace(scope, ownerId)
    if (workspace.version !== version) throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '脚本文件已更新，请重新载入脚本。', { what: '脚本文件' })
    return this.files.bytes(this.directory(scope, ownerId), file)
  }

  transaction<T>(operation: (db: ElecKoiDatabase) => T): T {
    return this.files.transaction(() => operation(this.store.db))
  }

  exists(scope: ScriptLibraryScope, ownerId: string, db = this.store.db): boolean {
    return Boolean(db.select({ scope: scriptLibraries.scope }).from(scriptLibraries).where(and(
      eq(scriptLibraries.scope, scope), eq(scriptLibraries.ownerId, ownerId),
    )).get())
  }

  get(scope: ScriptLibraryScope, ownerId: string, db = this.store.db): ScriptLibrary {
    const empty = scriptLibrarySchema.parse({ scope, ownerId, enabled: false, revision: 0, trees: [], variables: {} })
    this.requireOwner(empty, db)
    const row = db.select().from(scriptLibraries).where(and(
      eq(scriptLibraries.scope, scope), eq(scriptLibraries.ownerId, ownerId),
    )).get()
    if (!row) return empty
    const index = sourceIndex.parse(parseStoredJson(row.treesJson, '脚本库树'))
    let changed = false
    const read = (script: z.infer<typeof storedScript>) => {
      const content = this.files.read(script.sourceFile), hash = sourceHash(content)
      if (script.sourceHash !== hash) { script.sourceHash = hash; changed = true }
      return { ...script.metadata, content }
    }
    const trees = index.items.map(item => item.type === 'folder'
      ? { ...item.metadata, scripts: item.scripts.map(read) } : read(item))
    const library = scriptLibrarySchema.parse({
      scope: row.scope, ownerId: row.ownerId, enabled: Boolean(row.enabled), revision: row.revision,
      trees, variables: parseStoredJson(row.variablesJson, '变量配置'),
    })
    // External editors change the authoritative source, invalidating older UI drafts.
    if (changed) {
      library.revision++
      const update = { revision: library.revision, treesJson: JSON.stringify(index) }
      this.files.mark(scope, ownerId, row, { ...row, ...update })
      db.update(scriptLibraries).set(update).where(and(
        eq(scriptLibraries.scope, scope), eq(scriptLibraries.ownerId, ownerId),
      )).run()
      if (scope === 'character') recordCharacterEdit(db, ownerId)
    }
    return library
  }

  save(input: ScriptLibrary): ScriptLibrary {
    return this.transaction(db => this.saveInTransaction(input, db))
  }

  updateSettings(scope: ScriptLibraryScope, ownerId: string, scriptId: string,
    target: 'script' | 'library', values: Record<string, unknown>, expectedRevision: number): ScriptLibrary {
    return this.transaction(db => {
      const settings = metadata.parse(values), current = this.get(scope, ownerId, db)
      if (current.revision !== expectedRevision) {
        throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '脚本设置已被修改，请重新读取后再保存。', { what: '脚本设置' })
      }
      const item = current.trees.flatMap(tree => tree.type === 'folder' ? tree.scripts : [tree]).find(item => item.id === scriptId)
      if (!item) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, '脚本设置所属脚本不存在。', { what: '脚本设置所属的脚本' })
      if (target === 'script') item.data = settings
      else current.variables = settings
      // Save from the latest library; the file participant never rewrites unchanged source.
      return this.saveInTransaction(current, db)
    })
  }

  saveAll(inputs: ScriptLibrary[]): ScriptLibrary[] {
    const keys = new Set<string>()
    for (const input of inputs) {
      const key = JSON.stringify([input.scope, input.ownerId])
      if (keys.has(key)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, '一次保存不能包含重复的脚本库归属。', { what: '脚本库归属' })
      keys.add(key)
    }
    return this.transaction(db => inputs.map(input => this.saveInTransaction(input, db)))
  }

  saveInTransaction(input: ScriptLibrary, db: ElecKoiDatabase): ScriptLibrary {
    // Loose script fields preserve authored configuration, but every stored value must remain JSON.
    z.json().parse(input)
    const library = scriptLibrarySchema.parse(input)
    const current = this.get(library.scope, library.ownerId, db)
    if (current.revision !== library.revision) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '脚本库已被修改，请重新加载后再保存。', { what: '脚本库' })
    }
    const next = { ...library, revision: current.revision + 1 }
    const before = db.select().from(scriptLibraries).where(and(
      eq(scriptLibraries.scope, next.scope), eq(scriptLibraries.ownerId, next.ownerId),
    )).get() ?? null
    const index = this.index(next)
    const oldFiles = before ? this.sources(sourceIndex.parse(parseStoredJson(before.treesJson, '脚本库树'))) : []
    const nextFiles = new Set(this.sources(index))
    for (const path of oldFiles) if (!nextFiles.has(path)) this.files.stage(path, null)
    const row = {
      scope: next.scope, ownerId: next.ownerId,
      characterId: next.scope === 'character' ? next.ownerId : null,
      presetId: next.scope === 'preset' ? next.ownerId : null,
      enabled: Number(next.enabled), revision: next.revision,
      treesJson: JSON.stringify(index), variablesJson: JSON.stringify(next.variables),
    }
    db.insert(scriptLibraries).values(row).onConflictDoUpdate({
      target: [scriptLibraries.scope, scriptLibraries.ownerId], set: row,
    }).run()
    this.files.mark(next.scope, next.ownerId, before, row)
    if (next.scope === 'character') recordCharacterEdit(db, next.ownerId)
    return next
  }

  portable(scope: ScriptLibraryScope, ownerId: string): PortableScriptLibrary {
    const before = this.workspace(scope, ownerId), directory = this.directory(scope, ownerId)
    const { trees, variables, enabled } = this.get(scope, ownerId)
    const entries = new Set(before.entries.map(entry => entry.file))
    const files = decodeScriptFiles(this.files.names(directory).filter(path => !entries.has(path)).map(path => ({
      path, data: Buffer.from(this.files.readBytes(`${directory}/${path}`)).toString('base64'),
    })))
    if (this.files.version(directory) !== before.version) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.conflictStaleRevision, '脚本文件在导出期间发生变化，请重新导出。', { what: '脚本文件' })
    }
    return { trees, variables, enabled, files }
  }

  importInTransaction(scope: ScriptLibraryScope, ownerId: string, portable: PortableScriptLibrary, db: ElecKoiDatabase): ScriptLibrary {
    const files = decodeScriptFiles(portable.files ?? []), directory = this.directory(scope, ownerId)
    if (this.exists(scope, ownerId, db) || this.files.names(directory).length) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, '导入脚本需要新的所属对象，未覆盖现有文件。', { what: '脚本导入目标' })
    const saved = this.saveInTransaction({ scope, ownerId, trees: portable.trees, variables: portable.variables,
      enabled: portable.enabled, revision: 0 }, db)
    const entries = new Set(saved.trees.flatMap(tree => tree.type === 'folder' ? tree.scripts : [tree])
      .map(item => `scripts/${sourceHash(item.id)}.js`))
    for (const file of files) {
      const path = process.platform === 'win32' ? file.path.toLowerCase() : file.path
      if (entries.has(path)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, `脚本附件不能覆盖登记的入口：${file.path}`, { what: '脚本附件', path: file.path })
      this.files.stage(`${directory}/${file.path}`, Buffer.from(file.data, 'base64'))
    }
    return saved
  }

  deleteOwnerInTransaction(scope: 'character' | 'preset', ownerId: string, db: ElecKoiDatabase): void {
    const row = db.select().from(scriptLibraries).where(and(
      eq(scriptLibraries.scope, scope), eq(scriptLibraries.ownerId, ownerId),
    )).get()
    const directory = this.directory(scope, ownerId)
    this.files.markOwnerDeletion(scope, ownerId)
    for (const path of this.files.names(directory)) this.files.stage(`${directory}/${path}`, null)
    db.delete(scriptLibraries).where(and(eq(scriptLibraries.scope, scope), eq(scriptLibraries.ownerId, ownerId))).run()
    this.files.mark(scope, ownerId, row ?? null, null)
  }

  replaceResourcesInTransaction(scope: ScriptLibraryScope, ownerId: string, input: unknown): void {
    const files = decodeScriptFiles(input), directory = this.directory(scope, ownerId)
    const library = this.get(scope, ownerId)
    const entries = new Set(library.trees.flatMap(tree => tree.type === 'folder' ? tree.scripts : [tree])
      .map(item => `scripts/${sourceHash(item.id)}.js`))
    const next = new Set(files.map(file => process.platform === 'win32' ? file.path.toLowerCase() : file.path))
    for (const file of files) if (entries.has(process.platform === 'win32' ? file.path.toLowerCase() : file.path)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, `脚本版本资源不能覆盖登记入口：${file.path}`, { what: '脚本版本资源', path: file.path })
    }
    for (const name of this.files.names(directory)) {
      const normalized = process.platform === 'win32' ? name.toLowerCase() : name
      if (!entries.has(normalized) && !next.has(normalized)) this.files.stage(`${directory}/${name}`, null)
    }
    for (const file of files) this.files.stage(`${directory}/${file.path}`, Buffer.from(file.data, 'base64'))
  }

  private sources(index: SourceIndex): string[] {
    return index.items.flatMap(item => item.type === 'folder' ? item.scripts.map(script => script.sourceFile) : [item.sourceFile])
  }

  private index(library: ScriptLibrary): SourceIndex {
    const directory = this.directory(library.scope, library.ownerId)
    const script = (item: Extract<ScriptTree, { type: 'script' }>): z.infer<typeof storedScript> => {
      const { content, ...metadata } = item
      const sourceFile = `${directory}/scripts/${sourceHash(item.id)}.js`
      this.files.stage(sourceFile, content)
      return { type: 'script', metadata, sourceFile, sourceHash: sourceHash(content) }
    }
    return sourceIndex.parse({ version: 1, items: library.trees.map(item => {
      if (item.type === 'script') return script(item)
      const { scripts, ...metadata } = item
      return { type: 'folder', metadata, scripts: scripts.map(script) }
    }) })
  }

  private requireOwner(library: ScriptLibrary, db: ElecKoiDatabase): void {
    if (library.scope === 'character' && !this.owners.character(db, library.ownerId)) throw new DesktopError(ELECKOI_FAILURE_CODES.characterNotFound, '脚本库所属角色不存在。', { what: '角色' })
    if (library.scope === 'preset' && !this.owners.preset(db, library.ownerId)) throw new DesktopError(ELECKOI_FAILURE_CODES.agentPresetNotFound, '脚本库所属预设不存在。', { what: '预设' })
  }
}
