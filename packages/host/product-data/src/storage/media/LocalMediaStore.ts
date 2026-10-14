import { createHash, randomUUID } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { Transform, type TransformCallback } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { join, resolve, sep } from 'node:path'
import { LOCAL_MEDIA_SCHEME } from '@shared/foundation/mediaReference'

const REFERENCE_PREFIX = `${LOCAL_MEDIA_SCHEME}://asset/v1/`
const MAX_IMAGE_BYTES = 64 * 1024 * 1024
const HASH_PATTERN = /^[a-f0-9]{64}$/
const SLOT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const FILE_PATTERN = /^([a-f0-9]{64})\.(png|jpg|webp|gif|mp4|webm|mov|ogv)$/
const IMAGE_FILE_PATTERN = /^([a-f0-9]{64})\.(png|jpg|webp|gif)$/

const IMAGE_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
])
const MEDIA_TYPES = new Map([
  ...IMAGE_TYPES,
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['video/quicktime', 'mov'],
  ['video/ogg', 'ogv']
])

export interface PreparedLocalMedia {
  readonly reference: string
  commit(): void
  rollback(): void
}

export function resolveLocalMediaPath(rootDirectory: string, reference: string): string | undefined {
  if (!reference.startsWith(REFERENCE_PREFIX)) return undefined
  let url: URL
  try {
    url = new URL(reference)
  } catch {
    return undefined
  }
  if (url.protocol !== `${LOCAL_MEDIA_SCHEME}:` || url.hostname !== 'asset' || url.search || url.hash) return undefined
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length !== 4 || parts[0] !== 'v1') return undefined
  const [, ownerHash, slot, fileName] = parts
  if (!ownerHash || !HASH_PATTERN.test(ownerHash) || !slot || !SLOT_PATTERN.test(slot) || !fileName || !FILE_PATTERN.test(fileName)) return undefined
  const versionRoot = resolve(rootDirectory, 'v1')
  const candidate = resolve(versionRoot, ownerHash, slot, fileName)
  return candidate.startsWith(`${versionRoot}${sep}`) ? candidate : undefined
}

interface DecodedImage {
  bytes: Buffer
  extension: string
}
export interface PreparedMediaBytes extends PreparedLocalMedia {
  readonly mediaType: string
  readonly byteLength: number
}

export class LocalMediaStore {
  constructor(private readonly root: string) {
    mkdirSync(this.versionRoot(), { recursive: true })
  }

  prepareImage(owner: string, slot: string, value: string): PreparedLocalMedia {
    const normalized = typeof value === 'string' ? value.trim() : ''
    const ownerHash = this.ownerHash(owner)
    this.assertSlot(slot)

    const existingPath = this.pathForReference(normalized)
    if (existingPath && !IMAGE_FILE_PATTERN.test(existingPath.split(/[\\/]/).at(-1) ?? '')) {
      throw new TypeError('图片槽位不能引用视频媒体。')
    }
    if (existingPath && this.referenceMatchesOwnerSlot(normalized, ownerHash, slot)) {
      const fileName = existingPath.split(/[\\/]/).at(-1) ?? ''
      return this.prepared(normalized, ownerHash, slot, fileName, false)
    }
    const decoded = normalized.startsWith('data:')
      ? decodeMediaDataUrl(normalized, IMAGE_TYPES, MAX_IMAGE_BYTES, '图片')
      : existingPath
        ? decodeStoredImage(existingPath)
        : undefined

    if (!decoded) {
      return this.prepared(normalized, ownerHash, slot, '', false)
    }

    const contentHash = createHash('sha256').update(decoded.bytes).digest('hex')
    const fileName = `${contentHash}.${decoded.extension}`
    const directory = this.slotDirectory(ownerHash, slot)
    const target = join(directory, fileName)
    mkdirSync(directory, { recursive: true })
    let created = false
    if (!existsSync(target)) {
      const temporary = join(directory, `.${fileName}.${randomUUID()}.tmp`)
      writeFileSync(temporary, decoded.bytes, { flag: 'wx' })
      try {
        renameSync(temporary, target)
        created = true
      } finally {
        rmSync(temporary, { force: true })
      }
    }
    const reference = `${REFERENCE_PREFIX}${ownerHash}/${slot}/${fileName}`
    return this.prepared(reference, ownerHash, slot, fileName, created)
  }

  /** Store binary image/video data in the shared media root; metadata references stay in SQLite. */
  async prepareBytes(owner: string, slot: string, bytes: Uint8Array, mediaType: string, signal?: AbortSignal): Promise<PreparedMediaBytes> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new TypeError('媒体数据为空。')
    const source = async function* () { yield bytes }
    return this.prepareStream(owner, slot, source(), mediaType, signal)
  }

  /** Download incrementally; only the final content hash and reference enter the native catalog. */
  async prepareStream(owner: string, slot: string, source: AsyncIterable<Uint8Array>, mediaType: string, signal?: AbortSignal): Promise<PreparedMediaBytes> {
    const normalizedType = mediaType.split(';', 1)[0]!.trim().toLowerCase()
    const extension = MEDIA_TYPES.get(normalizedType)
    if (!extension) throw new TypeError(`不支持的媒体类型：${normalizedType}`)
    const ownerHash = this.ownerHash(owner)
    this.assertSlot(slot)
    const directory = this.slotDirectory(ownerHash, slot)
    signal?.throwIfAborted()
    await mkdir(directory, { recursive: true })
    const temporary = join(directory, `.import-${randomUUID()}.tmp`), hash = createHash('sha256')
    let byteLength = 0, created = false, target: string | undefined
    const measure = new Transform({ transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
      byteLength += chunk.byteLength; hash.update(chunk); callback(null, chunk)
    } })
    try {
      await pipeline(source, measure, createWriteStream(temporary, { flags: 'wx' }), { signal })
      signal?.throwIfAborted()
      if (!byteLength) throw new TypeError('媒体数据为空。')
      const fileName = `${hash.digest('hex')}.${extension}`
      target = join(directory, fileName)
      if (!existsSync(target)) { await rename(temporary, target); created = true }
      signal?.throwIfAborted()
      const reference = `${REFERENCE_PREFIX}${ownerHash}/${slot}/${fileName}`
      return Object.assign(this.prepared(reference, ownerHash, slot, fileName, created), { mediaType: normalizedType, byteLength })
    } catch (error) {
      if (created && target) await rm(target, { force: true })
      throw error
    } finally { await rm(temporary, { force: true }) }
  }

  pathForReference(reference: string): string | undefined {
    return resolveLocalMediaPath(this.root, reference)
  }

  removeOwner(owner: string): void {
    const target = resolve(this.versionRoot(), this.ownerHash(owner))
    const root = `${resolve(this.versionRoot())}${sep}`
    if (!target.startsWith(root)) throw new Error('本地媒体目录越界。')
    rmSync(target, { recursive: true, force: true })
  }

  private prepared(reference: string, ownerHash: string, slot: string, fileName: string, created: boolean): PreparedLocalMedia {
    let settled = false
    return {
      reference,
      commit: () => {
        if (settled) return
        settled = true
        this.cleanupSlot(ownerHash, slot, fileName)
      },
      rollback: () => {
        if (settled) return
        settled = true
        if (!created || !fileName) return
        rmSync(join(this.slotDirectory(ownerHash, slot), fileName), { force: true })
      }
    }
  }

  private cleanupSlot(ownerHash: string, slot: string, keepFileName: string): void {
    const directory = this.slotDirectory(ownerHash, slot)
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name === keepFileName) continue
      if (FILE_PATTERN.test(entry.name) || entry.name.startsWith('.')) rmSync(join(directory, entry.name), { force: true })
    }
  }

  private referenceMatchesOwnerSlot(reference: string, ownerHash: string, slot: string): boolean {
    return reference.startsWith(`${REFERENCE_PREFIX}${ownerHash}/${slot}/`)
  }

  private ownerHash(owner: string): string {
    if (!owner.trim()) throw new Error('本地媒体必须有归属。')
    return createHash('sha256').update(owner).digest('hex')
  }

  private assertSlot(slot: string): void {
    if (!SLOT_PATTERN.test(slot)) throw new Error('本地媒体槽位无效。')
  }

  private versionRoot(): string {
    return join(this.root, 'v1')
  }

  private slotDirectory(ownerHash: string, slot: string): string {
    return join(this.versionRoot(), ownerHash, slot)
  }
}

function decodeMediaDataUrl(value: string, types: Map<string, string>, maxBytes: number, label: string): DecodedImage {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(value)
  if (!match) throw new Error(`${label}数据格式无效。`)
  const mediaType = match[1]!.toLowerCase()
  const extension = types.get(mediaType)
  if (!extension) throw new Error(`不支持的${label}类型：${mediaType}`)
  const encoded = match[2]!.replace(/\s+/g, '')
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new Error(`${label}数据无效或超过限制。`)
  }
  return { bytes, extension }
}

function decodeStoredImage(path: string): DecodedImage {
  const match = IMAGE_FILE_PATTERN.exec(path.split(/[\\/]/).at(-1) ?? '')
  if (!match) throw new Error('本地媒体引用无效。')
  return { bytes: readFileSync(path), extension: match[2]! }
}
