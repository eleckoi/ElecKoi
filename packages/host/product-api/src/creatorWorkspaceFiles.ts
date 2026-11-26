import { constants } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, readdir, realpath, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { Zip, ZipPassThrough } from 'fflate'
import { sessionFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import { ELECKOI_FAILURE_CODES as codes } from './errorCodes.generated.js'
import { productFailure } from './productFailure.js'
import type { CreatorWorkspaceDirectory, WorkspaceFileEdit, WorkspaceFileEntry, WorkspaceFileExport, WorkspaceFileImport, WorkspaceFileSelection } from './types.js'
export type PublishWorkspaceEntry = (source: string, destination: string) => void

type Info = Awaited<ReturnType<typeof lstat>>
const chunkBytes = 64 * 1024
const zip32Max = 0xffff_ffff
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT'
const versionOf = (info: Info) => `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`
const sameEntry = (left: Info, right: Info) => left.dev === right.dev && left.ino === right.ino
const kindOf = (info: Info): WorkspaceFileEntry['kind'] => info.isDirectory() ? 'directory' : info.isFile() ? 'file' : 'other'

function nameOf(value: string): string {
  if (!value || value === '.' || value === '..' || /[\\/\u0000]/.test(value)) {
    throw productFailure(codes.inputInvalid, '工作区名称必须是单个路径分量。', { field: '名称' })
  }
  return value
}

function within(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path)
}

function unauthorized() {
  return productFailure(codes.securityDenied, '路径不属于当前安卓工作区，或其中包含链接。', { guard: '当前工作区', what: '工作区文件' })
}

function ioFailure(error: unknown, operation: string, path: string) {
  if ((error as { isDSHRemoteError?: boolean })?.isDSHRemoteError || (error as NodeJS.ErrnoException)?.code?.startsWith('eleckoi/')) return error
  switch ((error as NodeJS.ErrnoException)?.code) {
    case 'ENOENT': return productFailure(codes.lookupNotFound, String(error), { what: path })
    case 'EEXIST': return productFailure(codes.lookupDuplicate, String(error), { what: '工作区文件', path })
    case 'ELOOP': return unauthorized()
    default: return productFailure(codes.ioFailed, String(error), { operation, path })
  }
}

async function isPresent(path: string): Promise<boolean> {
  return lstat(path).then(() => true, error => { if (missing(error)) return false; throw error })
}

function zipSizeError() {
  return productFailure(codes.inputUnsupported, '选中文件超出 ZIP 格式可表示的大小或条目数。', { what: 'ZIP 导出', expected: '标准 ZIP' })
}

/** The user operates on disk entries in a DSH Session's Android workspace. */
export class CreatorWorkspaceFiles {
  private writeTail: Promise<void> = Promise.resolve()
  constructor(private readonly workspaceHome: string, private readonly publish: PublishWorkspaceEntry) {}

  private async root({ cwd, registeredPath }: CreatorWorkspaceDirectory): Promise<string> {
    if (!isAbsolute(cwd)) throw unauthorized()
    const [home, root] = await Promise.all([realpath(this.workspaceHome), realpath(cwd)])
    if (!(await lstat(root)).isDirectory()) throw unauthorized()
    if (!within(home, root)) {
      // A selected workspace can live outside the default directory. The DSH
      // registry must attach this exact directory to the Session.
      if (!registeredPath || !isAbsolute(registeredPath) || within(root, home)
        || !(await lstat(registeredPath)).isDirectory() || await realpath(registeredPath) !== root) throw unauthorized()
    }
    return root
  }

  private async directory(root: string, path: string[]): Promise<string> {
    let current = root
    for (const part of path) {
      current = join(current, nameOf(part))
      if (!(await lstat(current)).isDirectory() || await realpath(current) !== current) throw unauthorized()
    }
    if (await realpath(current) !== current) throw unauthorized()
    return current
  }

  private exclusive<T>(run: () => Promise<T>): Promise<T> {
    const settled = this.writeTail.then(run)
    this.writeTail = settled.then(() => undefined, () => undefined)
    return settled
  }

  private async selected(directory: string, entries: WorkspaceFileSelection[]) {
    if (!entries.length || new Set(entries.map(entry => entry.name)).size !== entries.length) {
      throw productFailure(codes.inputInvalid, '没有有效的工作区选择。', { field: '选中文件' })
    }
    return Promise.all(entries.map(async entry => {
      const path = join(directory, nameOf(entry.name))
      const info = await lstat(path)
      if (versionOf(info) !== entry.version) {
        throw productFailure(codes.conflictStaleRevision, '工作区条目在选择后发生变化。', { what: entry.name })
      }
      if (kindOf(info) === 'other' || await realpath(path) !== path) throw unauthorized()
      return { path, info, name: entry.name }
    }))
  }

  async list(workspace: CreatorWorkspaceDirectory, path: string[], signal: AbortSignal, sessionId: string): Promise<{ name: string; entries: WorkspaceFileEntry[] }> {
    try {
      const root = await this.root(workspace)
      const directory = await this.directory(root, path)
      const result: WorkspaceFileEntry[] = []
      for (const name of await readdir(directory)) {
        signal.throwIfAborted()
        const info = await lstat(join(directory, name)).catch(error => { if (missing(error)) return undefined; throw error })
        if (!info) continue
        const kind = kindOf(info)
        result.push({ name, kind, bytes: Number(info.size), modifiedAt: Number(info.mtimeMs), version: versionOf(info),
          ...(kind === 'file' ? { address: sessionFileAddress(sessionId, [...path, name].join('/')) } : {}) })
      }
      return { name: basename(root), entries: result }
    } catch (error) { signal.throwIfAborted(); throw ioFailure(error, '读取工作区文件夹', path.join('/')) }
  }

  private async *walk(path: string, name: string, signal: AbortSignal): AsyncIterable<{ path: string; name: string; info: Info }> {
    signal.throwIfAborted()
    const info = await lstat(path)
    if (kindOf(info) === 'other' || await realpath(path) !== path) throw unauthorized()
    yield { path, name, info }
    if (info.isDirectory()) {
      for (const child of await readdir(path)) yield* this.walk(join(path, child), `${name}/${nameOf(child)}`, signal)
    }
  }

  private async *read(path: string, expected: Info, signal: AbortSignal): AsyncIterable<Buffer> {
    if (await realpath(path) !== path) throw unauthorized()
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const changed = () => productFailure(codes.conflictStaleRevision, '工作区文件在传输期间发生变化。', { what: basename(path) })
    try {
      const info = await file.stat()
      if (!info.isFile() || versionOf(info) !== versionOf(expected)) throw changed()
      let total = 0
      for await (const bytes of file.createReadStream({ signal, autoClose: false })) {
        total += bytes.length
        if (total > Number(expected.size)) throw changed()
        yield bytes
      }
      if (total !== Number(expected.size) || versionOf(await file.stat()) !== versionOf(expected)) throw changed()
    } finally { await file.close() }
  }

  async edit(workspace: CreatorWorkspaceDirectory, path: string[], edit: WorkspaceFileEdit, signal: AbortSignal): Promise<void> {
    try {
      const root = await this.root(workspace)
      await this.exclusive(async () => {
        signal.throwIfAborted()
        const directory = await this.directory(root, path)
        if (edit.kind === 'mkdir') { await mkdir(join(directory, nameOf(edit.name))); return }
        if (edit.kind === 'rename') {
          const [entry] = await this.selected(directory, [edit.entry])
          const target = join(directory, nameOf(edit.name))
          signal.throwIfAborted()
          if (entry!.path !== target) this.publish(entry!.path, target)
          return
        }
        const entries = await this.selected(directory, edit.entries)
        const dest = 'destination' in edit ? await this.directory(root, edit.destination) : undefined
        const staging = await mkdtemp(join(tmpdir(), 'eleckoi-workspace-edit-'))
        const rollback: Array<() => void | Promise<void>> = []
        let retainStaging = false
        try {
          const targets = []
          for (const [index, entry] of entries.entries()) {
            if (dest === directory && edit.kind === 'move') continue
            if (dest && entry.info.isDirectory() && within(entry.path, dest)) {
              throw productFailure(codes.inputInvalid, '无法将目录移入自身。', { field: '目标文件夹' })
            }
            const target = dest
              ? join(dest, edit.kind === 'copy' && dest === directory ? await this.copyName(dest, entry.name, entry.info.isDirectory()) : entry.name)
              : join(staging, String(index))
            if (await isPresent(target)) throw productFailure(codes.lookupDuplicate, '目标已存在。', { what: '工作区文件', path: basename(target) })
            targets.push({ entry, target, staged: join(staging, String(index)) })
          }
          for (const { entry, target, staged } of targets) {
            signal.throwIfAborted()
            if (edit.kind === 'copy') {
              for await (const member of this.walk(entry.path, entry.name, signal)) {
                const copy = join(staged, member.name.slice(entry.name.length))
                if (member.info.isDirectory()) await mkdir(copy)
                else {
                  await using file = await open(copy, 'wx', Number(member.info.mode) & 0o777)
                  await pipeline(this.read(member.path, member.info, signal), file.createWriteStream(), { signal })
                }
              }
              this.publish(staged, target)
              rollback.unshift(() => rm(target, { recursive: true }))
            } else {
              this.publish(entry.path, target)
              rollback.unshift(() => this.publish(target, entry.path))
            }
          }
        } catch (error) {
          const failures: unknown[] = []
          for (const undo of rollback) {
            try { await undo() } catch (failure) { failures.push(failure) }
          }
          if (failures.length) {
            retainStaging = true
            throw productFailure(codes.ioFailed, `${String(error)}，部分操作未能恢复：${failures.map(String).join(', ')}`,
              { operation: '恢复工作区文件', path: staging })
          }
          throw error
        } finally {
          if (!retainStaging) await rm(staging, { recursive: true, force: true })
        }
      })
    } catch (error) { signal.throwIfAborted(); throw ioFailure(error, '修改工作区文件', path.join('/')) }
  }

  private async copyName(dir: string, name: string, folder: boolean): Promise<string> {
    const dot = folder ? -1 : name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const extension = dot > 0 ? name.slice(dot) : ''
    let candidate = `${stem} 副本${extension}`
    for (let index = 2; await isPresent(join(dir, candidate)); index++) candidate = `${stem} 副本 ${index}${extension}`
    return candidate
  }

  async *import(workspace: CreatorWorkspaceDirectory, path: string[], name: string, size: number, input: AsyncIterable<string>, signal: AbortSignal): AsyncIterable<WorkspaceFileImport> {
    try {
      const root = await this.root(workspace)
      const directory = await this.directory(root, path)
      const target = join(directory, nameOf(name))
      const directoryInfo = await lstat(directory)
      if (!Number.isSafeInteger(size) || size < 0) throw productFailure(codes.inputInvalid, '导入字节数无效。', { field: '文件大小' })
      if (await isPresent(target)) throw productFailure(codes.lookupDuplicate, '导入目标已存在。', { what: '工作区文件', path: name })
      const staging = await mkdtemp(join(tmpdir(), 'eleckoi-workspace-import-'))
      const file = join(staging, 'payload')
      try {
        let offset = 0
        const handle = await open(file, 'wx')
        try {
          yield { kind: 'ready', offset }
          for await (const data of input) {
            signal.throwIfAborted()
            const bytes = Buffer.from(data, 'base64')
            if (!bytes.length || bytes.toString('base64') !== data || offset + bytes.length > size) {
              throw productFailure(codes.inputInvalid, '导入数据不符合声明的长度或编码。', { field: '文件内容' })
            }
            await handle.writeFile(bytes)
            offset += bytes.length
            yield { kind: 'ready', offset }
          }
          signal.throwIfAborted()
          if (offset !== size) throw productFailure(codes.inputInvalid, '导入数据没有达到声明的长度。', { field: '文件大小' })
          await handle.sync()
        } finally { await handle.close() }
        await this.exclusive(async () => {
          const current = await this.directory(root, path)
          if (!sameEntry(directoryInfo, await lstat(current))) {
            throw productFailure(codes.conflictStaleRevision, '导入过程中目标文件夹发生变化。', { what: '目标文件夹' })
          }
          signal.throwIfAborted()
          this.publish(file, target)
        })
        yield { kind: 'complete' }
      } finally { await rm(staging, { recursive: true, force: true }) }
    } catch (error) { signal.throwIfAborted(); throw ioFailure(error, '从手机导入工作区', name) }
  }

  async *export(workspace: CreatorWorkspaceDirectory, path: string[], selection: WorkspaceFileSelection[], signal: AbortSignal): AsyncIterable<WorkspaceFileExport> {
    try {
      const root = await this.root(workspace)
      const directory = await this.directory(root, path)
      const entries = await this.selected(directory, selection)
      const [first] = entries
      if (entries.length === 1 && first!.info.isFile()) {
        yield { kind: 'file', name: first!.name, mime: 'application/octet-stream' }
        for await (const bytes of this.read(first!.path, first!.info, signal)) {
          yield { kind: 'chunk', data: bytes.toString('base64') }
        }
        return
      }
      yield { kind: 'file', name: entries.length === 1 ? `${first!.name}.zip` : '工作区文件.zip', mime: 'application/zip' }
      const pending: Uint8Array[] = []
      let total = 0
      let members = 0
      const zip = new Zip((error, bytes) => {
        if (error) throw error
        total += bytes.length
        if (total >= zip32Max) throw zipSizeError()
        pending.push(bytes)
      })
      function* chunks(): Iterable<WorkspaceFileExport> {
        for (const bytes of pending.splice(0)) {
          for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
            yield { kind: 'chunk', data: Buffer.from(bytes.subarray(offset, offset + chunkBytes)).toString('base64') }
          }
        }
      }
      try {
        for (const entry of entries) {
          for await (const member of this.walk(entry.path, entry.name, signal)) {
            if (++members >= 0xffff || Number(member.info.size) >= zip32Max) throw zipSizeError()
            const directory = member.info.isDirectory()
            const item = new ZipPassThrough(member.name + (directory ? '/' : ''))
            zip.add(item)
            if (!directory) {
              for await (const bytes of this.read(member.path, member.info, signal)) {
                item.push(bytes)
                yield* chunks()
              }
            }
            item.push(new Uint8Array(), true)
            yield* chunks()
          }
        }
        zip.end()
        yield* chunks()
      } finally { zip.terminate() }
    } catch (error) { signal.throwIfAborted(); throw ioFailure(error, '导出工作区文件', path.join('/')) }
  }
}
