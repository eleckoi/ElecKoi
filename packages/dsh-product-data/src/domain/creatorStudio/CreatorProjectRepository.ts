import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { isAbsolute, join, parse, relative, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  creatorProjectCollectionSchema,
  creatorProjectSchema,
  type CreatorProject,
  type CreatorProjectCollection,
  type CreatorProjectMode
} from '@shared/contracts/creatorStudio/schemas'
import { DESKTOP_ERROR_CODES, DesktopError } from '@shared/foundation/DesktopError'

const INDEX_VERSION = 1
const MANIFEST_FILE = 'project.eleckoi.json'
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

interface CreatorProjectIndex {
  version: number
  items: CreatorProject[]
}

interface CreateCreatorProjectInput {
  name: string
  mode: CreatorProjectMode
  parentDirectory: string
  sourceCharacterId?: string
  coverImage?: string
}

export class CreatorProjectRepository {
  private readonly indexDirectory: string
  private readonly indexPath: string

  constructor(workspacePath: string) {
    this.indexDirectory = join(workspacePath, 'creator-studio')
    this.indexPath = join(this.indexDirectory, 'projects.json')
  }

  list(): CreatorProjectCollection {
    const index = this.readIndex()
    return creatorProjectCollectionSchema.parse({
      items: index.items
        .filter((project) => existsSync(join(project.rootPath, MANIFEST_FILE)))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    })
  }

  require(projectId: string): CreatorProject {
    const project = this.list().items.find((item) => item.id === projectId)
    if (project === undefined) {
      throw new DesktopError(DESKTOP_ERROR_CODES.NOT_FOUND, '找不到对应的创作项目。')
    }
    return project
  }

  create(input: CreateCreatorProjectInput): CreatorProjectCollection {
    const name = input.name.trim()
    const parentDirectory = resolve(input.parentDirectory.trim())
    if (!name) throw new DesktopError(DESKTOP_ERROR_CODES.INVALID_REQUEST, '请输入项目名称。')
    if (!isAbsolute(parentDirectory)) {
      throw new DesktopError(DESKTOP_ERROR_CODES.INVALID_REQUEST, '请选择有效的项目保存位置。')
    }
    if (input.mode === 'existing' && !input.sourceCharacterId?.trim()) {
      throw new DesktopError(DESKTOP_ERROR_CODES.INVALID_REQUEST, '请选择要修改的角色。')
    }

    const directoryName = safeDirectoryName(name)
    const rootPath = resolve(parentDirectory, directoryName)
    const relativeRoot = relative(parentDirectory, rootPath)
    if (!relativeRoot || relativeRoot.startsWith('..') || isAbsolute(relativeRoot)) {
      throw new DesktopError(DESKTOP_ERROR_CODES.INVALID_REQUEST, '项目名称无法用于本地目录。')
    }
    if (existsSync(rootPath)) {
      throw new DesktopError(DESKTOP_ERROR_CODES.CONFLICT, `保存位置已存在同名目录：${directoryName}`)
    }

    const now = new Date().toISOString()
    const project = creatorProjectSchema.parse({
      id: randomUUID(),
      name,
      mode: input.mode,
      rootPath,
      sourceCharacterId: input.sourceCharacterId?.trim() ?? '',
      coverImage: input.coverImage?.trim() ?? '',
      createdAt: now,
      updatedAt: now
    })
    const manifest = {
      schemaVersion: 1,
      kind: 'eleckoi-character-project',
      ...project
    }

    mkdirSync(rootPath, { recursive: false })
    try {
      writeFileSync(join(rootPath, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      const current = this.readIndex()
      this.writeIndex({ version: INDEX_VERSION, items: [project, ...current.items] })
    } catch (error) {
      rmSync(rootPath, { recursive: true, force: true })
      throw error
    }
    return this.list()
  }

  /** Register an already restored project through the same official catalog/manifest boundary.
   * The importer owns copying source bytes; this service owns only project registration. */
  adopt(input: CreatorProject, extension: Record<string, unknown> = {}, conflicts: 'fail' | 'replace' = 'fail'): CreatorProjectCollection {
    const project = creatorProjectSchema.parse({ ...input, rootPath: resolve(input.rootPath) })
    if (!isAbsolute(input.rootPath) || project.rootPath === parse(project.rootPath).root || !existsSync(project.rootPath)) {
      throw new DesktopError(DESKTOP_ERROR_CODES.INVALID_REQUEST, '恢复的创作项目目录不存在或无效。')
    }
    const current = this.readIndex(), previous = current.items.find(item => item.id === project.id)
    if (previous && JSON.stringify(previous) !== JSON.stringify(project) && conflicts !== 'replace') {
      throw new DesktopError(DESKTOP_ERROR_CODES.CONFLICT, `创作项目编号冲突：${project.id}`)
    }
    const path = join(project.rootPath, MANIFEST_FILE), original = existsSync(path) ? readFileSync(path) : undefined
    if (original && !previous) {
      const manifest = JSON.parse(original.toString('utf8')) as Record<string, unknown>
      if (manifest.id !== project.id || manifest.kind !== 'eleckoi-character-project') {
        throw new DesktopError(DESKTOP_ERROR_CODES.CONFLICT, '目标目录已包含其他创作项目。')
      }
    }
    try {
      writeFileSync(`${path}.tmp`, `${JSON.stringify({ ...extension, schemaVersion: 1, kind: 'eleckoi-character-project', ...project }, null, 2)}\n`, 'utf8')
      renameSync(`${path}.tmp`, path)
      this.writeIndex({ version: INDEX_VERSION, items: [...current.items.filter(item => item.id !== project.id), project] })
    } catch (error) {
      if (original) writeFileSync(path, original); else if (existsSync(path)) rmSync(path)
      throw error
    }
    return this.list()
  }

  delete(projectId: string): CreatorProjectCollection {
    const current = this.readIndex()
    const project = current.items.find((item) => item.id === projectId)
    if (project === undefined) {
      throw new DesktopError(DESKTOP_ERROR_CODES.NOT_FOUND, '找不到对应的创作项目。')
    }

    const rootPath = this.requireOwnedProjectDirectory(project)
    try {
      rmSync(rootPath, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 })
    } catch {
      throw new DesktopError(DESKTOP_ERROR_CODES.INTERNAL, '本地项目文件删除失败，请关闭占用该目录的程序后重试。')
    }

    const remaining = current.items.filter((project) => project.id !== projectId)
    this.writeIndex({ version: INDEX_VERSION, items: remaining })
    return this.list()
  }

  private requireOwnedProjectDirectory(project: CreatorProject): string {
    if (!isAbsolute(project.rootPath)) {
      throw new DesktopError(DESKTOP_ERROR_CODES.INTERNAL, '项目目录无效，为避免误删未执行操作。')
    }
    const rootPath = resolve(project.rootPath)
    if (rootPath === parse(rootPath).root) {
      throw new DesktopError(DESKTOP_ERROR_CODES.INTERNAL, '项目目录无效，为避免误删未执行操作。')
    }

    try {
      const manifest = JSON.parse(readFileSync(join(rootPath, MANIFEST_FILE), 'utf8')) as Record<string, unknown>
      if (
        manifest.kind !== 'eleckoi-character-project'
        || manifest.id !== project.id
        || typeof manifest.rootPath !== 'string'
        || resolve(manifest.rootPath) !== rootPath
      ) {
        throw new Error('Project manifest does not match the index entry.')
      }
    } catch {
      throw new DesktopError(DESKTOP_ERROR_CODES.INTERNAL, '项目清单校验失败，为避免误删未执行操作。')
    }
    return rootPath
  }

  private readIndex(): CreatorProjectIndex {
    if (!existsSync(this.indexPath)) return { version: INDEX_VERSION, items: [] }
    try {
      const value = JSON.parse(readFileSync(this.indexPath, 'utf8')) as unknown
      const parsed = creatorProjectCollectionSchema.parse(value)
      return { version: INDEX_VERSION, items: parsed.items }
    } catch {
      throw new DesktopError(DESKTOP_ERROR_CODES.INTERNAL, '创作项目索引损坏，无法读取。')
    }
  }

  private writeIndex(index: CreatorProjectIndex): void {
    mkdirSync(this.indexDirectory, { recursive: true })
    const temporaryPath = `${this.indexPath}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
    renameSync(temporaryPath, this.indexPath)
  }
}

function safeDirectoryName(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
  if (!sanitized || WINDOWS_RESERVED_NAME.test(sanitized)) {
    throw new DesktopError(DESKTOP_ERROR_CODES.INVALID_REQUEST, '项目名称无法用于本地目录。')
  }
  return sanitized.slice(0, 80)
}
