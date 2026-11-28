import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { lstat, mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises'
import type { OutgoingHttpHeaders } from 'node:http'
import { dirname, join } from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app, type IncomingMessage } from 'electron'
import type { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor.js'
import { ELECKOI_FAILURE_CODES } from '@shared/contracts/errors/codes'
import { DesktopError } from '@shared/foundation/DesktopError'
import { recordUpdateCleanupFailure } from './dsh/update-cleanup-log.js'

type DownloadOptions = Parameters<ElectronHttpExecutor['download']>[2]
export type InstallerResponse = IncomingMessage & Readable
type Receive = (headers: OutgoingHttpHeaders, consume: (response: InstallerResponse) => Promise<void>) => Promise<void>
type Validator = { sha512: string; source: string; etag: string; size: number }
type SavedInstaller = { validator: Validator; offset: number }

class RestartFullDownload extends Error {}
class UseNativeDownload extends Error {}

/** Owns only the two files used to resume one Windows installer. */
class ResumeCache {
  readonly directory: string
  readonly part: string
  readonly validator: string

  constructor(pending: string) {
    this.directory = join(dirname(pending), 'resume')
    this.part = join(this.directory, 'installer.part')
    this.validator = join(this.directory, 'installer.json')
  }

  async exists(): Promise<boolean> {
    const directory = await statIfPresent(this.directory)
    if (directory === undefined) return false
    if (!directory.isDirectory()) {
      throw new DesktopError(ELECKOI_FAILURE_CODES.ioFailed, 'Desktop update resume path is not a directory',
        { operation: 'read update resume cache', path: this.directory })
    }
    return true
  }

  async read(): Promise<SavedInstaller | undefined> {
    if (!await this.exists()) return
    const [part, validator] = await Promise.all([statIfPresent(this.part), statIfPresent(this.validator)])
    if (!part?.isFile() || !validator?.isFile()) return
    let data: Partial<Validator> | null
    try { data = JSON.parse(await readFile(this.validator, 'utf8')) as Partial<Validator> | null } catch (error) {
      if (error instanceof SyntaxError) return
      throw error
    }
    if (typeof data?.sha512 !== 'string' || typeof data.source !== 'string' || !strongETag(data.etag) ||
      typeof data.size !== 'number' || !Number.isSafeInteger(data.size) || part.size <= 0 || part.size > data.size) return
    return { validator: { sha512: data.sha512, source: data.source, etag: data.etag, size: data.size }, offset: part.size }
  }

  async replace(validator: Validator): Promise<void> {
    await this.clear()
    await mkdir(this.directory)
    // Write the validator before opening a new part. An interrupted metadata write cannot label an older part.
    await writeFile(this.validator, JSON.stringify(validator), { flag: 'wx' })
  }

  async clear(): Promise<void> {
    if (!await this.exists()) return
    await removeIfPresent(this.validator)
    await removeIfPresent(this.part)
    await rmdir(this.directory)
  }

  report(operation: 'list' | 'remove', error: unknown): void {
    recordUpdateCleanupFailure(app.getPath('logs'), { operation, path: this.directory, error })
  }
}

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function statIfPresent(path: string) {
  try { return await lstat(path) } catch (error) { if (!missing(error)) throw error }
}

async function removeIfPresent(path: string): Promise<void> {
  try { await unlink(path) } catch (error) { if (!missing(error)) throw error }
}

function strongETag(value: unknown): value is string {
  return typeof value === 'string' && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value)
}

function positiveLength(value: unknown): number | undefined {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return
  const length = Number(value)
  return Number.isSafeInteger(length) && length > 0 ? length : undefined
}

/** Reconcile only after a successful feed check or when the coordinator has settled the target. */
export async function reconcileFullInstallerResume(pending: string, expected: readonly string[]): Promise<void> {
  const cache = new ResumeCache(pending)
  if (expected.length > 0) {
    try {
      const saved = await cache.read()
      if (saved !== undefined && expected.includes(saved.validator.sha512)) return
    } catch (error) { cache.report('list', error) }
  }
  try { await cache.clear() } catch (error) { cache.report('remove', error) }
}

/**
 * RETIRE WHEN: the locked upstream Windows full-installer updater passes interruption/restart,
 * replacement and verification tests with its own partial storage. This adapter reads and writes
 * only resume/ beside pending/ during full downloads, and retires it on target changes or success.
 * First clear residual resume/ files for supported upgrades. Then remove this adapter, the executor
 * and coordinator hooks, the cache-specific tests and the retirement entry. Keep updater flow tests.
 */
export async function downloadFullInstaller(
  url: URL,
  destination: string,
  sha512: string,
  options: DownloadOptions,
  receive: Receive,
  downloadNative: () => Promise<string>,
): Promise<string> {
  const cache = new ResumeCache(dirname(destination))
  const source = createHash('sha256').update(url.href).digest('hex')
  let partial: SavedInstaller | undefined
  try {
    partial = await cache.read()
  } catch (error) {
    cache.report('list', error)
    return downloadNative()
  }
  if (partial?.validator.sha512 !== sha512 || partial.validator.source !== source) {
    try { await cache.clear() } catch (error) {
      cache.report('remove', error)
      return downloadNative()
    }
    partial = undefined
  }

  async function transfer(saved?: SavedInstaller): Promise<void> {
    if (saved !== undefined && saved.offset === saved.validator.size) {
      options.onProgress?.({ total: saved.offset, transferred: saved.offset, delta: 0, percent: 100, bytesPerSecond: 0 })
      return
    }
    const headers: OutgoingHttpHeaders = { 'Accept-Encoding': 'identity' }
    if (saved !== undefined) {
      headers.Range = `bytes=${saved.offset}-`
      headers['If-Range'] = saved.validator.etag
    }
    await receive(headers, async response => {
      const { etag, 'content-encoding': encoding, 'content-range': range, 'content-length': length } = response.headers
      const identity = encoding === undefined || encoding === 'identity'
      let offset = 0
      let total: number
      if (saved !== undefined && response.statusCode === 206 && identity &&
        etag === saved.validator.etag && range === `bytes ${saved.offset}-${saved.validator.size - 1}/${saved.validator.size}` &&
        positiveLength(length) === saved.validator.size - saved.offset) {
        offset = saved.offset
        total = saved.validator.size
      } else if (response.statusCode === 200) {
        const size = positiveLength(length)
        if (!identity || !strongETag(etag) || size === undefined) throw new UseNativeDownload()
        try { await cache.replace({ sha512, source, etag, size }) } catch (error) {
          cache.report('remove', error)
          throw new UseNativeDownload()
        }
        total = size
      } else if (saved !== undefined && (response.statusCode === 206 || response.statusCode === 416)) {
        throw new RestartFullDownload()
      } else {
        throw new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed,
          `Cannot download the desktop installer, HTTP status ${response.statusCode}`, { operation: 'download desktop installer' })
      }
      await writePart(cache.part, response, offset, total, options.onProgress)
    })
  }

  try {
    try { await transfer(partial) } catch (error) {
      if (!(error instanceof RestartFullDownload)) throw error
      await reconcileFullInstallerResume(dirname(destination), [])
      await transfer()
    }
  } catch (error) {
    if (!(error instanceof UseNativeDownload)) throw error
    await reconcileFullInstallerResume(dirname(destination), [])
    return downloadNative()
  }

  const digest = createHash('sha512')
  for await (const chunk of createReadStream(cache.part)) digest.update(chunk)
  if (digest.digest('base64') !== sha512) {
    await reconcileFullInstallerResume(dirname(destination), [])
    throw new DesktopError(ELECKOI_FAILURE_CODES.storageCorrupt,
      'sha512 checksum mismatch for desktop installer', { what: 'desktop installer' })
  }
  await rename(cache.part, destination)
  await reconcileFullInstallerResume(dirname(destination), [])
  return destination
}

async function writePart(path: string, response: InstallerResponse, offset: number, total: number, onProgress: DownloadOptions['onProgress']): Promise<void> {
  if (offset > 0) {
    onProgress?.({ total, transferred: offset, delta: 0, percent: offset / total * 100, bytesPerSecond: 0 })
  }
  let transferred = offset
  let reported = offset
  let lastReport = performance.now()
  const started = lastReport
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      transferred += chunk.length
      if (transferred > total) {
        callback(new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed,
          'Desktop update response exceeded the declared length', { operation: 'download desktop installer' }))
        return
      }
      const now = performance.now()
      if (transferred < total && now - lastReport >= 1000) {
        onProgress?.({ total, transferred, delta: transferred - reported, percent: transferred / total * 100,
          bytesPerSecond: Math.round((transferred - offset) * 1000 / (now - started)) })
        reported = transferred
        lastReport = now
      }
      callback(null, chunk)
    },
  })
  await pipeline(response, meter, createWriteStream(path, { flags: offset === 0 ? 'wx' : 'a' }))
  if (transferred !== total) {
    throw new DesktopError(ELECKOI_FAILURE_CODES.netOperationFailed,
      'Desktop update response ended before the declared length', { operation: 'download desktop installer' })
  }
  onProgress?.({ total, transferred, delta: transferred - reported, percent: 100,
    bytesPerSecond: Math.round((transferred - offset) * 1000 / Math.max(1, performance.now() - started)) })
}
