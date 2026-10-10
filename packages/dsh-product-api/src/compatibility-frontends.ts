import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { Unzip, UnzipInflate, Zip, ZipDeflate } from 'fflate'
import type { CompatibilityChange, CompatibilityValue, ElecKoiProductDataStore } from './types.js'
import type { CompatibilityHandler } from './compatibility-catalog.js'
import { FRONTEND_MANIFEST_FILE } from './frontend-project-types.js'
import type { FrontendScope, FrontendProject, FrontendManifest } from './frontend-project-types.js'
export type { FrontendProject } from './frontend-project-types.js'

type Document = { [key: string]: CompatibilityValue }
type Owner = { scope: FrontendScope; characterId?: string; settingsScope: string; key: string }
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
  if (!completed) throw new Error('Frontend ZIP export did not finish')
  return Buffer.concat(chunks)
}
const PROJECTS = 'frontend-projects', SETTINGS = 'frontend-settings', APPLICATION_SETTINGS = 'frontend-application-settings'
export const FRONTEND_COMPATIBILITY_METHODS = ['frontends.workspace', 'frontends.import', 'frontends.select',
  'frontends.delete', 'frontends.readFile', 'frontends.writeFile', 'frontends.export', 'frontends.setMessageRenderer',
  'frontends.updateProject', 'frontends.replaceFiles', 'frontends.restoreDefault'] as const
const object = (value: CompatibilityValue | undefined): Document => {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Expected a frontend object')
  return value
}
const json = (value: unknown) => value as CompatibilityValue
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key)
const mimeTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4' }

/** Same registry, resource route and domain service. No application chat is fabricated. */
export class CompatibilityFrontendOperations {
  readonly handlers: ReadonlyMap<string, CompatibilityHandler>
  readonly root: string
  constructor(private readonly data: ElecKoiProductDataStore, private readonly publish: (change: CompatibilityChange) => void) {
    this.root = join(data.compatibilityStore().root, 'frontends')
    this.handlers = new Map(FRONTEND_COMPATIBILITY_METHODS.map(method => [method, p => this.invoke(method, p)]))
  }
  private character(p: Document) {
    const id = String(p.characterId || (p.conversationId ? this.data.readConversationDetails(String(p.conversationId)).metadata.characterId
      : this.data.readCharacters().active_character_id) || '')
    if (!id) throw new Error('Frontend operation requires a character')
    if (!this.data.readCharacters().items.some(character => character.id === id)) throw new Error(`Character does not exist: ${id}`)
    return id
  }
  private owner(p: Document): Owner {
    if (p.scope === 'application') return { scope: 'application', settingsScope: APPLICATION_SETTINGS, key: 'application' }
    if (p.scope !== undefined && p.scope !== 'character') throw new TypeError(`Unknown frontend scope: ${String(p.scope)}`)
    const characterId = this.character(p)
    return { scope: 'character', characterId, settingsScope: SETTINGS, key: characterId }
  }
  private project(id: string): FrontendProject {
    // Existing migrated IDs stay untouched; validate their directory before any access.
    if (!id || id === '.' || id === '..' || /[\\/\0]/.test(id)) throw new TypeError(`Invalid frontend project id: ${id}`)
    const value = this.data.compatibilityStore().get(PROJECTS, id)
    if (!value) throw new Error(`Frontend project does not exist: ${id}`)
    return structuredClone(object(value)) as unknown as FrontendProject
  }
  private belongs(project: FrontendProject, owner: Owner) {
    return (project.scope || 'character') === owner.scope
      && (owner.scope === 'application' || project.characterId === owner.characterId)
  }
  private owned(id: string, owner: Owner) {
    const project = this.project(id)
    if (!this.belongs(project, owner)) throw new Error(owner.scope === 'character'
      ? 'Frontend project belongs to another character or scope' : 'Frontend project belongs to another scope')
    return project
  }
  private name(value: unknown) {
    if (typeof value !== 'string') throw new TypeError('Frontend file path must be a string')
    const name = value.replaceAll('\\', '/')
    if (!name || name.startsWith('/') || name.includes(':') || name.includes('\0')
      || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Invalid frontend file path: ${name}`)
    return name
  }
  private path(id: string, name: string) {
    const root = resolve(this.root, id), path = resolve(root, this.name(name))
    if (!path.startsWith(root + sep)) throw new Error(`Frontend path is outside its project: ${name}`)
    return path
  }
  private workspaceOf(owner: Owner): Document {
    const store = this.data.compatibilityStore(), settings = object(store.get(owner.settingsScope, owner.key))
    const projects = Object.values(store.list(PROJECTS)).filter(value => this.belongs(object(value) as unknown as FrontendProject, owner))
    const selectedProjectId = settings.selectedProjectId ?? null
    const selected = projects.find(value => object(value).id === selectedProjectId)
    return { scope: owner.scope, ...(owner.characterId ? { characterId: owner.characterId } : {}), projects,
      selectedProjectId, messageRendererEnabled: settings.messageRendererEnabled !== false,
      activeBindings: selected ? object(object(selected).manifest).bindings || [] : [], revision: settings.revision ?? 0 }
  }
  /** Original public helper still accepts the original character id. */
  workspace(characterId: string): Document {
    return this.workspaceOf({ scope: 'character', characterId, settingsScope: SETTINGS, key: characterId })
  }
  readAsset(id: string, name: string) {
    const project = this.project(id)
    if (!project.files.includes(name)) throw new Error(`Frontend resource does not exist: ${id}/${name}`)
    const body = readFileSync(this.path(id, name))
    return { body, mimeType: mimeTypes[extname(name).toLowerCase()] || 'application/octet-stream' }
  }
  hasAsset(id: string, name: string): boolean {
    const value = this.data.compatibilityStore().get(PROJECTS, id)
    return value !== null && Array.isArray(object(value).files) && (object(value).files as CompatibilityValue[]).includes(name)
  }
  private readFiles(project: FrontendProject): Files {
    return Object.fromEntries(project.files.map(name => [name, this.readAsset(project.id, name).body]))
  }
  private fileInputs(input: CompatibilityValue | undefined): Files {
    if (!Array.isArray(input)) throw new TypeError('Frontend files must be an array')
    const files: Files = Object.create(null)
    for (const raw of input) {
      const file = object(raw), name = this.name(file.path ?? file.name)
      if (own(files, name)) throw new Error(`Duplicate frontend file: ${name}`)
      if (file.encoding !== undefined && !['utf8', 'base64'].includes(String(file.encoding))) throw new TypeError(`Unknown file encoding: ${file.encoding}`)
      if (typeof file.content !== 'string') throw new TypeError(`Frontend file content must be a string: ${name}`)
      files[name] = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8')
    }
    return files
  }
  private unzipFiles(bytes: Uint8Array): Files {
    const files: Files = Object.create(null), names = new Set<string>()
    const archive = new Unzip(file => {
      if (file.name.endsWith('/')) return
      const name = this.name(file.name)
      if (names.has(name)) throw new Error(`Duplicate frontend archive file: ${name}`)
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
    if (Object.keys(files).length !== names.size) throw new Error('Frontend ZIP import did not finish')
    return files
  }
  private archiveManifest(files: Files): Document | undefined {
    if (!own(files, FRONTEND_MANIFEST_FILE)) return undefined
    try { return object(JSON.parse(Buffer.from(files[FRONTEND_MANIFEST_FILE]!).toString('utf8'))) }
    catch (error) { throw new Error(`Invalid ${FRONTEND_MANIFEST_FILE}: ${error instanceof Error ? error.message : String(error)}`) }
  }
  private manifest(raw: Document, scope: FrontendScope, files: ReadonlySet<string>, entryFile: string): FrontendManifest {
    if (raw.manifestVersion !== undefined && raw.manifestVersion !== 1) throw new Error(`Unsupported frontend manifest version: ${raw.manifestVersion}`)
    if (raw.scope !== undefined && raw.scope !== scope) throw new Error(`Frontend manifest scope ${raw.scope} does not match requested ${scope}`)
    if (raw.sdkVersion !== undefined && (typeof raw.sdkVersion !== 'string' || !raw.sdkVersion)) throw new TypeError('Frontend sdkVersion must be a nonempty string')
    const entry = this.name(entryFile)
    if (!files.has(entry) || !/\.html?$/i.test(entry)) throw new Error(`Frontend HTML entry does not exist: ${entry}`)
    if (raw.globalStyles !== undefined && (!Array.isArray(raw.globalStyles) || raw.globalStyles.some(name => typeof name !== 'string' || !files.has(this.name(name))))) throw new Error('Frontend globalStyles must reference existing project files')
    if (raw.bindings !== undefined) {
      if (!Array.isArray(raw.bindings)) throw new TypeError('Frontend bindings must be an array')
      for (const value of raw.bindings) {
        const binding = object(value)
        if (!['root', 'page', 'slot'].includes(String(binding.target))) throw new Error(`Unknown frontend binding target: ${binding.target}`)
        const bindingEntry = this.name(binding.entryFile)
        if (!files.has(bindingEntry) || !/\.html?$/i.test(bindingEntry)) throw new Error(`Frontend binding entry does not exist: ${bindingEntry}`)
        if (binding.target === 'page' && (typeof binding.pageId !== 'string' || !binding.pageId)) throw new TypeError('Frontend page binding requires pageId')
        if (binding.target === 'slot' && (typeof binding.slot !== 'string' || !binding.slot)) throw new TypeError('Frontend slot binding requires slot')
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
    const store = this.data.compatibilityStore(), previous = object(store.get(owner.settingsScope, owner.key))
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
      this.data.compatibilityStore().atomic(() => {
        this.data.compatibilityStore().put(PROJECTS, project.id, json(project))
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
    catch (error) { throw Object.assign(new Error(`Frontend changes committed, but temporary directory cleanup failed: ${path}`), { code: 'FRONTEND_COMMITTED_CLEANUP_FAILED', cause: error }) }
  }
  invoke(method: string, p: Document): CompatibilityValue {
    if (!(FRONTEND_COMPATIBILITY_METHODS as readonly string[]).includes(method)) throw new Error(`Unknown frontend method: ${method}`)
    const store = this.data.compatibilityStore(), owner = this.owner(p)
    if (method === 'frontends.workspace') return this.workspaceOf(owner)
    if (['frontends.select', 'frontends.restoreDefault', 'frontends.setMessageRenderer'].includes(method)) {
      const patch: Document = {}
      if (method === 'frontends.setMessageRenderer') patch.messageRendererEnabled = p.enabled !== false
      else {
        const id = method === 'frontends.restoreDefault' || p.projectId == null ? null : String(p.projectId)
        if (id) this.owned(id, owner)
        patch.selectedProjectId = id
      }
      store.atomic(() => this.settings(owner, patch))
    } else if (method === 'frontends.import') {
      let files: Files
      if (p.files !== undefined) files = this.fileInputs(p.files)
      else if (/\.zip$/i.test(String(p.filename || ''))) {
        files = this.unzipFiles(Buffer.from(String(p.data || ''), 'base64'))
      } else files = { 'index.html': p.html !== undefined ? Buffer.from(String(p.html), 'utf8') : Buffer.from(String(p.data || ''), 'base64') }
      const archived = this.archiveManifest(files), requested = { ...object(archived?.project), ...object(p.project) }
      const rawManifest = { ...archived, ...object(requested.manifest), ...object(p.manifest) }
      const explicit = p.entryFile ?? requested.entryFile ?? rawManifest.entryFile
      const entry = explicit !== undefined ? this.name(explicit) : own(files, 'index.html') ? 'index.html'
        : Object.keys(files).filter(name => /(^|\/)index\.html?$/i.test(name)).sort((a, b) => a.split('/').length - b.split('/').length)[0]
      if (!entry) throw new Error('前端项目中没有找到 index.html')
      const project = { ...requested, id: randomUUID(), scope: owner.scope,
        name: String(p.name || requested.name || p.filename || 'HTML 前端'), entryFile: entry, files: Object.keys(files).sort(),
        importedAt: new Date().toISOString(), manifest: this.manifest(rawManifest, owner.scope, new Set(Object.keys(files)), entry) } as unknown as FrontendProject
      if (owner.characterId) project.characterId = owner.characterId
      else delete project.characterId
      this.commit(project, files, owner, p.select !== false)
    } else {
      const project = this.owned(String(p.projectId || ''), owner)
      if (method === 'frontends.readFile') {
        if (p.encoding !== undefined && !['utf8', 'base64'].includes(String(p.encoding))) throw new TypeError(`Unknown file encoding: ${p.encoding}`)
        const name = this.name(p.path ?? project.entryFile), asset = this.readAsset(project.id, name)
        return { path: name, content: asset.body.toString(p.encoding === 'base64' ? 'base64' : 'utf8'), mimeType: asset.mimeType }
      }
      if (method === 'frontends.export') {
        const files = this.readFiles(project)
        project.manifest = this.manifest(object(json(project.manifest)), owner.scope, new Set(Object.keys(files)), project.entryFile)
        this.materialize(project, files)
        return { filename: `${project.name}.zip`, data: zipFiles(files).toString('base64'), project: json(project) }
      }
      if (method === 'frontends.delete') {
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
        if (method === 'frontends.updateProject') {
          const patch = object(p.patch)
          for (const key of ['id', 'scope', 'characterId', 'files', 'importedAt']) if (own(patch, key)) throw new Error(`Frontend project field is immutable: ${key}`)
          Object.assign(project, patch)
          rawManifest = { ...rawManifest, ...object(patch.manifest) }
          if (own(patch, 'manifest') && !own(patch, 'entryFile') && own(object(patch.manifest), 'entryFile')) project.entryFile = String(object(patch.manifest).entryFile)
        } else {
          const inputs = method === 'frontends.writeFile' ? [{ path: p.path ?? project.entryFile, content: p.content, encoding: p.encoding ?? 'utf8' }] : p.files ?? []
          const replacements = this.fileInputs(json(inputs))
          if (own(replacements, FRONTEND_MANIFEST_FILE)) throw new Error(`Edit ${FRONTEND_MANIFEST_FILE} through frontends.updateProject manifest`)
          Object.assign(files, replacements)
          Object.keys(replacements).forEach(name => names.add(name))
          if (method === 'frontends.replaceFiles') {
            if (p.deletePaths !== undefined && !Array.isArray(p.deletePaths)) throw new TypeError('deletePaths must be an array')
            for (const raw of (p.deletePaths || []) as CompatibilityValue[]) {
              const name = this.name(raw)
              if (own(replacements, name)) throw new Error(`Cannot replace and delete the same frontend file: ${name}`)
              if (!names.has(name)) throw new Error(`Frontend resource does not exist: ${project.id}/${name}`)
              if (name === FRONTEND_MANIFEST_FILE) throw new Error('Frontend manifest cannot be deleted')
              names.delete(name); deleted.push(name)
            }
            rawManifest = { ...rawManifest, ...object(p.manifest) }
            if (p.entryFile !== undefined) project.entryFile = this.name(p.entryFile)
            else if (own(object(p.manifest), 'entryFile')) project.entryFile = this.name(object(p.manifest).entryFile)
          }
        }
        if (typeof project.name !== 'string' || !project.name.trim()) throw new TypeError('Frontend project name must be nonempty')
        project.files = [...names].sort()
        project.manifest = this.manifest(rawManifest, owner.scope, names, project.entryFile)
        project.updatedAt = new Date().toISOString()
        this.commit(project, files, owner, false, deleted)
      }
    }
    const workspace = this.workspaceOf(owner)
    this.publish({ event: 'frontends.changed', payload: { scope: owner.scope,
      ...(owner.characterId ? { characterId: owner.characterId } : {}), workspace } })
    return workspace
  }
}
