import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { resolveLocalMediaPath } from './LocalMediaStore'
import { MEDIA_FILE_PATTERN, THUMBNAIL_DIRECTORY, removeEmptyThumbnailDirectory } from './thumbnailFiles'
import { bestEffort } from '@shared/foundation/swallowedFailure'

export const LOCAL_MEDIA_CACHE_CONTROL = 'private, max-age=31536000, immutable'
const sizes = new Set([256, 512, 1024, 2048])

/** Content-addressed, disposable derivatives. No original bytes or media references change. */
export class LocalMediaThumbnails {
  private readonly pending = new Map<string, Promise<string | undefined>>()
  private active = 0
  private readonly waiting: (() => void)[] = []

  constructor(private readonly root: string) {
    // Cache maintenance must not hold the first visible avatar behind a full media-tree walk.
    void this.cleanInterruptedWrites().catch(error => console.error('Local media thumbnail maintenance failed', error))
  }

  async resolve(reference: string): Promise<string | undefined> {
    let url: URL
    try { url = new URL(reference) } catch { return undefined }
    const values = [...url.searchParams.entries()]
    if (!values.length) return resolveLocalMediaPath(this.root, reference)
    if (values.length !== 1 || values[0]![0] !== 'thumbnail' || !/^(256|512|1024|2048)$/.test(values[0]![1])) return undefined
    const size = Number(values[0]![1])
    url.search = ''
    const source = resolveLocalMediaPath(this.root, url.href)
    if (!source || !existsSync(source)) return undefined
    const key = `${source}:${size}`
    let request = this.pending.get(key)
    if (!request) {
      request = this.create(source, size).finally(() => this.pending.delete(key))
      this.pending.set(key, request)
    }
    return request
  }

  private async create(source: string, size: number): Promise<string | undefined> {
    // Bound simultaneous native decodes, not the number of images available to the user.
    await new Promise<void>(resolve => {
      const start = () => { this.active++; resolve() }
      if (this.active < 2) start()
      else this.waiting.push(start)
    })
    try {
      if (!existsSync(source)) return undefined
      const sharp = (await import('sharp')).default
      const directory = join(dirname(source), THUMBNAIL_DIRECTORY, basename(source))
      const target = join(directory, `${size}.webp`)
      if (existsSync(target)) {
        // A failed disposable-cache read is followed by eviction and regeneration
        // from the original below; it must not turn into a placeholder image.
        const metadata = await readFile(target).then(bytes => sharp(bytes, { animated: true, limitInputPixels: false }).metadata()).catch(bestEffort)
        if (metadata?.format === 'webp' && metadata.width && metadata.width <= size
            && (metadata.pageHeight || metadata.height || 0) <= size) return existsSync(source) ? target : undefined
        rmSync(target, { force: true })
      }
      let original: Buffer
      try { original = await readFile(source) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
      // Buffer input prevents libvips' file cache from retaining Windows handles after
      // decoding; deleting or replacing an avatar must remain immediately possible.
      const image = sharp(original, { animated: true, limitInputPixels: false })
      const metadata = await image.metadata()
      if (metadata.width && metadata.width <= size && (metadata.pageHeight || metadata.height || 0) <= size) return existsSync(source) ? source : undefined
      const bytes = await image.autoOrient().resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ lossless: true, effort: 2 }).toBuffer()
      // Publish synchronously after decoding; recheck afterward for a delete in the
      // separate product Host process before returning a now-retired derivative.
      if (!existsSync(source)) return undefined
      mkdirSync(directory, { recursive: true })
      const temporary = join(directory, `.${size}.${randomUUID()}.tmp`)
      try {
        writeFileSync(temporary, bytes, { flag: 'wx' })
        renameSync(temporary, target)
      } finally { rmSync(temporary, { force: true }) }
      if (!existsSync(source)) {
        rmSync(directory, { recursive: true, force: true })
        for (const empty of [dirname(directory), dirname(source), dirname(dirname(source))]) removeEmptyThumbnailDirectory(empty)
        return undefined
      }
      return target
    } finally {
      this.active--
      this.waiting.shift()?.()
    }
  }

  private async cleanInterruptedWrites(): Promise<void> {
    const versionRoot = join(this.root, 'v1')
    const entries = async (directory: string) => {
      try { return await readdir(directory, { withFileTypes: true }) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
    }
    for (const owner of await entries(versionRoot)) {
      if (!owner.isDirectory() || !/^[a-f0-9]{64}$/.test(owner.name)) continue
      for (const slot of await entries(join(versionRoot, owner.name))) {
        if (!slot.isDirectory() || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slot.name)) continue
        const sourceDirectory = join(versionRoot, owner.name, slot.name)
        const directory = join(sourceDirectory, THUMBNAIL_DIRECTORY)
        for (const original of await entries(directory)) {
          const target = join(directory, original.name)
          if (!original.isDirectory() || !MEDIA_FILE_PATTERN.test(original.name) || !existsSync(join(sourceDirectory, original.name))) {
            rmSync(target, { recursive: true, force: true }); continue
          }
          for (const file of await entries(target)) {
            if (!file.isFile() || !sizes.has(Number(file.name.replace(/\.webp$/, ''))) || !/^(256|512|1024|2048)\.webp$/.test(file.name)) {
              rmSync(join(target, file.name), { recursive: true, force: true })
            }
          }
          removeEmptyThumbnailDirectory(target)
        }
        removeEmptyThumbnailDirectory(directory)
      }
    }
  }
}
