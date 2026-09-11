import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'

export const LOCAL_MEDIA_SCHEME = 'eleckoi-media'
const REFERENCE_PREFIX = `${LOCAL_MEDIA_SCHEME}://asset/v1/`
const MAX_IMAGE_BYTES = 64 * 1024 * 1024
const HASH_PATTERN = /^[a-f0-9]{64}$/
const SLOT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const FILE_PATTERN = /^([a-f0-9]{64})\.(png|jpg|webp|gif)$/

const IMAGE_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif']
])

export interface PreparedLocalMedia {
  readonly reference: string
  commit(): void
  rollback(): void
}

interface DecodedImage {
  bytes: Buffer
  extension: string
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
    if (existingPath && this.referenceMatchesOwnerSlot(normalized, ownerHash, slot)) {
      const fileName = existingPath.split(/[\\/]/).at(-1) ?? ''
      return this.prepared(normalized, ownerHash, slot, fileName, false)
    }
    const decoded = normalized.startsWith('data:')
      ? decodeImageDataUrl(normalized)
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

  pathForReference(reference: string): string | undefined {
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
    const candidate = resolve(this.versionRoot(), ownerHash, slot, fileName)
    const root = `${resolve(this.versionRoot())}\\`
    return candidate.startsWith(root) ? candidate : undefined
  }

  removeOwner(owner: string): void {
    const target = resolve(this.versionRoot(), this.ownerHash(owner))
    const root = `${resolve(this.versionRoot())}\\`
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

function decodeImageDataUrl(value: string): DecodedImage {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i.exec(value)
  if (!match) throw new Error('图片数据格式无效。')
  const mediaType = match[1]!.toLowerCase()
  const extension = IMAGE_TYPES.get(mediaType)
  if (!extension) throw new Error('仅支持 PNG、JPEG、WebP 和 GIF 图片。')
  const encoded = match[2]!.replace(/\s+/g, '')
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) {
    throw new Error('图片数据无效或超过 64 MB。')
  }
  return { bytes, extension }
}

function decodeStoredImage(path: string): DecodedImage {
  const match = FILE_PATTERN.exec(path.split(/[\\/]/).at(-1) ?? '')
  if (!match) throw new Error('本地媒体引用无效。')
  return { bytes: readFileSync(path), extension: match[2]! }
}
