import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { Unzip, UnzipInflate, Zip, ZipDeflate } from 'fflate'
import { FrontendIndex, type FrontendSection } from './FrontendIndex'
import { FrontendCharacterDeletion } from './FrontendCharacterDeletion'
import { FRONTEND_MANIFEST_FILE } from './types'
import type { FrontendScope, FrontendProject, FrontendManifest, FrontendValue, FrontendOwner,
  FrontendWorkspace, FrontendImport, FrontendReplaceFiles, FrontendFileInput, FrontendFile, FrontendExport, FrontendJson } from './types'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'

type Document = { [key: string]: FrontendValue }
type Owner = { scope: FrontendScope; characterId?: string; settingsScope: FrontendSection; key: string }
type Files = Record<string, Uint8Array>
// Resource paths are author data, including names such as "__proto__". The
// convenience ZIP map functions use plain objects internally; streams preserve
// each literal filename and also let us reject duplicate archive entries.
function zipFiles(files: Files): Buffer {
  const chunks: Uint8Array[] = []
  let completed = false
  const archive = new Zip((error, chunk, final) => {
    if (error) throw error
    chunks.push(chunk)
    completed = final
  })
  for (const [name, body] of Object.entries(files)) {
    const file = new ZipDeflate(name)
    archive.add(file)
    file.push(body, true)
  }
  archive.end()
  if (!completed) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, 'Frontend ZIP export did not finish', { what: '前端 ZIP 导出' })
  return Buffer.concat(chunks)
}
const PROJECTS = 'projects', SETTINGS = 'character-settings', APPLICATION_SETTINGS = 'application-settings'
const FRONTEND_ACTIONS = ['workspace', 'importProject', 'select',
  'delete', 'readFile', 'writeFile', 'exportProject', 'setMessageRenderer',
  'updateProject', 'replaceFiles', 'restoreDefault'] as const
const object = (value: FrontendValue | undefined): Document => {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'Expected a frontend object', { what: '前端数据' })
  return value
}
const json = (value: unknown) => value as FrontendValue
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const mimeTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.wasm': 'application/wasm' }

/** Native file-project owner; callers must provide an explicit scope. */
export class FrontendProjectRepository {
  readonly root: string
  private readonly characterDeletion: FrontendCharacterDeletion
  constructor(readonly index: FrontendIndex, private readonly characterExists: (id: string) => boolean) {
    this.root = join(index.root, 'projects')
    this.characterDeletion = new FrontendCharacterDeletion(index, characterExists)
  }
  deleteCharacterOwners<T>(characterIds: readonly string[], operation: () => T): T {
    return this.characterDeletion.run(characterIds, operation)
  }
  recoverCharacterDeletions(): void { this.characterDeletion.recover() }
  /** Copy project identities and resources while the caller creates the new character in its transaction. */
  copyCharacterOwner<T>(sourceId: string, targetId: string, operation: (copy: () => void) => T): T {
    const source = { scope: 'character' as const, characterId: sourceId };
    const workspace = this.workspace(source);
    if (this.characterExists(targetId) || this.index.get(SETTINGS, targetId) !== null) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, '角色前端复制需要新的所属对象。', { what: '角色前端复制目标' });
    }
    const copies = workspace.projects.map(project => ({
      project: { ...structuredClone(project), id: randomUUID(), characterId: targetId },
      files: this.readFiles(project), sourceId: project.id,
    }));
    const selected = copies.find(item => item.sourceId === workspace.selectedProjectId);
    if (workspace.selectedProjectId && !selected) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, '角色前端选择不属于当前角色。', { what: '角色前端选择' });
    let started = false;
    try {
      return operation(() => {
        started = true;
        const owner = this.owner({ scope: 'character', characterId: targetId });
        this.index.atomic(() => {
          for (const item of copies) this.commit(item.project, item.files, owner);
          this.settings(owner, { ...object(this.index.get(SETTINGS, sourceId)),
            selectedProjectId: selected?.project.id ?? null });
        });
      });
    } catch (error) {
      if (started && !this.characterExists(targetId)) {
        try {
          this.index.atomic(() => {
            for (const { project } of copies) this.index.delete(PROJECTS, project.id);
            this.index.delete(SETTINGS, targetId);
          });
          for (const { project } of copies) {
            const directory = resolve(this.root, project.id);
            if (!directory.startsWith(resolve(this.root) + sep)) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, '角色前端复制目录超出所属范围。', { what: '角色前端复制目录' });
            rmSync(directory, { recursive: true, force: true });
          }
        } catch (recoveryError) { throw new AggregateError([error, recoveryError], '角色复制失败，前端资源清理未完成。'); }
      }
      throw error;
    }
  }
  private character(p: Document): string {
    if (typeof p.characterId !== 'string' || !p.characterId) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'Frontend operation requires an explicit character id', { field: 'characterId' })
    if (!this.characterExists(p.characterId)) throw new DesktopError(ELECKOI_FAILURE_CODES.characterNotFound, `Character does not exist: ${p.characterId}`, { what: '角色' })
    return p.characterId
  }
  private owner(p: Document): Owner {
    if (p.scope === 'application') return { scope: 'application', settingsScope: APPLICATION_SETTINGS, key: 'application' }
    if (p.scope !== 'character') throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, `Unknown frontend scope: ${String(p.scope)}`, { what: '前端作用域', expected: 'character、application' })
    const characterId = this.character(p)
    return { scope: 'character', characterId, settingsScope: SETTINGS, key: characterId }
  }
  private project(id: string): FrontendProject {
    // Project identifiers must remain within their resource directory.
    if (!id || id === '.' || id === '..' || /[\\/:\0]/.test(id)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `Invalid frontend project id: ${id}`, { field: 'projectId' })
    const value = this.index.get(PROJECTS, id)
    if (!value) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `Frontend project does not exist: ${id}`, { what: '前端项目' })
    return structuredClone(object(value)) as unknown as FrontendProject
  }
  private belongs(project: FrontendProject, owner: Owner) {
    return (project.scope || 'character') === owner.scope
      && (owner.scope === 'application' || project.characterId === owner.characterId)
  }
  private owned(id: string, owner: Owner) {
    const project = this.project(id)
    if (!this.belongs(project, owner)) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, owner.scope === 'character'
        ? 'Frontend project belongs to another character or scope' : 'Frontend project belongs to another scope',
      { what: '前端项目归属' })
    }
    return project
  }
  private name(value: unknown) {
    if (typeof value !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'Frontend file path must be a string', { field: 'path' })
    const name = value.replaceAll('\\', '/')
    if (!name || name.startsWith('/') || name.includes(':') || name.includes('\0')
      || name.split('/').some(part => !part || part === '.' || part === '..')) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `Invalid frontend file path: ${name}`, { field: 'name' })
    return name
  }
  private path(id: string, name: string) {
    const root = resolve(this.root, id), path = resolve(root, this.name(name))
    if (!path.startsWith(root + sep)) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, `Frontend path is outside its project: ${name}`, { what: '前端项目之外的路径' })
    return path
  }
  private workspaceOf(owner: Owner): Document {
    const store = this.index, settings = object(store.get(owner.settingsScope, owner.key))
    const projects = Object.values(store.list(PROJECTS)).filter(value => this.belongs(object(value) as unknown as FrontendProject, owner))
    const selectedProjectId = settings.selectedProjectId ?? null
    const selected = projects.find(value => object(value).id === selectedProjectId)
    return { scope: owner.scope, ...(owner.characterId ? { characterId: owner.characterId } : {}), projects,
      selectedProjectId, messageRendererEnabled: settings.messageRendererEnabled !== false,
      activeBindings: selected ? object(object(selected).manifest).bindings || [] : [], revision: settings.revision ?? 0 }
  }
  workspace(owner: FrontendOwner): FrontendWorkspace { return this.workspaceOf(this.owner(json(owner) as Document)) as unknown as FrontendWorkspace }
  importProject(owner: FrontendOwner, input: FrontendImport): FrontendWorkspace {
    return this.execute('importProject', { ...input, ...owner } as unknown as Document) as unknown as FrontendWorkspace
  }
  select(owner: FrontendOwner, projectId: string | null): FrontendWorkspace {
    return this.execute('select', { ...owner, projectId }) as unknown as FrontendWorkspace
  }
  delete(owner: FrontendOwner, projectId: string): FrontendWorkspace {
    return this.execute('delete', { ...owner, projectId }) as unknown as FrontendWorkspace
  }
  readFile(owner: FrontendOwner, projectId: string, path?: string, encoding?: 'utf8' | 'base64'): FrontendFile {
    return this.execute('readFile', { ...owner, projectId, ...(path === undefined ? {} : { path }),
      ...(encoding === undefined ? {} : { encoding }) }) as unknown as FrontendFile
  }
  writeFile(owner: FrontendOwner, projectId: string, file: FrontendFileInput): FrontendWorkspace {
    return this.execute('writeFile', { ...file, ...owner, projectId }) as unknown as FrontendWorkspace
  }
  exportProject(owner: FrontendOwner, projectId: string): FrontendExport {
    return this.execute('exportProject', { ...owner, projectId }) as unknown as FrontendExport
  }
  setMessageRenderer(owner: FrontendOwner, enabled: boolean): FrontendWorkspace {
    if (typeof enabled !== 'boolean') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'Message renderer enabled must be a boolean', { field: 'enabled' })
    return this.execute('setMessageRenderer', { ...owner, enabled }) as unknown as FrontendWorkspace
  }
  updateProject(owner: FrontendOwner, projectId: string, patch: FrontendJson): FrontendWorkspace {
    return this.execute('updateProject', { ...owner, projectId, patch }) as unknown as FrontendWorkspace
  }
  replaceFiles(owner: FrontendOwner, projectId: string, input: FrontendReplaceFiles): FrontendWorkspace {
    return this.execute('replaceFiles', { ...input, ...owner, projectId } as unknown as Document) as unknown as FrontendWorkspace
  }
  restoreDefault(owner: FrontendOwner): FrontendWorkspace {
    return this.execute('restoreDefault', owner) as unknown as FrontendWorkspace
  }
  readAsset(id: string, name: string) {
    const project = this.project(id)
    if (!project.files.includes(name)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `Frontend resource does not exist: ${id}/${name}`, { what: '前端资源' })
    const body = readFileSync(this.path(id, name))
    return { body, mimeType: mimeTypes[extname(name).toLowerCase()] || 'application/octet-stream' }
  }
  hasAsset(id: string, name: string): boolean {
    const value = this.index.get(PROJECTS, id)
    return value !== null && Array.isArray(object(value).files) && (object(value).files as FrontendValue[]).includes(name)
  }
  private readFiles(project: FrontendProject): Files {
    return Object.fromEntries(project.files.map(name => [name, this.readAsset(project.id, name).body]))
  }
  private fileInputs(input: FrontendValue | undefined): Files {
    if (!Array.isArray(input)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'Frontend files must be an array', { field: 'files' })
    const files: Files = Object.create(null)
    for (const raw of input) {
      const file = object(raw), name = this.name(file.path ?? file.name)
      if (own(files, name)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, `Duplicate frontend file: ${name}`, { what: '前端文件' })
      if (file.encoding !== undefined && !['utf8', 'base64'].includes(String(file.encoding))) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, `Unknown file encoding: ${file.encoding}`, { what: '前端文件编码', expected: 'utf8、base64' })
      if (typeof file.content !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `Frontend file content must be a string: ${name}`, { field: 'content' })
      files[name] = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8')
    }
    return files
  }
  private unzipFiles(bytes: Uint8Array): Files {
    const files: Files = Object.create(null), names = new Set<string>()
    const archive = new Unzip(file => {
      if (file.name.endsWith('/')) return
      const name = this.name(file.name)
      if (names.has(name)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupDuplicate, `Duplicate frontend archive file: ${name}`, { what: '前端归档文件' })
      names.add(name)
      const chunks: Uint8Array[] = []
      file.ondata = (error, chunk, final) => {
        if (error) throw error
        chunks.push(chunk)
        if (final) files[name] = Buffer.concat(chunks)
      }
      file.start()
    })
    archive.register(UnzipInflate)
    archive.push(bytes, true)
    if (Object.keys(files).length !== names.size) throw new DesktopError(ELECKOI_FAILURE_CODES.internal, 'Frontend ZIP import did not finish', { what: '前端 ZIP 导入' })
    return files
  }
  private archiveManifest(files: Files): Document | undefined {
    if (!own(files, FRONTEND_MANIFEST_FILE)) return undefined
    try { return object(JSON.parse(Buffer.from(files[FRONTEND_MANIFEST_FILE]!).toString('utf8'))) }
    catch (error) { throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, `Invalid ${FRONTEND_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`, { what: '前端清单' }) }
  }
  private manifest(raw: Document, scope: FrontendScope, files: ReadonlySet<string>, entryFile: string): FrontendManifest {
    if (raw.manifestVersion !== undefined && raw.manifestVersion !== 1) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, `Unsupported frontend manifest version: ${raw.manifestVersion}`, { what: '前端清单版本', expected: '1' })
    if (raw.scope !== undefined && raw.scope !== scope) throw new DesktopError(ELECKOI_FAILURE_CODES.stateMismatch, `Frontend manifest scope ${raw.scope} does not match requested ${scope}`, { what: '前端清单的归属' })
    if (raw.sdkVersion !== undefined && (typeof raw.sdkVersion !== 'string' || !raw.sdkVersion)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'Frontend sdkVersion must be a nonempty string', { what: '前端清单', path: 'sdkVersion' })
    const entry = this.name(entryFile)
    if (!files.has(entry) || !/\.html?$/i.test(entry)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `Frontend HTML entry does not exist: ${entry}`, { what: '前端 HTML 入口' })
    if (raw.globalStyles !== undefined && (!Array.isArray(raw.globalStyles) || raw.globalStyles.some(name => typeof name !== 'string' || !files.has(this.name(name))))) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'Frontend globalStyles must reference existing project files', { what: '前端 globalStyles' })
    if (raw.bindings !== undefined) {
      if (!Array.isArray(raw.bindings)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'Frontend bindings must be an array', { what: '前端清单', path: 'bindings' })
      for (const value of raw.bindings) {
        const binding = object(value)
        if (!['root', 'page', 'slot'].includes(String(binding.target))) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, `Unknown frontend binding target: ${binding.target}`, { what: '前端绑定目标' })
        const bindingEntry = this.name(binding.entryFile)
        if (!files.has(bindingEntry) || !/\.html?$/i.test(bindingEntry)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `Frontend binding entry does not exist: ${bindingEntry}`, { what: '前端绑定入口' })
        if (binding.target === 'page' && (typeof binding.pageId !== 'string' || !binding.pageId)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'Frontend page binding requires pageId', { what: '前端清单', path: 'bindings.pageId' })
        if (binding.target === 'slot' && (typeof binding.slot !== 'string' || !binding.slot)) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'Frontend slot binding requires slot', { what: '前端清单', path: 'bindings.slot' })
      }
    }
    if (raw.config !== undefined) object(raw.config)
    return { ...raw, manifestVersion: 1, sdkVersion: String(raw.sdkVersion || '0.1.0'), scope, entryFile: entry } as unknown as FrontendManifest
  }
  private materialize(project: FrontendProject, files: Files) {
    project.files = [...new Set([...project.files, ...Object.keys(files), FRONTEND_MANIFEST_FILE])].sort()
    const metadata = { ...project } as Record<string, unknown>
    delete metadata.manifest
    // An actual file carries manifest and unknown metadata through ZIP import/export.
    const manifest = { ...project.manifest, project: metadata }
    files[FRONTEND_MANIFEST_FILE] = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8')
  }
  private settings(owner: Owner, patch: Document = {}) {
    const store = this.index, previous = object(store.get(owner.settingsScope, owner.key))
    store.put(owner.settingsScope, owner.key, { ...previous, ...patch, revision: Number(previous.revision || 0) + 1 })
  }
  /** Only changed files and manifest are staged/backed up; unrelated assets stay in place. */
  private commit(project: FrontendProject, files: Files, owner: Owner, select = false, deleted: readonly string[] = []) {
    this.materialize(project, files)
    const directory = join(this.root, project.id), existed = existsSync(directory), staging = join(this.root, `.stage-${randomUUID()}`)
    const changes: Array<{ destination: string; backup: string; backedUp: boolean; installed: boolean }> = []
    mkdirSync(staging, { recursive: true })
    try {
      for (const [name, body] of Object.entries(files)) {
        const destination = resolve(staging, 'writes', this.name(name))
        mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, body)
      }
      for (const name of [...Object.keys(files), ...deleted]) {
        const destination = this.path(project.id, name), backup = resolve(staging, 'backup', name)
        const change = { destination, backup, backedUp: false, installed: false }
        changes.push(change)
        if (existsSync(destination)) {
          mkdirSync(dirname(backup), { recursive: true }); renameSync(destination, backup); change.backedUp = true
        }
        if (own(files, name)) {
          mkdirSync(dirname(destination), { recursive: true })
          renameSync(resolve(staging, 'writes', name), destination); change.installed = true
        }
      }
      this.index.atomic(() => {
        this.index.put(PROJECTS, project.id, json(project))
        this.settings(owner, select ? { selectedProjectId: project.id } : {})
      })
    } catch (error) {
      for (const change of changes.reverse()) {
        if (change.installed) rmSync(change.destination)
        if (change.backedUp) renameSync(change.backup, change.destination)
      }
      if (!existed && existsSync(directory)) rmSync(directory, { recursive: true })
      if (existsSync(staging)) rmSync(staging, { recursive: true })
      throw error
    }
    this.cleanupCommitted(staging)
  }
  private cleanupCommitted(path: string) {
    try { rmSync(path, { recursive: true }) }
    catch { throw new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, `Frontend changes committed, but temporary directory cleanup failed: ${path}`, { operation: 'delete' }) }
  }
  private execute(method: string, p: Document): FrontendValue {
    if (!(FRONTEND_ACTIONS as readonly string[]).includes(method)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, `Unknown frontend method: ${method}`, { what: '前端方法' })
    const store = this.index, owner = this.owner(p)
    if (method === 'workspace') return this.workspaceOf(owner)
    if (['select', 'restoreDefault', 'setMessageRenderer'].includes(method)) {
      const patch: Document = {}
      if (method === 'setMessageRenderer') patch.messageRendererEnabled = p.enabled !== false
      else {
        const id = method === 'restoreDefault' || p.projectId == null ? null : String(p.projectId)
        if (id) this.owned(id, owner)
        patch.selectedProjectId = id
      }
      store.atomic(() => this.settings(owner, patch))
    } else if (method === 'importProject') {
      let files: Files
      if (p.files === undefined && typeof p.html !== 'string' && typeof p.data !== 'string') throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'Frontend import requires files, HTML or encoded data', { field: 'files' })
      if (p.files !== undefined) files = this.fileInputs(p.files)
      else if (/\.zip$/i.test(String(p.filename || ''))) {
        files = this.unzipFiles(Buffer.from(String(p.data || ''), 'base64'))
      } else files = { 'index.html': p.html !== undefined ? Buffer.from(String(p.html), 'utf8') : Buffer.from(String(p.data || ''), 'base64') }
      const archived = this.archiveManifest(files), requested = { ...object(archived?.project), ...object(p.project) }
      const rawManifest = { ...archived, ...object(requested.manifest), ...object(p.manifest) }
      const explicit = p.entryFile ?? requested.entryFile ?? rawManifest.entryFile
      const entry = explicit !== undefined ? this.name(explicit) : own(files, 'index.html') ? 'index.html' : undefined
      if (!entry) throw new DesktopError(ELECKOI_FAILURE_CODES.dataShapeInvalid, 'Frontend project requires an explicit entryFile or a root index.html', { what: '前端项目入口' })
      const project = { ...requested, id: randomUUID(), scope: owner.scope,
        name: String(p.name || requested.name || p.filename || 'HTML 前端'), entryFile: entry, files: Object.keys(files).sort(),
        importedAt: new Date().toISOString(), manifest: this.manifest(rawManifest, owner.scope, new Set(Object.keys(files)), entry) } as unknown as FrontendProject
      if (owner.characterId) project.characterId = owner.characterId
      else delete project.characterId
      this.commit(project, files, owner, p.select !== false)
    } else {
      const project = this.owned(String(p.projectId || ''), owner)
      if (method === 'readFile') {
        if (p.encoding !== undefined && !['utf8', 'base64'].includes(String(p.encoding))) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, `Unknown file encoding: ${p.encoding}`, { what: '文件编码', expected: 'utf8、base64' })
        const name = this.name(p.path ?? project.entryFile), asset = this.readAsset(project.id, name)
        return { path: name, content: asset.body.toString(p.encoding === 'base64' ? 'base64' : 'utf8'), mimeType: asset.mimeType }
      }
      if (method === 'exportProject') {
        const files = this.readFiles(project)
        project.manifest = this.manifest(object(json(project.manifest)), owner.scope, new Set(Object.keys(files)), project.entryFile)
        this.materialize(project, files)
        return { filename: `${project.name}.zip`, data: zipFiles(files).toString('base64'), project: json(project) }
      }
      if (method === 'delete') {
        const directory = join(this.root, project.id), trash = join(this.root, `.delete-${randomUUID()}`), moved = existsSync(directory)
        if (moved) renameSync(directory, trash)
        try {
          store.atomic(() => {
            store.delete(PROJECTS, project.id)
            const settings = object(store.get(owner.settingsScope, owner.key))
            this.settings(owner, settings.selectedProjectId === project.id ? { selectedProjectId: null } : {})
          })
        } catch (error) { if (moved) renameSync(trash, directory); throw error }
        if (moved) this.cleanupCommitted(trash)
      } else {
        const files: Files = Object.create(null), names = new Set(project.files), deleted: string[] = []
        let rawManifest = object(json(project.manifest))
        if (method === 'updateProject') {
          const patch = object(p.patch)
          for (const key of ['id', 'scope', 'characterId', 'files', 'importedAt']) if (own(patch, key)) throw new DesktopError(ELECKOI_FAILURE_CODES.securityDenied, `Frontend project field is immutable: ${key}`, { what: '前端项目字段' })
          for (const [key, value] of Object.entries(patch)) Object.defineProperty(project, key, { value, enumerable: true, writable: true, configurable: true })
          rawManifest = { ...rawManifest, ...object(patch.manifest) }
          if (own(patch, 'manifest') && !own(patch, 'entryFile') && own(object(patch.manifest), 'entryFile')) project.entryFile = String(object(patch.manifest).entryFile)
        } else {
          const inputs = method === 'writeFile' ? [{ path: p.path ?? project.entryFile, content: p.content, encoding: p.encoding ?? 'utf8' }] : p.files ?? []
          const replacements = this.fileInputs(json(inputs))
          if (own(replacements, FRONTEND_MANIFEST_FILE)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `Edit ${FRONTEND_MANIFEST_FILE} through frontends.updateProject manifest`, { field: 'manifest' })
          Object.assign(files, replacements)
          Object.keys(replacements).forEach(name => names.add(name))
          if (method === 'replaceFiles') {
            if (p.deletePaths !== undefined && !Array.isArray(p.deletePaths)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'deletePaths must be an array', { field: 'deletePaths' })
            for (const raw of (p.deletePaths || []) as FrontendValue[]) {
              const name = this.name(raw)
              if (own(replacements, name)) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, `Cannot replace and delete the same frontend file: ${name}`, { field: 'replacements' })
              if (!names.has(name)) throw new DesktopError(ELECKOI_FAILURE_CODES.lookupNotFound, `Frontend resource does not exist: ${project.id}/${name}`, { what: '前端资源' })
              if (name === FRONTEND_MANIFEST_FILE) throw new DesktopError(ELECKOI_FAILURE_CODES.safetyRefused, 'Frontend manifest cannot be deleted', { guard: '前端清单' })
              names.delete(name); deleted.push(name)
            }
            rawManifest = { ...rawManifest, ...object(p.manifest) }
            if (p.entryFile !== undefined) project.entryFile = this.name(p.entryFile)
            else if (own(object(p.manifest), 'entryFile')) project.entryFile = this.name(object(p.manifest).entryFile)
          }
        }
        if (typeof project.name !== 'string' || !project.name.trim()) throw new DesktopError(ELECKOI_FAILURE_CODES.inputInvalid, 'Frontend project name must be nonempty', { field: 'name' })
        project.files = [...names].sort()
        project.manifest = this.manifest(rawManifest, owner.scope, names, project.entryFile)
        project.updatedAt = new Date().toISOString()
        this.commit(project, files, owner, false, deleted)
      }
    }
    const workspace = this.workspaceOf(owner)
    return workspace
  }
}
